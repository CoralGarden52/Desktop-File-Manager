import React, { useEffect, useRef, useState } from "react";
import { formatTime, groupByDay } from "../utils";

export default function ChatTimeline({ messages, onDeleteMessage }) {
  const groups = groupByDay(messages);
  const timelineRef = useRef(null);
  const [menuState, setMenuState] = useState({
    visible: false,
    x: 0,
    y: 0,
    messageId: null,
  });

  useEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const closeMenu = () => setMenuState((prev) => ({ ...prev, visible: false, messageId: null }));
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

  const openContextMenu = (event, messageId) => {
    event.preventDefault();
    const menuWidth = 110;
    const menuHeight = 44;
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
      messageId,
    });
  };

  const handleDeleteClick = async () => {
    if (!menuState.messageId || !onDeleteMessage) return;
    await onDeleteMessage(menuState.messageId);
    setMenuState((prev) => ({ ...prev, visible: false, messageId: null }));
  };

  return (
    <section className="timeline-card" ref={timelineRef}>
      {groups.length === 0 && <div className="empty-block">还没有存储记录，先在底部发送一条内容。</div>}
      {groups.map((group) => (
        <div key={group.day} className="day-group">
          <div className="day-divider">{group.day}</div>
          {group.values.map((msg) => (
            <article key={msg.id} className="bubble-row">
              <div className="bubble-time">{formatTime(msg.created_at)}</div>
              <div className="bubble-content" onContextMenu={(event) => openContextMenu(event, msg.id)}>
                {msg.text_plain ? <p className="bubble-text">{msg.text_plain}</p> : null}
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
            </article>
          ))}
        </div>
      ))}

      {menuState.visible ? (
        <div
          className="chat-context-menu"
          style={{ left: `${menuState.x}px`, top: `${menuState.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="chat-context-delete" onClick={handleDeleteClick}>
            删除
          </button>
        </div>
      ) : null}
    </section>
  );
}
