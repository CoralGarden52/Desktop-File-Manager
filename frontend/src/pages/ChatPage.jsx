import React, { useCallback, useEffect, useState } from "react";
import { deleteMessage, listMessages } from "../api";
import QueryCard from "../components/QueryCard";
import ChatTimeline from "../components/ChatTimeline";
import StorageComposer from "../components/StorageComposer";

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listMessages(120);
      const sorted = [...(data.items || [])].sort((a, b) => {
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        return ta - tb;
      });
      setMessages(sorted);
    } catch (err) {
      setError(err.message || "加载消息失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteMessage = useCallback(
    async (messageId) => {
      const ok = window.confirm("确认删除这条消息吗？删除后数据库记录也会被移除。");
      if (!ok) return;
      try {
        await deleteMessage(messageId);
        await load();
      } catch (err) {
        setError(err.message || "删除失败");
      }
    },
    [load]
  );

  return (
    <div className="page-grid">
      <QueryCard />
      {loading ? <div className="status-strip">加载中...</div> : null}
      {error ? <div className="error-text">{error}</div> : null}
      <ChatTimeline messages={messages} onDeleteMessage={handleDeleteMessage} />
      <StorageComposer onSent={load} />
    </div>
  );
}
