import React, { useMemo, useState } from "react";
import { formatDateTimeBeijing } from "../utils";

export default function AgentDrawer({
  open,
  sessions,
  activeSessionId,
  loading,
  onClose,
  onCreateSession,
  onSwitchSession,
  onSend,
  onJumpToMessage,
}) {
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const [draft, setDraft] = useState("");

  const submit = async () => {
    const q = draft.trim();
    if (!q || loading) return;
    await onSend?.(q);
    setDraft("");
  };

  return (
    <>
      {open ? <div className="agent-drawer-mask" onClick={onClose} /> : null}
      <aside className={`agent-drawer ${open ? "is-open" : ""}`}>
        <div className="agent-drawer-header">
          <div className="agent-drawer-title">桌面文件助手智能体</div>
          <button type="button" className="agent-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="agent-drawer-body">
          <section className="agent-session-list">
            <button type="button" className="agent-new-session" onClick={onCreateSession}>
              + 新建会话
            </button>
            {sessions.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`agent-session-item ${s.id === activeSessionId ? "is-active" : ""}`}
                onClick={() => onSwitchSession?.(s.id)}
              >
                <div className="agent-session-name">{s.title || "未命名会话"}</div>
                <div className="agent-session-time">{formatDateTimeBeijing(s.updatedAt || s.createdAt || "")}</div>
              </button>
            ))}
          </section>

          <section className="agent-chat-area">
            <div className="agent-msg-list">
              {!activeSession ? <div className="empty-block">先新建会话并提问。</div> : null}

              {activeSession?.messages?.map((msg) => {
                const parsed = parseDrawerMessage(msg);
                return (
                <article key={msg.id} className={`agent-msg ${msg.role === "user" ? "is-user" : "is-assistant"}`}>
                  <div className="agent-msg-role">{msg.role === "user" ? "你" : "桌面文件助手"}</div>
                  <div className="agent-msg-text">{parsed.mainText}</div>
                  {msg.role === "user" && parsed.quoteText ? (
                    <div className="agent-user-quote">{parsed.quoteText}</div>
                  ) : null}

                  {msg.matched_dates?.length ? <div className="agent-msg-sub">命中日期：{msg.matched_dates.join("、")}</div> : null}

                  {msg.evidence_items?.length ? (
                    <div className="agent-evidence-list">
                      {msg.evidence_items.map((item, idx) => (
                        <button
                          type="button"
                          key={`${msg.id}-${item.message_id || "m"}-${idx}`}
                          className="agent-evidence-item"
                          onClick={() => item.message_id && onJumpToMessage?.(item.message_id)}
                        >
                          <div className="agent-evidence-head">
                            <span>{item.source_label || item.source_type || "证据"}</span>
                            <span>{formatDateTimeBeijing(item.created_at || "") || item.date || ""}</span>
                          </div>
                          <div className="agent-evidence-snippet">{item.snippet || ""}</div>
                          <div className="agent-evidence-jump">定位原消息</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
                );
              })}

              {loading ? <div className="agent-thinking">智能体思考中...</div> : null}
            </div>

            <div className="agent-input-bar">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder=""
              />
              <button type="button" onClick={submit} disabled={loading || !draft.trim()}>
                发送
              </button>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

function parseDrawerMessage(msg) {
  const raw = (msg?.text || "").trim();
  if (!raw) return { mainText: "", quoteText: "" };

  const splitMark = "\n\n引用内容：";
  const splitIdx = raw.indexOf(splitMark);
  if (splitIdx >= 0) {
    return {
      mainText: raw.slice(0, splitIdx).trim(),
      quoteText: raw.slice(splitIdx + 2).trim(),
    };
  }

  if (raw.startsWith("引用内容：") && raw.includes("\n用户问题：")) {
    const normalized = raw.replace(/^引用内容：/u, "");
    const idx = normalized.indexOf("\n用户问题：");
    return {
      mainText: normalized.slice(idx + 6).trim() || raw,
      quoteText: `引用内容：${normalized.slice(0, idx).trim()}`,
    };
  }

  return { mainText: raw, quoteText: "" };
}
