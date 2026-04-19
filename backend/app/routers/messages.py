import hashlib
import re
import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import FILES_DIR
from ..db import db_cursor, now_iso
from ..schemas import MessageBundleCreate
from ..services.rag_service import ingest_message_rag
from ..services.temp_token_service import temp_token_service

router = APIRouter(prefix="/messages", tags=["messages"])


def _safe_resolve_storage_path(storage_key: str) -> Path:
    candidate = Path(storage_key)
    if not candidate.is_absolute():
        candidate = FILES_DIR / candidate
    resolved = candidate.resolve()
    root = FILES_DIR.resolve()
    if root not in resolved.parents and resolved != root:
        raise HTTPException(status_code=400, detail="invalid storage path")
    return resolved


def _hash_file(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def _sanitize_filename(file_name: str) -> str:
    name = Path(file_name or "").name.strip()
    if not name:
        return "unnamed"
    name = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "_", name)
    name = name.rstrip(" .")
    return name or "unnamed"


def _allocate_target_path(file_name: str) -> Path:
    safe_name = _sanitize_filename(file_name)
    stem = Path(safe_name).stem or "unnamed"
    suffix = Path(safe_name).suffix
    root = FILES_DIR.resolve()

    candidate = (FILES_DIR / safe_name).resolve()
    if root not in candidate.parents and candidate != root:
        raise HTTPException(status_code=400, detail="invalid target path")
    if not candidate.exists():
        return candidate

    idx = 1
    while True:
        candidate = (FILES_DIR / f"{stem} ({idx}){suffix}").resolve()
        if root not in candidate.parents and candidate != root:
            raise HTTPException(status_code=400, detail="invalid target path")
        if not candidate.exists():
            return candidate
        idx += 1


@router.post("/upload", summary="Upload a file into local storage")
def upload_file(file: UploadFile = File(...)):
    original_name = _sanitize_filename(file.filename or "unnamed")
    target_path = _allocate_target_path(original_name)

    with target_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    size_bytes = target_path.stat().st_size
    sha256 = _hash_file(target_path)

    return {
        "file_name": original_name,
        "mime_type": file.content_type,
        "size_bytes": size_bytes,
        "storage_key": str(target_path),
        "sha256": sha256,
    }


