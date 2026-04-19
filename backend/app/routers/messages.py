from fastapi import APIRouter, HTTPException

from ..db import db_cursor, now_iso
from ..schemas import MessageBundleCreate
from ..services.temp_token_service import temp_token_service

router = APIRouter(prefix="/messages", tags=["messages"])


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


@router.delete("/{message_id}", summary="Delete a message by id")
def delete_message(message_id: int):
    with db_cursor() as (_, cursor):
        cursor.execute("SELECT id FROM messages WHERE id = ?", (message_id,))
        exists = cursor.fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="message not found")

        # FTS table has no FK constraint, remove index rows manually first.
        cursor.execute("DELETE FROM search_fts WHERE message_id = ?", (message_id,))
        cursor.execute("DELETE FROM messages WHERE id = ?", (message_id,))

    return {"ok": True, "message_id": message_id}
