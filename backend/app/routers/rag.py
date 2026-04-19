from fastapi import APIRouter

from ..db import db_cursor, now_iso
from ..schemas import OcrIngestRequest, RagIngestRequest

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
