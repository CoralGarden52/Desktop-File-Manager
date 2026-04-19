import React, { useEffect, useState } from "react";

export default function QueryCard({ quotePayload, onAsk, onOpenDrawer, asking }) {
  const [question, setQuestion] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!quotePayload?.id || !quotePayload.text) return;
    setQuoteText(quotePayload.text);
  }, [quotePayload]);

  const submit = async (event) => {
    event.preventDefault();
    if (!question.trim() && !quoteText.trim()) return;

    setError("");
    try {
      const promptText = question.trim() || "请基于引用内容进行说明";
      const finalQuestion = quoteText.trim() ? `引用内容：${quoteText}\n用户问题：${promptText}` : promptText;
      const hintedFileName = inferFileNameFromInput(finalQuestion, quoteText);
      const displayQuestion = quoteText.trim() ? `基于引用提问：${promptText}` : promptText;

      await onAsk?.({
        finalQuestion,
        displayQuestion,
        fileName: hintedFileName,
        quoteText: quoteText.trim(),
      });

      setQuestion("");
      setQuoteText("");
    } catch (err) {
      setError(err.message || "提问失败");
    }
  };

  return (
    <section className="query-card">
      <form onSubmit={submit}>
        {quoteText ? (
          <div className="quote-preview">
            <div className="quote-preview-text">{quoteText}</div>
            <button type="button" className="quote-preview-close" onClick={() => setQuoteText("")}>
              ×
            </button>
          </div>
        ) : null}

        <div className="query-row">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="" />
          <button type="submit" disabled={asking || (!question.trim() && !quoteText.trim())}>
            {asking ? "查询中" : "查询"}
          </button>
        </div>
      </form>

      <div className="query-card-actions">
        <button type="button" className="ghost-btn" onClick={onOpenDrawer}>
          打开智能体会话
        </button>
      </div>

      {error ? <div className="error-text">{error}</div> : null}
    </section>
  );
}

function inferFileNameFromInput(question, quoteText) {
  const merged = `${question || ""}\n${quoteText || ""}`;
  const fromQuotedLine = merged.match(/文件[:：]\s*([^\n\r]+?\.[A-Za-z0-9]{1,8})/);
  if (fromQuotedLine?.[1]) return sanitizeFileNameHint(fromQuotedLine[1]);

  const m = merged.match(/([^\s\n\r]+?\.[A-Za-z0-9]{1,8})/);
  if (m?.[1]) return sanitizeFileNameHint(m[1]);
  return "";
}

function sanitizeFileNameHint(value) {
  return (value || "")
    .trim()
    .replace(/^[`"'“”‘’\[\(（【]+/, "")
    .replace(/[`"'“”‘’\]\)）】,，。;；:：!?！？]+$/, "");
}
