from fastapi import APIRouter

from ..db import db_cursor
from ..schemas import SearchQuery

router = APIRouter(prefix="/search", tags=["search"])


@router.post("", summary="Search by date/file/link/keyword")
def search(payload: SearchQuery):
    where_parts = []
    params = []

    base_sql = """
    SELECT DISTINCT m.id, m.msg_type, m.text_plain, m.created_at
    FROM messages m
    LEFT JOIN attachments a ON a.message_id = m.id
    LEFT JOIN links l ON l.message_id = m.id
    LEFT JOIN search_fts f ON f.message_id = m.id
    """

    if payload.date_from:
        where_parts.append("datetime(m.created_at) >= datetime(?)")
        params.append(payload.date_from)
    if payload.date_to:
        where_parts.append("datetime(m.created_at) <= datetime(?)")
        params.append(payload.date_to)
    if payload.date_exact:
        where_parts.append("date(m.created_at) = date(?)")
        params.append(payload.date_exact)
    if payload.file_name:
        where_parts.append("a.file_name LIKE ?")
        params.append(f"%{payload.file_name}%")
    if payload.link_domain:
        where_parts.append("(l.domain LIKE ? OR l.url LIKE ?)")
        params.extend([f"%{payload.link_domain}%", f"%{payload.link_domain}%"])
    if payload.keyword:
        where_parts.append("(m.text_plain LIKE ? OR f.content LIKE ? OR a.file_name LIKE ? OR l.url LIKE ? OR l.title LIKE ?)")
        params.extend([
            f"%{payload.keyword}%",
            f"%{payload.keyword}%",
            f"%{payload.keyword}%",
            f"%{payload.keyword}%",
            f"%{payload.keyword}%",
        ])

    if payload.content_type == "file":
        where_parts.append("a.id IS NOT NULL")
        where_parts.append("(a.mime_type IS NULL OR (a.mime_type NOT LIKE 'image/%' AND a.mime_type NOT LIKE 'video/%'))")
    elif payload.content_type == "image_video":
        where_parts.append(
            """
            a.id IS NOT NULL AND (
                a.mime_type LIKE 'image/%' OR
                a.mime_type LIKE 'video/%' OR
                lower(a.file_name) LIKE '%.png' OR
                lower(a.file_name) LIKE '%.jpg' OR
                lower(a.file_name) LIKE '%.jpeg' OR
                lower(a.file_name) LIKE '%.gif' OR
                lower(a.file_name) LIKE '%.webp' OR
                lower(a.file_name) LIKE '%.mp4' OR
                lower(a.file_name) LIKE '%.mov' OR
                lower(a.file_name) LIKE '%.avi' OR
                lower(a.file_name) LIKE '%.mkv'
            )
            """
        )
    elif payload.content_type == "link":
        where_parts.append("l.id IS NOT NULL")
    elif payload.content_type == "date" and not payload.date_exact:
        where_parts.append("1 = 0")

    where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
    query_sql = f"{base_sql} {where_sql} ORDER BY datetime(m.created_at) DESC LIMIT 200"

    with db_cursor() as (_, cursor):
        cursor.execute(query_sql, tuple(params))
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
                ORDER BY id DESC
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
                ORDER BY id DESC
                """,
                tuple(message_ids),
            )
            for item in cursor.fetchall():
                data = dict(item)
                links_map.setdefault(data["message_id"], []).append(data)

        for row in rows:
            row["attachments"] = attachments_map.get(row["id"], [])
            row["links"] = links_map.get(row["id"], [])

    return {"items": rows, "count": len(rows)}
