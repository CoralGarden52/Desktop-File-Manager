import React, { useMemo, useState } from "react";
import { searchMessages } from "../api";
import { formatDateTimeBeijing, formatMonthLabelBeijing } from "../utils";

const TAB_OPTIONS = [
  { key: "file", label: "文件" },
  { key: "image_video", label: "图片与视频" },
  { key: "link", label: "链接" },
  { key: "date", label: "日期" },
];

const WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"];

export default function HistoryPage() {
  const today = useMemo(() => new Date(), []);
  const [activeTab, setActiveTab] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [dateDraft, setDateDraft] = useState(toDateInput(today));
  const [dateCursorYear, setDateCursorYear] = useState(today.getFullYear());
  const [dateCursorMonth, setDateCursorMonth] = useState(today.getMonth() + 1);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [result, setResult] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => `与“桌面文件助手”的聊天记录`, []);

  const yearOptions = useMemo(() => {
    const base = today.getFullYear();
    return Array.from({ length: 21 }, (_, idx) => base - 10 + idx);
  }, [today]);

  const calendarCells = useMemo(
    () => buildCalendarCells(dateCursorYear, dateCursorMonth),
    [dateCursorYear, dateCursorMonth]
  );

  const runSearch = async (tab = activeTab, kw = keyword, pickedDate = dateValue) => {
    setLoading(true);
    setError("");
    try {
      const hasTypeFilter = ["file", "image_video", "link", "date"].includes(tab);
      const payload = {
        keyword: kw.trim() || null,
        file_name: tab === "file" && kw.trim() ? kw.trim() : null,
        link_domain: tab === "link" && kw.trim() ? kw.trim() : null,
        content_type: hasTypeFilter ? tab : null,
        date_exact: tab === "date" ? pickedDate || null : null,
      };
      const data = await searchMessages(payload);
      setResult(data.items || []);
    } catch (err) {
      setError(err.message || "查询失败");
    } finally {
      setLoading(false);
    }
  };

  const onTabClick = (tabKey) => {
    if (tabKey !== "date" && activeTab === tabKey) {
      setActiveTab("all");
      runSearch("all", keyword, dateValue);
      return;
    }
    setActiveTab(tabKey);
    if (tabKey === "date") {
      const seed = dateValue || toDateInput(today);
      setDateDraft(seed);
      const seedDate = new Date(seed);
      if (!Number.isNaN(seedDate.getTime())) {
        setDateCursorYear(seedDate.getFullYear());
        setDateCursorMonth(seedDate.getMonth() + 1);
      }
      setDatePickerOpen(true);
      return;
    }
    runSearch(tabKey, keyword, dateValue);
  };

  const onSearchSubmit = (event) => {
    event.preventDefault();
    runSearch();
  };

  const onPickDay = (cell) => {
    if (!cell.inCurrentMonth) return;
    setDateDraft(cell.dateValue);
  };

  const confirmDate = () => {
    setDateValue(dateDraft);
    setDatePickerOpen(false);
    runSearch("date", keyword, dateDraft);
  };

  const cancelDate = () => {
    setDatePickerOpen(false);
    if (!dateValue) {
      setActiveTab("all");
    }
  };

  const groupedMedia = groupByMonth(result);

  return (
    <div className="history-page">
      <div className="history-headline">{title}</div>

      <form className="history-search-box" onSubmit={onSearchSubmit}>
        <span className="search-icon">⌕</span>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={activeTab === "image_video" ? "搜索图片中的文字" : "搜索"}
        />
        <button type="submit">查询</button>
      </form>

      <nav className="history-tabs">
        {TAB_OPTIONS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`history-tab ${activeTab === tab.key ? "is-active" : ""}`}
            onClick={() => onTabClick(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "date" && dateValue ? <div className="date-pill">已选日期：{dateValue}</div> : null}

      {error ? <div className="error-text">{error}</div> : null}
      {loading ? <div className="status-strip">查询中...</div> : null}

      <section className="history-result-area">
        {activeTab === "image_video" ? (
          <MediaGridSection groups={groupedMedia} />
        ) : (
          <RecordListSection items={result} />
        )}
      </section>

      {datePickerOpen ? (
        <div className="date-modal-mask" onClick={cancelDate}>
          <div className="date-modal" onClick={(e) => e.stopPropagation()}>
            <h3>选择发送日期</h3>

            <div className="date-select-row">
              <select
                className="date-select"
                value={dateCursorYear}
                onChange={(e) => setDateCursorYear(Number(e.target.value))}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}年
                  </option>
                ))}
              </select>
              <select
                className="date-select"
                value={dateCursorMonth}
                onChange={(e) => setDateCursorMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </div>

            <div className="date-weekdays">
              {WEEKDAY_CN.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="date-grid">
              {calendarCells.map((cell, idx) => (
                <button
                  key={`${cell.dateValue || "blank"}-${idx}`}
                  type="button"
                  className={`date-cell ${!cell.inCurrentMonth ? "is-muted" : ""} ${
                    cell.dateValue === dateDraft ? "is-selected" : ""
                  }`}
                  onClick={() => onPickDay(cell)}
                  disabled={!cell.inCurrentMonth}
                >
                  {cell.label}
                </button>
              ))}
            </div>

            <div className="date-modal-actions">
              <button type="button" onClick={cancelDate}>
                取消
              </button>
              <button type="button" className="ok" onClick={confirmDate}>
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecordListSection({ items }) {
  if (!items.length) return <div className="empty-block">暂无匹配记录</div>;

  return (
    <div className="record-list-v2">
      {items.map((item) => (
        <article className="record-row" key={item.id}>
          <div className="avatar-dot">E</div>
          <div className="record-main">
            <div className="record-user">Evelyn</div>
            <div className="record-text">{item.text_plain || renderFallback(item)}</div>
            {item.links?.length ? (
              <a className="record-link" href={item.links[0].url} target="_blank" rel="noreferrer">
                {item.links[0].title || item.links[0].url}
              </a>
            ) : null}
          </div>
          <div className="record-time">{formatDateTimeBeijing(item.created_at)}</div>
        </article>
      ))}
    </div>
  );
}

function MediaGridSection({ groups }) {
  if (!groups.length) return <div className="empty-block">暂无图片或视频记录</div>;

  return (
    <div className="media-sections">
      {groups.map((group) => (
        <section key={group.label} className="media-group">
          <h4>{group.label}</h4>
          <div className="media-grid">
            {group.items.map((item) => (
              <article className="media-card" key={`${group.label}-${item.id}`}>
                <div className="media-tag">{guessMediaTag(item)}</div>
                <div className="media-name">
                  {item.attachments?.[0]?.file_name || item.text_plain || "图片/视频"}
                </div>
                <div className="media-time">{formatDateTimeBeijing(item.created_at)}</div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function renderFallback(item) {
  if (item.attachments?.length) return `附件：${item.attachments[0].file_name}`;
  if (item.links?.length) return "链接消息";
  return "(无文本内容)";
}

function guessMediaTag(item) {
  const mime = item.attachments?.[0]?.mime_type || "";
  const fileName = (item.attachments?.[0]?.file_name || "").toLowerCase();
  if (mime.startsWith("video/") || /\.(mp4|mov|avi|mkv)$/.test(fileName)) return "视频";
  return "图片";
}

function groupByMonth(items) {
  const map = new Map();
  for (const item of items) {
    const label = formatMonthLabelBeijing(item.created_at);
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(item);
  }
  return Array.from(map.entries()).map(([label, rows]) => ({ label, items: rows }));
}

function toDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildCalendarCells(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstJsWeekday = new Date(year, month - 1, 1).getDay();
  const firstWeekdayMondayFirst = (firstJsWeekday + 6) % 7;

  const cells = [];
  for (let i = 0; i < firstWeekdayMondayFirst; i += 1) {
    cells.push({ label: "", dateValue: "", inCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    cells.push({
      label: String(day),
      dateValue: `${year}-${mm}-${dd}`,
      inCurrentMonth: true,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ label: "", dateValue: "", inCurrentMonth: false });
  }

  return cells;
}
