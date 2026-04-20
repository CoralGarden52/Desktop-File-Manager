import React, { useEffect, useMemo, useState } from "react";
import { formatDateTimeBeijing } from "../utils";

export default function AgentDrawer({
  open,
  sessions,
  activeSessionId,
  loading,
  onClose,
  onCreateSession,
  onSwitchSession,
  onTogglePinSession,
  onDeleteSession,
  onSend,
  onJumpToMessage,
}) {
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const [draft, setDraft] = useState("");
  const [menuState, setMenuState] = useState({ visible: false, x: 0, y: 0, sessionId: null });

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === menuState.sessionId) || null,
    [sessions, menuState.sessionId]
  );

  useEffect(() => {
    if (!menuState.visible) return undefined;
    const closeMenu = () => setMenuState({ visible: false, x: 0, y: 0, sessionId: null });
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menuState.visible]);

  useEffect(() => {
    if (!open && menuState.visible) {
      setMenuState({ visible: false, x: 0, y: 0, sessionId: null });
    }
  }, [open, menuState.visible]);

  const submit = async () => {
    const q = draft.trim();
    if (!q || loading) return;
    await onSend?.(q);
    setDraft("");
  };

  const openSessionMenu = (event, sessionId) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 124;
    const menuHeight = 88;
    const x = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8);
    const y = Math.min(rect.bottom + 6, window.innerHeight - menuHeight - 8);
    setMenuState({ visible: true, x: Math.max(8, x), y: Math.max(8, y), sessionId });
  };

  const closeSessionMenu = () => {
    setMenuState({ visible: false, x: 0, y: 0, sessionId: null });
  };

  const handleTogglePin = () => {
    if (!menuState.sessionId) return;
    onTogglePinSession?.(menuState.sessionId);
    closeSessionMenu();
  };

  const handleDeleteSession = () => {
    if (!menuState.sessionId) return;
    onDeleteSession?.(menuState.sessionId);
    closeSessionMenu();
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
              <div key={s.id} className={`agent-session-item ${s.id === activeSessionId ? "is-active" : ""}`}>
                <button type="button" className="agent-session-main" onClick={() => onSwitchSession?.(s.id)}>
                  <div className="agent-session-name">
                    {s.pinnedAt ? <span className="agent-session-pin">置顶</span> : null}
                    {s.title || "未命名会话"}
                  </div>
                  <div className="agent-session-time">{formatDateTimeBeijing(s.updatedAt || s.createdAt || "")}</div>
                </button>
                <button
                  type="button"
                  className="agent-session-more"
                  aria-label="会话操作"
                  onClick={(event) => openSessionMenu(event, s.id)}
                >
                  ⋯
                </button>
              </div>
            ))}
          </section>

          <section className="agent-chat-area">
            <div className="agent-msg-list">
              {!activeSession ? <div className="empty-block">先新建会话并提问。</div> : null}

              {activeSession?.messages?.map((msg) => {
                const parsed = parseDrawerMessage(msg);
                const roleClass = msg.role === "user" ? "is-user" : "is-assistant";
                return (
                  <div key={msg.id} className={`agent-msg-wrap ${roleClass}`}>
                    <article className={`agent-msg ${roleClass}`}>
                      <div className="agent-msg-role">{msg.role === "user" ? "你" : "桌面文件助手"}</div>
                      {parsed.mainText ? <div className="agent-msg-text">{parsed.mainText}</div> : null}

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
                    {msg.role === "user" && parsed.quoteText ? (
                      <div className="agent-user-quote">{parsed.quoteText}</div>
                    ) : null}
                  </div>
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
      {menuState.visible ? (
        <div className="chat-context-menu" style={{ left: `${menuState.x}px`, top: `${menuState.y}px` }} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="chat-context-btn" onClick={handleTogglePin}>
            {selectedSession?.pinnedAt ? "取消置顶" : "置顶会话"}
          </button>
          <button type="button" className="chat-context-delete" onClick={handleDeleteSession}>
            删除会话
          </button>
        </div>
      ) : null}
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
