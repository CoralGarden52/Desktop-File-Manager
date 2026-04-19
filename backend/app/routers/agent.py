from fastapi import APIRouter

from ..db import db_cursor
from ..schemas import AgentAskRequest, AgentAskResponse

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/ask", response_model=AgentAskResponse, summary="Single-agent memory QA")
def ask(payload: AgentAskRequest):
    keyword = payload.question.strip()

    sql = """
    SELECT m.created_at, m.text_plain, f.content
    FROM messages m
    LEFT JOIN search_fts f ON f.message_id = m.id
    WHERE (m.text_plain LIKE ? OR f.content LIKE ?)
    ORDER BY datetime(m.created_at) DESC
    LIMIT 5
    """
    like_kw = f"%{keyword}%"

    with db_cursor() as (_, cursor):
        cursor.execute(sql, (like_kw, like_kw))
        rows = [dict(r) for r in cursor.fetchall()]

    if not rows:
        return AgentAskResponse(
            answer=f"未找到与“{payload.question}”相关的本地存储记录。",
            matched_dates=[],
            evidence=[],
        )

    matched_dates = sorted({row["created_at"][0:10] for row in rows if row.get("created_at")}, reverse=True)
    evidence = []
    for row in rows:
        snippet = (row.get("text_plain") or row.get("content") or "").strip()
        if snippet:
            evidence.append(snippet[:120])

    answer = (
        f"有存储过与“{payload.question}”相关的信息。"
        f"命中日期：{', '.join(matched_dates[:5])}。"
        f"可继续问“这个文件说了什么”，我会基于已入库内容给出摘要。"
    )

    return AgentAskResponse(answer=answer, matched_dates=matched_dates, evidence=evidence[:5])
