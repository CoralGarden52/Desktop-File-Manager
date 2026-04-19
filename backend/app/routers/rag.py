from fastapi import APIRouter

from ..db import db_cursor, now_iso
from ..schemas import OcrIngestRequest, RagIngestRequest
from ..services.rag_service import ingest_message_rag

router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/ocr-ingest", summary="Ingest OCR result and push to search/rag")
def ocr_ingest(payload: OcrIngestRequest):
    created_at = now_iso()
    with db_cursor() as (_, cursor):
        cursor.execute(
            """
            INSERT INTO ocr_results (attachment_id, ocr_text, confidence, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (payload.attachment_id, payload.ocr_text, payload.confidence, created_at),
        )

        cursor.execute(
            "SELECT message_id FROM attachments WHERE id = ?", (payload.attachment_id,)
        )
        row = cursor.fetchone()
        if row:
            message_id = row["message_id"]
            cursor.execute(
                """
                INSERT INTO rag_chunks (message_id, source_type, chunk_text, embedding_json, created_at)
                VALUES (?, 'ocr', ?, NULL, ?)
                """,
                (message_id, payload.ocr_text, created_at),
            )
            cursor.execute(
                "INSERT INTO search_fts (content, message_id, source_type) VALUES (?, ?, 'ocr')",
                (payload.ocr_text, message_id),
            )

    return {"ok": True}


@router.post("/ingest", summary="Generic RAG ingest endpoint")
def rag_ingest(payload: RagIngestRequest):
    created_at = now_iso()
    with db_cursor() as (_, cursor):
        cursor.execute(
            """
            INSERT INTO rag_chunks (message_id, source_type, chunk_text, embedding_json, created_at)
            VALUES (?, ?, ?, NULL, ?)
            """,
            (payload.message_id, payload.source_type, payload.chunk_text, created_at),
        )
        cursor.execute(
            "INSERT INTO search_fts (content, message_id, source_type) VALUES (?, ?, ?)",
            (payload.chunk_text, payload.message_id, payload.source_type),
        )

    return {"ok": True}


@router.post("/ingest-message", summary="Ingest a full message into RAG")
def ingest_message(message_id: int):
    with db_cursor() as (_, cursor):
        cursor.execute("SELECT text_plain, created_at FROM messages WHERE id = ?", (message_id,))
        m = cursor.fetchone()
        if not m:
            return {"ok": False, "reason": "message not found"}

        cursor.execute("SELECT url FROM links WHERE message_id = ? ORDER BY id DESC LIMIT 1", (message_id,))
        l = cursor.fetchone()
        cursor.execute(
            "SELECT file_name, mime_type, size_bytes, storage_key, sha256 FROM attachments WHERE message_id = ? ORDER BY id DESC LIMIT 1",
            (message_id,),
        )
        a = cursor.fetchone()

    ingest_message_rag(
        message_id=message_id,
        message_text=m["text_plain"],
        link_url=l["url"] if l else None,
        attachment=dict(a) if a else None,
        created_at=m["created_at"],
    )
    return {"ok": True}
