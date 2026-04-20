import re

from fastapi import APIRouter

from ..schemas import AgentAskRequest, AgentAskResponse
from ..services.llm_service import llm_service
from ..services.rag_service import resolve_file_hint, retrieve_file_rag_context, retrieve_rag_context

router = APIRouter(prefix="/agent", tags=["agent"])


_SOURCE_LABEL = {
    "text": "文本",
    "file_text": "文件正文",
    "file_meta": "文件信息",
    "file_stub": "文件",
    "link": "链接",
    "link_summary": "链接摘要",
    "ocr": "图片OCR",
}


def _clean_evidence_text(text: str) -> str:
    raw = (text or "").strip()
    if not raw:
        return ""
    cleaned = re.sub(r"\[quote\].*?\[/quote\]\s*", "", raw, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"^引用内容：.*(?:\n|$)", "", cleaned).strip()
    return cleaned


def _extract_user_question(raw_question: str) -> str:
    text = (raw_question or "").strip()
    if not text:
        return ""
    m = re.search(r"用户问题：\s*(.+)$", text, flags=re.DOTALL)
    if m:
        return m.group(1).strip()
    return text


def _extract_quoted_file_name(raw_question: str) -> str:
    text = (raw_question or "").strip()
    if not text:
        return ""
    m = re.search(r"文件[:：]\s*([^\n\r]+?\.[A-Za-z0-9]{1,8})", text)
    if m:
        return (
            m.group(1)
            .strip()
            .strip("`'\"“”‘’[]()（）【】")
            .rstrip(",，。;；:：!?！？")
        )
    return ""


