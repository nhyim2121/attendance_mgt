/** 월별 캘린더 자료: 내 개인일정 + 업무협조(기한·완료) + 진행 건·할 일(관리자) + 입찰 투찰 마감(입찰 공유 계정)
 *  + 주마다 내 주간업무일지 요약. 서버 전용. */
import "server-only";
import { type AppUser, canBid } from "../auth";
import { addDays } from "../time";
import { allRows } from "../대시/data";
import { DONE_STAGES } from "../총무/bid";
import { loadBids } from "../총무/bidStore";
import { type CalItem, DEPT_COLOR, isOpen, monthWeeks, occurrences, PLAN_COLOR, timeText, type WeekLog } from "./work";
import { loadCoops, loadPlans, logsOf } from "./workStore";

export interface MonthCal { weeks: string[]; items: CalItem[]; logs: Record<string, WeekLog> }

export async function monthCal(me: AppUser, month: string): Promise<MonthCal> {
  const weeks = monthWeeks(month);
  const from = weeks[0], to = addDays(weeks[weeks.length - 1], 6);
  const admin = me.role === "관리자";
  const [plans, coops, logs, rows, bids] = await Promise.all([
    loadPlans(me.id), loadCoops(), logsOf(me.id), admin ? allRows() : Promise.resolve([]), canBid(me) ? loadBids() : Promise.resolve([]),
  ]);
  const items: CalItem[] = [];
  for (const p of plans) for (const h of occurrences(p, from, to)) {
    items.push({ day: h.day, kind: "plan", title: p.title, href: `/misc/plan?d=${h.day}&edit=${p.id}`, color: PLAN_COLOR[p.kind] ?? "#5b6475", done: h.done, time: h.multi ? "" : timeText(p) });
  }
  for (const c of coops) {
    const href = `/misc/coop?id=${c.id}`;
    if (c.status === "완료" && c.doneAt >= from && c.doneAt <= to) items.push({ day: c.doneAt, kind: "coopDone", title: `${c.dept} ${c.title}`, href, color: DEPT_COLOR[c.dept], done: true });
    else if (isOpen(c) && c.due && c.due >= from && c.due <= to) items.push({ day: c.due, kind: "coop", title: `${c.dept} ${c.title}`, href, color: DEPT_COLOR[c.dept] });
  }
  for (const r of rows) {
    if (r.book !== "tasks") continue;
    const d = r.data as Record<string, string>;
    const day = d.due || r.day;
    if (day && day >= from && day <= to) items.push({ day, kind: "due", title: d.title ?? "할 일", href: `/misc/b/tasks?edit=${r.id}#form`, color: "#6d28d9", done: ["완료", "보류"].includes(d.status) });
  }
  for (const b of bids) {
    const at = b.dates.bidClose?.slice(0, 10);
    if (b.stage === "새 공고" || DONE_STAGES.includes(b.stage) || !at || at < from || at > to) continue;
    items.push({ day: at, kind: "bid", title: `투찰 마감 ${b.name}`, href: `/bid/item?id=${b.id}`, color: "#0e7490", time: b.dates.bidClose?.slice(11, 16) });
  }
  items.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  return { weeks, items, logs: Object.fromEntries(logs.filter((l) => weeks.includes(l.monday)).map((l) => [l.monday, l.log])) };
}
