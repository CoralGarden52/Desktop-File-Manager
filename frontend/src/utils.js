const BEIJING_TZ = "Asia/Shanghai";

function toDate(dateText) {
  if (!dateText) return null;
  const dt = new Date(dateText);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getBeijingParts(dateText) {
  const dt = toDate(dateText);
  if (!dt) return null;

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(dt);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
  };
}

export function formatDay(dateText) {
  const p = getBeijingParts(dateText);
  if (!p) return "未知日期";
  return `${p.year}-${p.month}-${p.day}`;
}

export function formatTime(dateText) {
  const p = getBeijingParts(dateText);
  if (!p) return "--:--";
  return `${p.hour}:${p.minute}`;
}

export function formatDateTimeBeijing(dateText) {
  const p = getBeijingParts(dateText);
  if (!p) return "";
  return `${p.year}年${Number(p.month)}月${Number(p.day)}日 ${p.hour}:${p.minute}`;
}

export function formatMonthLabelBeijing(dateText) {
  const p = getBeijingParts(dateText);
  if (!p) return "未知月份";
  return `${p.year}年${Number(p.month)}月`;
}

export function groupByDay(items) {
  const map = new Map();
  for (const item of items) {
    const day = formatDay(item.created_at);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(item);
  }
  return Array.from(map.entries()).map(([day, values]) => ({ day, values }));
}
