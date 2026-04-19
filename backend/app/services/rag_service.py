import re
import zipfile
from pathlib import Path
from urllib.parse import urlparse

from ..db import db_cursor, now_iso

_TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".log",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".yaml",
    ".yml",
    ".ini",
    ".sql",
}


def _normalize_file_hint(file_name: str) -> str:
    return (
        (file_name or "")
        .strip()
        .strip("`'\"“”‘’[]()（）【】")
        .rstrip(",，。;；:：!?！？")
    )


def _split_chunks(text: str, chunk_size: int = 800) -> list[str]:
    if not text:
        return []
    raw = text.strip()
    if not raw:
        return []
    return [raw[i : i + chunk_size] for i in range(0, len(raw), chunk_size)]


def _strip_quote_markup(text: str) -> str:
    if not text:
        return ""

    cleaned = text
    # New format: [quote]...[/quote]
    cleaned = re.sub(r"\[quote\].*?\[/quote\]\s*", "", cleaned, flags=re.IGNORECASE | re.DOTALL)

    # Legacy format:
    # 引用内容：xxxx\n正文
    if cleaned.startswith("引用内容："):
        parts = cleaned.splitlines()
        if len(parts) >= 2:
            cleaned = "\n".join(parts[1:])
        else:
            cleaned = ""

    return cleaned.strip()


def _extract_docx_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as zf:
            with zf.open("word/document.xml") as f:
                xml = f.read().decode("utf-8", errors="ignore")
        cleaned = re.sub(r"<[^>]+>", " ", xml)
        return re.sub(r"\s+", " ", cleaned).strip()
    except Exception:
        return ""


def _extract_file_text(path: Path) -> str:
    suffix = path.suffix.lower()
    try:
        if suffix in _TEXT_EXTENSIONS:
            return path.read_text(encoding="utf-8", errors="ignore")
        if suffix == ".docx":
            return _extract_docx_text(path)
    except Exception:
        return ""
    return ""


