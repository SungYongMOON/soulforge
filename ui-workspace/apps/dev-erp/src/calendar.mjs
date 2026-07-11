// B10 캘린더: 월간 그리드 산출(서버측 순수 함수) — 클라이언트는 렌더만 한다(S10-2 처방).
// 주 시작=일요일, 6주(42칸) 고정(구글 기본). 날짜 산술은 UTC 고정 — due/at 은 date-only
// 문자열 계약이라 타임존 개입 없이 slice(0,10) 버킷팅이 정본. '오늘' 강조는 클라이언트 몫.

const DAY_MS = 86400000;

function dateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function monthGridRange(monthKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? ""));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const first = Date.UTC(year, month - 1, 1);
  const gridFrom = first - new Date(first).getUTCDay() * DAY_MS;
  return { month: `${m[1]}-${m[2]}`, from: dateKey(gridFrom), to: dateKey(gridFrom + 41 * DAY_MS) };
}

export function shiftMonth(monthKey, delta) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + Number(delta || 0), 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// items: due 보유 행(calendarFeed shape), meetings: at 보유 행. 날짜 밖 행은 조용히 제외.
export function buildMonthGrid(monthKey, { items = [], meetings = [] } = {}) {
  const range = monthGridRange(monthKey);
  if (!range) return null;
  const byDay = new Map();
  const start = Date.UTC(
    Number(range.from.slice(0, 4)), Number(range.from.slice(5, 7)) - 1, Number(range.from.slice(8, 10)),
  );
  for (let i = 0; i < 42; i += 1) {
    const date = dateKey(start + i * DAY_MS);
    byDay.set(date, { date, in_month: date.slice(0, 7) === range.month, items: [], meetings: [] });
  }
  for (const item of items) {
    const cell = byDay.get(String(item.due ?? "").slice(0, 10));
    if (cell) cell.items.push(item);
  }
  for (const meeting of meetings) {
    const cell = byDay.get(String(meeting.at ?? "").slice(0, 10));
    if (cell) cell.meetings.push(meeting);
  }
  const weeks = [];
  const cells = [...byDay.values()];
  for (let w = 0; w < 6; w += 1) weeks.push(cells.slice(w * 7, w * 7 + 7));
  return { ...range, weeks };
}