@router.post("/ask", response_model=AgentAskResponse, summary="Single-agent memory QA with RAG")
def ask(payload: AgentAskRequest):
    question = payload.question.strip()
    if not question:
        return AgentAskResponse(answer="请先输入问题。", matched_dates=[], evidence=[], evidence_items=[])

    user_question = _extract_user_question(question)
    quoted_file_name = _extract_quoted_file_name(question)
    file_hint = (payload.file_name or "").strip() or quoted_file_name or resolve_file_hint(question)

    is_file_quote_mode = bool(file_hint and "引用内容：" in question)
    if is_file_quote_mode:
        contexts = retrieve_file_rag_context(file_hint, question=user_question, top_k=100)
        if not contexts:
            contexts = retrieve_rag_context(user_question or question, top_k=100, file_name=file_hint)
    else:
        contexts = retrieve_rag_context(question, top_k=100, file_name=file_hint)

    if not contexts:
        if is_file_quote_mode:
            not_found_answer = (
                f"未找到文件“{file_hint}”的可用内容（正文或RAG片段）。"
                "请先确认该文件已上传并完成解析后再提问。"
            )
        else:
            not_found_answer = f"未找到与“{question}”相关的本地存储记录。"
        return AgentAskResponse(
            answer=not_found_answer,
            matched_dates=[],
            evidence=[],
            evidence_items=[],
        )

    matched_dates = sorted({(row.get("created_at") or "")[0:10] for row in contexts if row.get("created_at")}, reverse=True)

    evidence_items = []
    evidence = []
    for row in contexts:
        source_type = row.get("source_type") or ""
        source_label = _SOURCE_LABEL.get(source_type, source_type or "记录")
        snippet = _clean_evidence_text(row.get("chunk_text") or "")[:220]
        file_name = row.get("file_name") or ""

        item = {
            "message_id": row.get("message_id"),
            "created_at": row.get("created_at"),
            "date": (row.get("created_at") or "")[:10],
            "source_type": source_type,
            "source_label": source_label,
            "file_name": file_name,
            "link_url": row.get("link_url") or "",
            "snippet": snippet,
        }
        evidence_items.append(item)

        prefix = f"[{item['date'] or '未知日期'}][{source_label}]"
        if file_name:
            prefix += f"[{file_name}]"
        evidence.append(f"{prefix} {snippet}".strip())

    context_text = "\n".join(
        [
            (
                f"- message_id={row.get('message_id')}, "
                f"date={row.get('created_at', '')}, "
                f"file={row.get('file_name', '')}, "
                f"type={_SOURCE_LABEL.get(row.get('source_type', ''), row.get('source_type', ''))}, "
                f"text={_clean_evidence_text(row.get('chunk_text', ''))}"
            )
            for row in contexts
        ]
    )

    file_mode_tip = "这是文件级问答模式：请优先总结该文件核心内容，并标注证据来源。"

    system_prompt = (
        "你是桌面文件助手智能体。"
        "你只能基于给定的本地RAG上下文回答，不允许编造。"
        "回答请直接给出结论，不要输出“2) 时间线证据”等结构化分节。"
        "如果证据不足，明确说证据不足。"
    )
    if is_file_quote_mode:
        user_prompt = (
            f"用户问题:\n{user_question or question}\n\n"
            f"引用文件名: {file_hint}\n"
            f"{file_mode_tip}\n\n"
            f"文件RAG上下文:\n{context_text}\n\n"
            "请基于文件上下文进行中文回答。"
        )
    else:
        user_prompt = (
            f"用户问题:\n{question}\n\n"
            f"用户指定文件名: {file_hint or '未指定'}\n"
            f"{file_mode_tip if file_hint else ''}\n\n"
            f"RAG上下文:\n{context_text}\n\n"
            "请输出中文答案。"
        )

    if is_file_quote_mode:
        if not llm_service.enabled:
            answer = "文件引用问答需要启用大模型接口（请配置 LLM_API_KEY），当前无法完成总结。"
        else:
            try:
                answer = llm_service.chat(system_prompt, user_prompt)
            except Exception as exc:
                answer = f"文件引用问答调用模型失败：{exc}"
    else:
        if llm_service.enabled:
            try:
                answer = llm_service.chat(system_prompt, user_prompt)
            except Exception as exc:
                fallback_question = user_question if is_file_quote_mode else question
                answer = (
                    "智能体调用模型失败，已回退本地总结："
                    f"{build_fallback_answer(fallback_question, contexts, file_hint)}（错误: {exc}）"
                )
        else:
            fallback_question = user_question if is_file_quote_mode else question
            answer = build_fallback_answer(fallback_question, contexts, file_hint)

    return AgentAskResponse(
        answer=answer,
        matched_dates=matched_dates,
        evidence=evidence,
        evidence_items=evidence_items,
    )


def build_fallback_answer(question: str, contexts: list[dict], file_hint: str | None) -> str:
    if file_hint:
        file_rows = [
            r
            for r in contexts
            if file_hint.lower() in (r.get("file_name") or "").lower()
            or file_hint.lower() in (r.get("chunk_text") or "").lower()
        ]
        if file_rows:
            content_rows = [
                r
                for r in file_rows
                if (r.get("source_type") in {"file_text", "ocr", "text"})
                and _clean_evidence_text(r.get("chunk_text") or "")
            ]
            snippets = "；".join(
                [_clean_evidence_text(r.get("chunk_text") or "")[:120] for r in (content_rows or file_rows)[:3]]
            )
            dates = sorted({(r.get("created_at") or "")[:10] for r in file_rows if r.get("created_at")}, reverse=True)
            normalized_q = (question or "").strip()
            if normalized_q:
                return (
                    f"针对你的问题“{normalized_q}”，"
                    f"根据文件“{file_hint}”可用内容，结论是：{snippets or '当前仅有文件元信息，缺少可读正文'}。"
                    f"相关日期：{'、'.join(dates) if dates else '未知'}。"
                )
            return (
                f"文件“{file_hint}”已命中。"
                f"摘要：{snippets}。"
                f"相关日期：{'、'.join(dates) if dates else '未知'}。"
            )

    top = contexts[0]
    dt = (top.get("created_at") or "")[:10]
    return f"本地知识库命中问题“{question}”，最近命中日期为 {dt}。"