def _build_link_summary(link_url: str) -> str:
    raw = (link_url or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlparse(raw)
        host = parsed.netloc or "unknown"
        path = parsed.path or "/"
        query = f"?{parsed.query}" if parsed.query else ""
        return f"链接摘要: 域名={host}; 路径={path}{query}; 原始链接={raw}"
    except Exception:
        return f"链接摘要: 原始链接={raw}"


def _source_priority(source_type: str) -> int:
    mapping = {
        "ocr": 100,
        "file_text": 96,
        "text": 92,
        "link_summary": 90,
        "link": 86,
        "file_meta": 82,
        "file_stub": 78,
    }
    return mapping.get(source_type or "", 70)


def _keyword_snippet(text: str, tokens: list[str], max_len: int = 220) -> str:
    raw = (text or "").strip()
    if not raw:
        return ""
    lower = raw.lower()
    hit_pos = -1
    hit_token = ""
    for token in tokens:
        pos = lower.find(token.lower())
        if pos >= 0 and (hit_pos < 0 or pos < hit_pos):
            hit_pos = pos
            hit_token = token
    if hit_pos < 0:
        return ""

    token_len = max(1, len(hit_token))
    start = max(0, hit_pos - 36)
    end = min(len(raw), hit_pos + token_len + 120)
    snippet = raw[start:end].strip()
    if len(snippet) > max_len:
        snippet = snippet[:max_len].rstrip()
    return snippet


def ingest_message_rag(
    message_id: int,
    message_text: str | None,
    link_url: str | None,
    attachment: dict | None,
    created_at: str | None = None,
) -> None:
    ts = created_at or now_iso()

    rows: list[tuple[str, str]] = []
    normalized_text = _strip_quote_markup(message_text or "")
    if normalized_text:
        for chunk in _split_chunks(normalized_text):
            rows.append(("text", chunk))

    if link_url and link_url.strip():
        rows.append(("link", f"链接: {link_url.strip()}"))
        rows.append(("link_summary", _build_link_summary(link_url)))

    if attachment:
        file_name = (attachment.get("file_name") or "").strip()
        mime = (attachment.get("mime_type") or "").strip()
        size = attachment.get("size_bytes")
        storage_key = attachment.get("storage_key")

        metadata = f"文件名: {file_name}; 类型: {mime or 'unknown'}; 大小: {size or 0}"
        rows.append(("file_meta", metadata))

        if storage_key:
            file_path = Path(storage_key)
            if file_path.exists():
                extracted = _extract_file_text(file_path)
                if extracted:
                    for chunk in _split_chunks(extracted):
                        rows.append(("file_text", chunk))
                else:
                    rows.append(("file_stub", f"文件内容暂未解析，文件名: {file_name}"))

    if not rows:
        return

    with db_cursor() as (_, cursor):
        for source_type, chunk_text in rows:
            cursor.execute(
                """
                INSERT INTO rag_chunks (message_id, source_type, chunk_text, embedding_json, created_at)
                VALUES (?, ?, ?, NULL, ?)
                """,
                (message_id, source_type, chunk_text, ts),
            )
            cursor.execute(
                "INSERT INTO search_fts (content, message_id, source_type) VALUES (?, ?, ?)",
                (chunk_text, message_id, source_type),
            )


def _build_like_token_pool(question: str) -> list[str]:
    kw = (question or "").strip()
    if not kw:
        return []
    token_candidates = [t.strip() for t in re.split(r"\s+", kw) if t.strip()]
    long_tokens = [t for t in token_candidates if len(t) >= 2]
    if long_tokens:
        return long_tokens[:6]
    return [kw]


def retrieve_rag_context(question: str, top_k: int = 8, file_name: str | None = None) -> list[dict]:
    tokens = _build_like_token_pool(question)
    if not tokens:
        return []

    with db_cursor() as (_, cursor):
        where_parts: list[str] = []
        params: list[str] = []

        token_clauses = []
        for token in tokens:
            token_clauses.append(
                "(rc.chunk_text LIKE ? OR a.file_name LIKE ? OR l.url LIKE ? OR l.title LIKE ?)"
            )
            like = f"%{token}%"
            params.extend([like, like, like, like])
        where_parts.append(f"({' OR '.join(token_clauses)})")

        if file_name:
            like_file = f"%{file_name}%"
            where_parts.append("(a.file_name LIKE ? OR rc.chunk_text LIKE ?)")
            params.extend([like_file, like_file])

        where_sql = " AND ".join(where_parts)

        cursor.execute(
            f"""
            SELECT DISTINCT
                m.id AS message_id,
                m.created_at,
                m.text_plain,
                rc.source_type,
                rc.chunk_text,
                a.id AS attachment_id,
                a.file_name,
                a.storage_key,
                l.url AS link_url
            FROM rag_chunks rc
            JOIN messages m ON m.id = rc.message_id
            LEFT JOIN attachments a ON a.message_id = m.id
            LEFT JOIN links l ON l.message_id = m.id
            WHERE {where_sql}
            ORDER BY datetime(m.created_at) DESC
            LIMIT ?
            """,
            tuple(params + [top_k * 4]),
        )
        raw_rows = [dict(r) for r in cursor.fetchall()]

        if not raw_rows:
            # Fallback for historical records not yet ingested into rag_chunks:
            # still enforce keyword-based matching, and only return matched snippets.
            msg_where = []
            msg_params: list[str] = []
            for token in tokens:
                msg_where.append("(m.text_plain LIKE ?)")
                msg_params.append(f"%{token}%")
            msg_where_sql = " OR ".join(msg_where) if msg_where else "1=0"

            cursor.execute(
                f"""
                SELECT
                    m.id AS message_id,
                    m.created_at,
                    m.text_plain
                FROM messages m
                WHERE ({msg_where_sql})
                ORDER BY datetime(m.created_at) DESC
                LIMIT ?
                """,
                tuple(msg_params + [top_k * 3]),
            )
            matched_messages = [dict(r) for r in cursor.fetchall()]

            fallback_rows: list[dict] = []
            for item in matched_messages:
                snippet = _keyword_snippet(item.get("text_plain") or "", tokens)
                if not snippet:
                    continue
                fallback_rows.append(
                    {
                        "message_id": item.get("message_id"),
                        "created_at": item.get("created_at"),
                        "text_plain": item.get("text_plain"),
                        "source_type": "text",
                        "chunk_text": snippet,
                        "attachment_id": None,
                        "file_name": "",
                        "storage_key": "",
                        "link_url": "",
                    }
                )
                if len(fallback_rows) >= top_k:
                    break
            return fallback_rows

    lower_tokens = [t.lower() for t in tokens]
    lower_file = (file_name or "").lower().strip()

    scored_rows: list[tuple[int, str, dict]] = []
    for row in raw_rows:
        chunk_text = (row.get("chunk_text") or "").lower()
        file_text = (row.get("file_name") or "").lower()
        link_text = (row.get("link_url") or "").lower()

        token_hits = sum(
            1
            for token in lower_tokens
            if token in chunk_text or token in file_text or token in link_text
        )
        file_bonus = 8 if lower_file and (lower_file in file_text or lower_file in chunk_text) else 0
        score = token_hits * 10 + _source_priority(row.get("source_type") or "") + file_bonus
        scored_rows.append((score, row.get("created_at") or "", row))

    scored_rows.sort(key=lambda x: (x[0], x[1]), reverse=True)

    rows: list[dict] = []
    seen: set[tuple[int, str]] = set()
    for _, __, row in scored_rows:
        # keep diversified evidence per message+source type
        key = (row["message_id"], row.get("source_type") or "")
        if key in seen:
            continue
        seen.add(key)
        rows.append(row)
        if len(rows) >= top_k:
            break

    return rows


def resolve_file_hint(question: str) -> str | None:
    q = (question or "").strip()
    if not q:
        return None

    m = re.search(r"([^\s\n\r]+?\.[A-Za-z0-9]{1,8})", q)
    if m:
        return _normalize_file_hint(m.group(1))

    return None


def retrieve_file_rag_context(file_name: str, question: str = "", top_k: int = 10) -> list[dict]:
    normalized_file = _normalize_file_hint(file_name)
    if not normalized_file:
        return []

    question_tokens = _build_like_token_pool(question)
    lower_tokens = [t.lower() for t in question_tokens]

    with db_cursor() as (_, cursor):
        like_file = f"%{normalized_file}%"
        cursor.execute(
            """
            SELECT DISTINCT
                m.id AS message_id,
                m.created_at,
                m.text_plain,
                rc.source_type,
                rc.chunk_text,
                a.id AS attachment_id,
                a.file_name,
                a.storage_key,
                l.url AS link_url
            FROM rag_chunks rc
            JOIN messages m ON m.id = rc.message_id
            JOIN attachments a ON a.message_id = m.id
            LEFT JOIN links l ON l.message_id = m.id
            WHERE a.file_name LIKE ?
            ORDER BY datetime(m.created_at) DESC
            LIMIT ?
            """,
            (like_file, max(top_k * 6, 24)),
        )
        raw_rows = [dict(r) for r in cursor.fetchall()]

    def _runtime_extract_rows(items: list[dict]) -> list[dict]:
        dynamic_rows: list[dict] = []
        for item in items:
            storage_key = (item.get("storage_key") or "").strip()
            if not storage_key:
                continue
            file_path = Path(storage_key)
            if not file_path.exists():
                continue
            extracted = _extract_file_text(file_path)
            if not extracted:
                continue
            for chunk in _split_chunks(extracted)[:2]:
                dynamic_rows.append(
                    {
                        "message_id": item.get("message_id"),
                        "created_at": item.get("created_at"),
                        "text_plain": item.get("text_plain") or "",
                        "source_type": "file_text",
                        "chunk_text": chunk,
                        "attachment_id": item.get("attachment_id"),
                        "file_name": item.get("file_name") or normalized_file,
                        "storage_key": storage_key,
                        "link_url": "",
                    }
                )
            if len(dynamic_rows) >= max(top_k, 6):
                break
        return dynamic_rows

    if not raw_rows:
        with db_cursor() as (_, cursor):
            like_file = f"%{normalized_file}%"
            cursor.execute(
                """
                SELECT
                    m.id AS message_id,
                    m.created_at,
                    m.text_plain,
                    a.id AS attachment_id,
                    a.file_name,
                    a.storage_key
                FROM attachments a
                JOIN messages m ON m.id = a.message_id
                WHERE a.file_name LIKE ?
                ORDER BY datetime(m.created_at) DESC
                LIMIT ?
                """,
                (like_file, max(top_k * 3, 12)),
            )
            fallback_attachment_rows = [dict(r) for r in cursor.fetchall()]

        if not fallback_attachment_rows:
            return []

        runtime_rows = _runtime_extract_rows(fallback_attachment_rows)
        if runtime_rows:
            return runtime_rows[:top_k]

        fallback_rows: list[dict] = []
        for item in fallback_attachment_rows:
            message_text = (item.get("text_plain") or "").strip()
            if message_text:
                fallback_rows.append(
                    {
                        "message_id": item.get("message_id"),
                        "created_at": item.get("created_at"),
                        "text_plain": message_text,
                        "source_type": "text",
                        "chunk_text": _keyword_snippet(message_text, question_tokens) or message_text[:220],
                        "attachment_id": item.get("attachment_id"),
                        "file_name": item.get("file_name") or normalized_file,
                        "storage_key": item.get("storage_key") or "",
                        "link_url": "",
                    }
                )
            fallback_rows.append(
                {
                    "message_id": item.get("message_id"),
                    "created_at": item.get("created_at"),
                    "text_plain": item.get("text_plain") or "",
                    "source_type": "file_meta",
                    "chunk_text": f"文件名: {item.get('file_name') or normalized_file}",
                    "attachment_id": item.get("attachment_id"),
                    "file_name": item.get("file_name") or normalized_file,
                    "storage_key": item.get("storage_key") or "",
                    "link_url": "",
                }
            )
            if len(fallback_rows) >= top_k:
                break
        return fallback_rows[:top_k]

    has_readable_content = any(
        (row.get("source_type") in {"file_text", "ocr"}) and (row.get("chunk_text") or "").strip()
        for row in raw_rows
    )
    if not has_readable_content:
        attachment_rows: list[dict] = []
        seen_attachment: set[int] = set()
        for row in raw_rows:
            aid = row.get("attachment_id")
            if not aid or aid in seen_attachment:
                continue
            seen_attachment.add(aid)
            attachment_rows.append(row)
        raw_rows.extend(_runtime_extract_rows(attachment_rows))

    scored_rows: list[tuple[int, str, dict]] = []
    for row in raw_rows:
        chunk_text = (row.get("chunk_text") or "").lower()
        token_hits = sum(1 for token in lower_tokens if token in chunk_text)
        # 文件问答场景下，更看重 file_text / ocr 等可读正文来源
        score = _source_priority(row.get("source_type") or "") + token_hits * 12
        scored_rows.append((score, row.get("created_at") or "", row))

    scored_rows.sort(key=lambda x: (x[0], x[1]), reverse=True)

    rows: list[dict] = []
    seen: set[tuple[int, str, str]] = set()
    for _, __, row in scored_rows:
        key = (
            row.get("message_id") or 0,
            row.get("source_type") or "",
            (row.get("chunk_text") or "")[:120],
        )
        if key in seen:
            continue
        seen.add(key)
        rows.append(row)
        if len(rows) >= top_k:
            break

    return rows
