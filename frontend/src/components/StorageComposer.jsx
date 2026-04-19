import React, { useRef, useState } from "react";
import { createMessage } from "../api";

const LINK_CANDIDATE_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>"'`]+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s<>"'`]*)?/gi;

export default function StorageComposer({ onSent }) {
  const pickerRef = useRef(null);
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [sending, setSending] = useState(false);

  const chooseFile = () => pickerRef.current?.click();

  const submit = async () => {
    if (!text.trim() && !selectedFile) return;
    setSending(true);
    try {
      const parsed = extractLinkAndText(text);
      const payload = {
        message: { msg_type: "text", text: parsed.cleanedText || null },
        attachment: selectedFile
          ? {
              file_name: selectedFile.name,
              mime_type: selectedFile.type || null,
              size_bytes: selectedFile.size || null,
              storage_key: `sandbox/${Date.now()}_${selectedFile.name}`,
            }
          : null,
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

  return (
    <section className="composer-wrap">
      <input
        ref={pickerRef}
        type="file"
        className="hidden-picker"
        accept="image/*,.pdf,.doc,.docx,.txt,.md,.mp3,.mp4,.mov,.zip"
        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
      />
      <div className="composer-main">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onTextKeyDown}
          placeholder=""
        />
      </div>
      <div className="composer-toolbar">
        <button type="button" onClick={chooseFile}>上传图片/文件</button>
        <div className="file-chip">{selectedFile ? selectedFile.name : "未选择文件"}</div>
        <button type="button" className="send-btn" disabled={sending} onClick={submit}>
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

  // Remove URL-like fragments from text so we don't duplicate "文本 + 链接" for the same URL.
  const cleanedText = original
    .replace(LINK_CANDIDATE_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();

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
