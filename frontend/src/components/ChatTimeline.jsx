import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatTime, groupByDay } from "../utils";

export default function ChatTimeline({
  messages,
  onDeleteMessage,
  onShowInFolder,
  onQuoteToComposer,
  onQuoteToAgent,
  jumpToMessageId,
  onJumpHandled,
}) {
  const groups = groupByDay(messages);
  const timelineRef = useRef(null);
  const messageRefs = useRef(new Map());
  const [highlightId, setHighlightId] = useState(null);
  const [menuState, setMenuState] = useState({
    visible: false,
    x: 0,
    y: 0,
    messageId: null,
    attachmentId: null,
    quoteText: "",
  });

  useEffect(() => {
    const node = timelineRef.current;
    if (!node || jumpToMessageId) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, jumpToMessageId]);

  useEffect(() => {
    if (!jumpToMessageId) return;
    const targetNode = messageRefs.current.get(jumpToMessageId);
    if (targetNode) {
      targetNode.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(jumpToMessageId);
      window.setTimeout(() => setHighlightId(null), 1600);
    }
    onJumpHandled?.();
  }, [jumpToMessageId, onJumpHandled]);

  useEffect(() => {
    const closeMenu = () =>
      setMenuState((prev) => ({ ...prev, visible: false, messageId: null, attachmentId: null, quoteText: "" }));
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const openContextMenu = (event, msg, attachmentId) => {
    event.preventDefault();
    const quoteText = buildQuoteText(msg);
    const hasAttachment = Boolean(attachmentId);
    const buttonCount = 2 + (hasAttachment ? 1 : 0) + 1;
    const menuWidth = 180;
    const menuHeight = buttonCount * 40 + 8;
    const offsetX = 2;
    const offsetY = 16;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
    const x = Math.min(event.clientX + offsetX, maxX);
    const y = Math.min(event.clientY + offsetY, maxY);

    setMenuState({
      visible: true,
      x,
      y,
      messageId: msg.id,
      attachmentId: attachmentId || null,
      quoteText,
    });
  };

  const handleDeleteClick = async () => {
    if (!menuState.messageId || !onDeleteMessage) return;
    await onDeleteMessage(menuState.messageId);
    setMenuState((prev) => ({ ...prev, visible: false, messageId: null, attachmentId: null, quoteText: "" }));
  };

  const handleShowInFolder = async () => {
    if (!menuState.attachmentId || !onShowInFolder) return;
    await onShowInFolder(menuState.attachmentId);
    setMenuState((prev) => ({ ...prev, visible: false, messageId: null, attachmentId: null, quoteText: "" }));
  };

  const handleQuoteToComposer = () => {
    if (!menuState.quoteText || !onQuoteToComposer) return;
    onQuoteToComposer(menuState.quoteText);
    setMenuState((prev) => ({ ...prev, visible: false }));
  };

  const handleQuoteToAgent = () => {
    if (!menuState.quoteText || !onQuoteToAgent) return;
    onQuoteToAgent(menuState.quoteText);
    setMenuState((prev) => ({ ...prev, visible: false }));
  };

  const renderedGroups = useMemo(() => groups, [groups]);

  return (
    <section className="timeline-card" ref={timelineRef}>
      {renderedGroups.length === 0 && <div className="empty-block">还没有存储记录，先在底部发送一条内容。</div>}
      {renderedGroups.map((group) => (
        <div key={group.day} className="day-group">
          <div className="day-divider">{group.day}</div>
          {group.values.map((msg) => {
            const firstAttachmentId = msg.attachments?.[0]?.id || null;
            const hasText = Boolean(msg.text_plain && msg.text_plain.trim());
            const hasLinks = Boolean(msg.links?.length);
            const fileOnly = Boolean(msg.attachments?.length) && !hasText && !hasLinks;
            const parsed = parseQuotedMessage(msg.text_plain);
            const rowClass = highlightId === msg.id ? "bubble-row is-highlighted" : "bubble-row";

            return (
              <article
                key={msg.id}
                className={rowClass}
                ref={(node) => {
                  if (node) messageRefs.current.set(msg.id, node);
                  else messageRefs.current.delete(msg.id);
                }}
              >
                <div className="bubble-time">{formatTime(msg.created_at)}</div>

                {fileOnly ? (
                  <div className="file-message-card" onContextMenu={(event) => openContextMenu(event, msg, firstAttachmentId)}>
                    {msg.attachments.map((file) => (
                      <div key={file.id} className="file-message-row">
                        <div className="file-message-icon">📄</div>
                        <div className="file-message-meta">
                          <div className="file-message-name">{file.file_name}</div>
                          <div className="file-message-size">{formatFileSize(file.size_bytes)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bubble-stack" onContextMenu={(event) => openContextMenu(event, msg, firstAttachmentId)}>
                    <div className="bubble-content">
                      {parsed.mainText ? <p className="bubble-text">{parsed.mainText}</p> : null}
                      {msg.attachments?.map((file) => (
                        <div key={file.id} className="attach-item">
                          <span className="attach-tag">{file.mime_type?.startsWith("image/") ? "图片" : "文件"}</span>
                          <span>{file.file_name}</span>
                        </div>
                      ))}
                      {msg.links?.map((link) => (
                        <a key={link.id} className="link-item" href={link.url} target="_blank" rel="noreferrer">
                          {link.title || link.url}
                        </a>
                      ))}
                    </div>
                    {parsed.quoteText ? <div className="sent-quote-block">{parsed.quoteText}</div> : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ))}

      {menuState.visible ? (
        <div className="chat-context-menu" style={{ left: `${menuState.x}px`, top: `${menuState.y}px` }} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="chat-context-btn" onClick={handleQuoteToComposer}>
            在发送框引用
          </button>
          <button type="button" className="chat-context-btn" onClick={handleQuoteToAgent}>
            在桌面智能助手引用
          </button>
          {menuState.attachmentId ? (
            <button type="button" className="chat-context-btn" onClick={handleShowInFolder}>
              在文件夹中显示
            </button>
          ) : null}
          <button type="button" className="chat-context-delete" onClick={handleDeleteClick}>
            删除
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatFileSize(sizeBytes) {
  const size = Number(sizeBytes || 0);
  if (size <= 0) return "--";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}K`;
  return `${(size / (1024 * 1024)).toFixed(1)}M`;
}

function buildQuoteText(msg) {
  const parts = [];
  if (msg?.text_plain?.trim()) parts.push(`Evelyn: ${msg.text_plain.trim()}`);
  if (msg?.attachments?.length) {
    for (const file of msg.attachments) {
      parts.push(`Evelyn: 文件：${file.file_name}`);
    }
  }
  if (msg?.links?.length) {
    for (const link of msg.links) {
      parts.push(`Evelyn: 链接：${link.title || link.url}`);
    }
  }
  return parts.join("\n").trim();
}

function parseQuotedMessage(rawText) {
  const text = (rawText || "").trim();
  if (!text) return { mainText: "", quoteText: "" };

  if (text.startsWith("[quote]") && text.includes("[/quote]")) {
    const end = text.indexOf("[/quote]");
    const quoteText = text.slice(7, end).trim();
    const mainText = text.slice(end + 8).trim();
    return { mainText, quoteText };
  }

  if (text.startsWith("引用内容：")) {
    const rest = text.slice("引用内容：".length);
    const idx = rest.indexOf("\n");
    if (idx >= 0) {
      return {
        quoteText: rest.slice(0, idx).trim(),
        mainText: rest.slice(idx + 1).trim(),
      };
    }
  }

  return { mainText: text, quoteText: "" };
}
