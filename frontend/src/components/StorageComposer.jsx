import React, { useEffect, useMemo, useRef, useState } from "react";
import { createMessage, uploadMessageFile } from "../api";

const LINK_CANDIDATE_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>"'`]+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s<>"'`]*)?/gi;

export default function StorageComposer({ onSent, quotePayload }) {
  const composerRef = useRef(null);
  const pickerRef = useRef(null);
  const [text, setText] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [sending, setSending] = useState(false);

  const fileSizeLabel = useMemo(() => {
    if (!selectedFile) return "";
    const size = selectedFile.size || 0;
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}K`;
    return `${(size / (1024 * 1024)).toFixed(1)}M`;
  }, [selectedFile]);

  useEffect(() => {
    if (!quotePayload?.id || !quotePayload.text) return;
    setQuoteText(quotePayload.text);
  }, [quotePayload]);

  const chooseFile = () => pickerRef.current?.click();

  const submit = async () => {
    if (!text.trim() && !selectedFile && !quoteText.trim()) return;
    setSending(true);
    try {
      const combinedText = quoteText.trim() ? `[quote]${quoteText}[/quote]\n${text}`.trim() : text;
      const parsed = extractLinkAndText(combinedText);

      let attachmentPayload = null;
      if (selectedFile) {
        attachmentPayload = await uploadMessageFile(selectedFile);
      }

      const payload = {
        message: { msg_type: "text", text: parsed.cleanedText || null },
        attachment: attachmentPayload,
        link: parsed.primaryLink
          ? {
              url: parsed.primaryLink.url,
              domain: parsed.primaryLink.domain,
              title: "",
            }
          : null,
      };

      await createMessage(payload);
      setText("");
      setQuoteText("");
      setSelectedFile(null);
      if (pickerRef.current) pickerRef.current.value = "";
      onSent();
    } finally {
      setSending(false);
    }
  };

  const onTextKeyDown = (event) => {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    event.preventDefault();
    if (sending) return;
    submit();
  };

  useEffect(() => {
    const onGlobalKeyDown = (event) => {
      if (event.key !== "Enter") return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if ((!selectedFile && !quoteText.trim()) || sending) return;

      const root = composerRef.current;
      if (!root) return;
      const activeEl = document.activeElement;
      if (!activeEl || !root.contains(activeEl)) return;

      const tagName = activeEl.tagName?.toLowerCase();
      if (tagName === "textarea" || tagName === "input") return;

      event.preventDefault();
      submit();
    };

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [selectedFile, quoteText, sending]);

  return (
    <section className="composer-wrap wx-composer" ref={composerRef}>
      <input
        ref={pickerRef}
        type="file"
        className="hidden-picker"
        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
      />

      <div className="composer-main wx-composer-main">
        {quoteText ? (
          <div className="quote-preview quote-preview-in-composer">
            <div className="quote-preview-text">{quoteText}</div>
            <button type="button" className="quote-preview-close" onClick={() => setQuoteText("")}>
              ×
            </button>
          </div>
        ) : null}

        {selectedFile ? (
          <div className="selected-file-card">
            <div>
              <div className="selected-file-name">{selectedFile.name}</div>
              <div className="selected-file-size">{fileSizeLabel}</div>
            </div>
            <div className="selected-file-icon">📄</div>
          </div>
        ) : null}

        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onTextKeyDown} placeholder="" />
      </div>

      <div className="composer-toolbar wx-toolbar">
        <button type="button" className="toolbar-icon-btn" aria-label="文件" onClick={chooseFile}>📁</button>

        <button
          type="button"
          className="send-btn wx-send-btn"
          disabled={sending || (!text.trim() && !selectedFile && !quoteText.trim())}
          onClick={submit}
        >
          {sending ? "发送中" : "发送"}
        </button>
      </div>
    </section>
  );
}

function detectFirstLink(inputText) {
  if (!inputText) return null;
  const matches = inputText.matchAll(LINK_CANDIDATE_REGEX);
  for (const match of matches) {
    const parsed = normalizeLinkCandidate(match[0]);
    if (parsed) return parsed;
  }
  return null;
}

function extractLinkAndText(inputText) {
  const original = inputText || "";
  const primaryLink = detectFirstLink(original);
  if (!primaryLink) {
    return {
      primaryLink: null,
      cleanedText: original.trim(),
    };
  }

  const cleanedText = original.replace(LINK_CANDIDATE_REGEX, " ").replace(/\s+/g, " ").trim();

  return {
    primaryLink,
    cleanedText,
  };
}

function normalizeLinkCandidate(rawValue) {
  if (!rawValue) return null;

  const trimmed = rawValue.replace(/[),.;!?，。！？、]+$/gu, "");
  const urlText = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(urlText);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return {
      url: parsed.toString(),
      domain: parsed.hostname,
    };
  } catch {
    return null;
  }
}
