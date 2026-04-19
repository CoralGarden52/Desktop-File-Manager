import React, { useCallback, useEffect, useMemo, useState } from "react";
import { askAgent, deleteMessage, listMessages, showAttachmentInFolder } from "../api";
import AgentDrawer from "../components/AgentDrawer";
import QueryCard from "../components/QueryCard";
import ChatTimeline from "../components/ChatTimeline";
import StorageComposer from "../components/StorageComposer";

const AGENT_STORE_KEY = "desktop_file_agent_sessions_v1";

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [composerQuote, setComposerQuote] = useState(null);
  const [agentQuote, setAgentQuote] = useState(null);
  const [jumpToMessageId, setJumpToMessageId] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentSessions, setAgentSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AGENT_STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.sessions)) return;
      setAgentSessions(parsed.sessions);
      setActiveSessionId(parsed.activeSessionId || parsed.sessions[0]?.id || null);
    } catch {
      // ignore invalid local cache
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      AGENT_STORE_KEY,
      JSON.stringify({
        sessions: agentSessions,
        activeSessionId,
      })
    );
  }, [agentSessions, activeSessionId]);

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

  const createSession = useCallback((titleSeed = "") => {
    const id = `session_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
    const now = new Date().toISOString();
    const title = (titleSeed || "新会话").slice(0, 26);
    const session = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    setAgentSessions((prev) => [session, ...prev]);
    setActiveSessionId(id);
    return id;
  }, []);

  const appendAgentMessage = useCallback((sessionId, message) => {
    setAgentSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const now = new Date().toISOString();
        const nextMessages = [...(s.messages || []), message];
        const maybeTitle =
          s.title === "新会话" && message.role === "user" && message.text
            ? message.text.slice(0, 26)
            : s.title;
        return {
          ...s,
          title: maybeTitle || s.title,
          updatedAt: now,
          messages: nextMessages,
        };
      })
    );
  }, []);

  const ensureActiveSession = useCallback(
    (seedTitle = "") => {
      if (activeSessionId && agentSessions.some((s) => s.id === activeSessionId)) return activeSessionId;
      return createSession(seedTitle);
    },
    [activeSessionId, agentSessions, createSession]
  );

  const runAgentAsk = useCallback(
    async ({ finalQuestion, displayQuestion, fileName = "", quoteText = "" }) => {
      const sid = ensureActiveSession(displayQuestion);
      setDrawerOpen(true);
      setAgentLoading(true);
      const userMessageText = quoteText ? `${displayQuestion}\n\n引用内容：${quoteText}` : displayQuestion;

      appendAgentMessage(sid, {
        id: `u_${Date.now()}`,
        role: "user",
        text: userMessageText,
        createdAt: new Date().toISOString(),
      });

      try {
        const res = await askAgent(finalQuestion, fileName);
        appendAgentMessage(sid, {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: res.answer || "",
          matched_dates: res.matched_dates || [],
          evidence_items: res.evidence_items || [],
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        appendAgentMessage(sid, {
          id: `aerr_${Date.now()}`,
          role: "assistant",
          text: err.message || "智能体调用失败",
          createdAt: new Date().toISOString(),
        });
      } finally {
        setAgentLoading(false);
      }
    },
    [appendAgentMessage, ensureActiveSession]
  );

  const handleAgentAsk = useCallback(
    async ({ finalQuestion, displayQuestion, fileName, quoteText }) => {
      await runAgentAsk({ finalQuestion, displayQuestion, fileName, quoteText });
    },
    [runAgentAsk]
  );

  const handleDrawerSend = useCallback(
    async (draftQuestion) => {
      const q = (draftQuestion || "").trim();
      if (!q) return;
      await runAgentAsk({
        finalQuestion: q,
        displayQuestion: q,
        fileName: "",
      });
    },
    [runAgentAsk]
  );

  const handleDeleteMessage = useCallback(
    async (messageId) => {
      const ok = window.confirm("确认删除这条消息吗？删除后数据库记录和本地文件都会移除。");
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

  const handleShowInFolder = useCallback(async (attachmentId) => {
    try {
      await showAttachmentInFolder(attachmentId);
    } catch (err) {
      setError(err.message || "打开文件夹失败");
    }
  }, []);

  const handleQuoteToComposer = useCallback((quoteText) => {
    if (!quoteText) return;
    setComposerQuote({ id: Date.now(), text: quoteText });
  }, []);

  const handleQuoteToAgent = useCallback(
    (quoteText) => {
      if (!quoteText) return;
      setAgentQuote({ id: Date.now(), text: quoteText });
    },
    []
  );

  const handleJumpToMessage = useCallback((messageId) => {
    setJumpToMessageId(messageId);
    setDrawerOpen(false);
  }, []);

  const handleJumpHandled = useCallback(() => {
    setJumpToMessageId(null);
  }, []);

  const sortedSessions = useMemo(() => {
    return [...agentSessions].sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }, [agentSessions]);

  return (
    <div className="page-grid">
      <QueryCard
        quotePayload={agentQuote}
        onAsk={handleAgentAsk}
        onOpenDrawer={() => setDrawerOpen(true)}
        asking={agentLoading}
      />
      {loading ? <div className="status-strip">加载中...</div> : null}
      {error ? <div className="error-text">{error}</div> : null}
      <ChatTimeline
        messages={messages}
        onDeleteMessage={handleDeleteMessage}
        onShowInFolder={handleShowInFolder}
        onQuoteToComposer={handleQuoteToComposer}
        onQuoteToAgent={handleQuoteToAgent}
        jumpToMessageId={jumpToMessageId}
        onJumpHandled={handleJumpHandled}
      />
      <StorageComposer onSent={load} quotePayload={composerQuote} />

      <AgentDrawer
        open={drawerOpen}
        sessions={sortedSessions}
        activeSessionId={activeSessionId}
        loading={agentLoading}
        onClose={() => setDrawerOpen(false)}
        onCreateSession={() => createSession("新会话")}
        onSwitchSession={(id) => setActiveSessionId(id)}
        onSend={handleDrawerSend}
        onJumpToMessage={handleJumpToMessage}
      />
    </div>
  );
}