@router.post("", summary="Create message with optional attachment/link")
def create_message(payload: MessageBundleCreate):
    created_at = payload.message.created_at or now_iso()

    with db_cursor() as (_, cursor):
        cursor.execute(
            """
            INSERT INTO messages (msg_type, text_plain, created_at, has_attachment, has_link)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                payload.message.msg_type,
                payload.message.text,
                created_at,
                1 if payload.attachment else 0,
                1 if payload.link else 0,
            ),
        )
        message_id = cursor.lastrowid

        attachment_id = None
        temp_token = None
        if payload.attachment:
            cursor.execute(
                """
                INSERT INTO attachments (message_id, file_name, mime_type, size_bytes, storage_key, sha256, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message_id,
                    payload.attachment.file_name,
                    payload.attachment.mime_type,
                    payload.attachment.size_bytes,
                    payload.attachment.storage_key,
                    payload.attachment.sha256,
                    created_at,
                ),
            )
            attachment_id = cursor.lastrowid
            if payload.attachment.storage_key:
                temp_token = temp_token_service.issue(payload.attachment.storage_key)

        if payload.link:
            cursor.execute(
                """
                INSERT INTO links (message_id, url, domain, title, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    message_id,
                    payload.link.url,
                    payload.link.domain,
                    payload.link.title,
                    created_at,
                ),
            )

        searchable = " ".join(
            [
                payload.message.text or "",
                payload.attachment.file_name if payload.attachment else "",
                payload.link.url if payload.link else "",
                payload.link.title if payload.link and payload.link.title else "",
            ]
        ).strip()

        if searchable:
            cursor.execute(
                "INSERT INTO search_fts (content, message_id, source_type) VALUES (?, ?, ?)",
                (searchable, message_id, payload.message.msg_type),
            )

    ingest_message_rag(
        message_id=message_id,
        message_text=payload.message.text,
        link_url=payload.link.url if payload.link else None,
        attachment=payload.attachment.model_dump() if payload.attachment else None,
        created_at=created_at,
    )

    return {
        "message_id": message_id,
        "attachment_id": attachment_id,
        "temp_token": temp_token,
        "created_at": created_at,
    }


@router.get("", summary="List latest messages")
def list_messages(limit: int = 50):
    with db_cursor() as (_, cursor):
        cursor.execute(
            """
            SELECT id, msg_type, text_plain, created_at, has_attachment, has_link
            FROM (
                SELECT id, msg_type, text_plain, created_at, has_attachment, has_link
                FROM messages
                ORDER BY datetime(created_at) DESC
                LIMIT ?
            )
            ORDER BY datetime(created_at) ASC
            """,
            (limit,),
        )
        rows = [dict(row) for row in cursor.fetchall()]

        message_ids = [row["id"] for row in rows]
        attachments_map = {}
        links_map = {}
        if message_ids:
            placeholders = ",".join(["?"] * len(message_ids))
            cursor.execute(
                f"""
                SELECT id, message_id, file_name, mime_type, size_bytes, storage_key, sha256, created_at
                FROM attachments
                WHERE message_id IN ({placeholders})
                """,
                tuple(message_ids),
            )
            for item in cursor.fetchall():
                data = dict(item)
                attachments_map.setdefault(data["message_id"], []).append(data)

            cursor.execute(
                f"""
                SELECT id, message_id, url, domain, title, created_at
                FROM links
                WHERE message_id IN ({placeholders})
                """,
                tuple(message_ids),
            )
            for item in cursor.fetchall():
                data = dict(item)
                links_map.setdefault(data["message_id"], []).append(data)

        for row in rows:
            row["attachments"] = attachments_map.get(row["id"], [])
            row["links"] = links_map.get(row["id"], [])

    return {"items": rows}


@router.get("/temp/{token}", summary="Resolve temporary token")
def resolve_temp_token(token: str):
    storage_key = temp_token_service.resolve(token)
    if not storage_key:
        raise HTTPException(status_code=404, detail="token expired or invalid")
    return {"storage_key": storage_key}


@router.post("/attachments/{attachment_id}/show-in-folder", summary="Show attachment in system folder")
def show_in_folder(attachment_id: int):
    with db_cursor() as (_, cursor):
        cursor.execute("SELECT storage_key FROM attachments WHERE id = ?", (attachment_id,))
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="attachment not found")

    file_path = _safe_resolve_storage_path(row["storage_key"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="file not found on disk")

    try:
        subprocess.run(["explorer", f"/select,{str(file_path)}"], check=False)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed to open folder: {exc}") from exc

    return {"ok": True}


@router.delete("/{message_id}", summary="Delete a message by id")
def delete_message(message_id: int):
    file_paths: list[Path] = []

    with db_cursor() as (_, cursor):
        cursor.execute("SELECT id FROM messages WHERE id = ?", (message_id,))
        exists = cursor.fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="message not found")

        cursor.execute("SELECT storage_key FROM attachments WHERE message_id = ?", (message_id,))
        for row in cursor.fetchall():
            storage_key = row["storage_key"]
            if storage_key:
                try:
                    file_paths.append(_safe_resolve_storage_path(storage_key))
                except HTTPException:
                    continue

        cursor.execute("DELETE FROM search_fts WHERE message_id = ?", (message_id,))
        cursor.execute("DELETE FROM messages WHERE id = ?", (message_id,))

    for path in file_paths:
        try:
            if path.exists():
                path.unlink()
        except OSError:
            pass

    return {"ok": True, "message_id": message_id}
