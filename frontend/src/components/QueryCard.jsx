import React, { useState } from "react";
import { askAgent } from "../api";

export default function QueryCard() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await askAgent(question.trim());
      setResult(data);
    } catch (err) {
      setError(err.message || "查询失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="query-card">
      <form onSubmit={submit}>
        <label className="input-label">桌面文件助手智能体</label>
        <div className="query-row">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder=""
          />
          <button type="submit" disabled={loading}>
            {loading ? "查询中" : "查询"}
          </button>
        </div>
      </form>
      {error ? <div className="error-text">{error}</div> : null}
      {result ? (
        <div className="query-result">
          <div className="result-main">{result.answer}</div>
          {result.matched_dates?.length ? <div className="result-sub">命中日期：{result.matched_dates.join("、")}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
