/** 새 사이트(F안) 대시보드 숫자: 오늘 근태·휴가, 할 일(기한·만기), 영역별 요약. 서버 전용. */
import "server-only";
import { cache } from "react";
import { dailyBoard, isHoliday } from "../인사노무/analytics";
import { isLeaveType, monthlyAverage, weekHours } from "../인사노무/dashboard";
import { getHolidays, getLeavePolicy, getRule, loadBase, rosterDays, staffOn } from "../인사노무/data";
import { leaveBook } from "../인사노무/leaveBook";
import { fyOf } from "../인사노무/vacation";
import * as store from "../store";
import { addDays, daysBetween, nowKst, parseTs, todayKst, weekday } from "../time";
import { alertsOf as certAlerts, loadItems } from "../인증/cert";
import { certAlert, loadCerts } from "../총무/issue";
import { loadOpenMails, mailNo } from "../총무/mail";
import { type Area, BOOKS, bookHref } from "../대장/books";
import { alertsOf as rowAlerts, isClosed, rowName, type Row } from "../대장/logic";
import { loadBooks } from "../대장/store";

export const WEEK_WARN = 48;
export const WEEK_LIMIT = 52;

// ---------------------------------------------------------------- 인사노무 (근태·휴가)
export interface HrSnap {
  ok: boolean;              // 캡스 기록이 하나라도 있는지
  staff: number; present: number; late: number; leave: number; trip: number; absent: number;
  leaveTypes: Record<string, number>;
  near: { emp: string; dept: string; hours: number }[]; // 이번 주 48시간 이상
  usedRate: number; remain: number; fy: number;
  monthly: { label: string; hours: number }[];          // 올해 월별 1인 평균 주 근로시간
  depts: { dept: string; n: number }[];                 // 부서별 재직
  weekLeaves: { day: string; name: string; type: string }[]; // 이번 주(월~일) 휴가·출장
  leaveByMonth: { label: string; n: number }[];         // 올해 월별 휴가 사용 건수
}

export const hrSnap = cache(async (): Promise<HrSnap> => {
  const [rule, holidays, base, policy, adjusts] = await Promise.all([
    getRule(), getHolidays(), loadBase(), getLeavePolicy(), store.loadAdjusts(),
  ]);
  const today = todayKst();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monday = addDays(today, -weekday(today));
  const { records, days } = await rosterDays(monday < yearStart ? monday : yearStart, today);
  const staff = await staffOn(today, records);
  const holiday = isHoliday(today, rule, holidays);
  const board = dailyBoard(days, base.leaves, staff, today, rule, parseTs(nowKst()), holiday);
  const by = (g: string) => board.filter((b) => b.group === g);
  const leaveTypes: Record<string, number> = {};
  for (const l of base.leaves) if (l.day === today && isLeaveType(l.type)) leaveTypes[l.type] = (leaveTypes[l.type] ?? 0) + 1;

  const near = weekHours(days, today, rule).filter((w) => w.hours >= WEEK_WARN);
  const monthly = monthlyAverage(days.filter((d) => d.day >= yearStart), rule).map((m) => ({ label: `${+m.month.slice(5)}월`, hours: m.hours }));

  const fy = fyOf(today, policy);
  const active = base.employees.filter((e) => (!e.leaveDate || e.leaveDate >= today) && (!e.joinDate || e.joinDate <= today));
  const excl = new Set(policy.exclude ?? []);
  const bal = leaveBook(active, base.leaves, adjusts, fy, policy, await store.loadLeaveStatus(fy))(today, (b) => !excl.has(b.name))
    .bal.filter((b) => b.total > 0);
  const total = bal.reduce((t, b) => t + b.total, 0), used = bal.reduce((t, b) => t + b.used, 0);

  const deptMap = new Map<string, number>();
  for (const [, d] of staff) deptMap.set(d || "(부서 없음)", (deptMap.get(d || "(부서 없음)") ?? 0) + 1);
  const order = [...new Set(base.employees.map((e) => e.dept).filter(Boolean))];
  const depts = [...deptMap].map(([dept, n]) => ({ dept, n }))
    .sort((a, b) => (order.indexOf(a.dept) + 1 || 99) - (order.indexOf(b.dept) + 1 || 99));

  const sunday = addDays(monday, 6);
  const weekLeaves = base.leaves.filter((l) => l.day >= monday && l.day <= sunday && (isLeaveType(l.type) || ["출장", "교육", "외근"].includes(l.type)))
    .map((l) => ({ day: l.day, name: l.name, type: l.type }));
  const y = today.slice(0, 4), mNow = +today.slice(5, 7);
  const leaveByMonth = Array.from({ length: mNow }, (_, i) => {
    const mm = `${y}-${String(i + 1).padStart(2, "0")}`;
    return { label: `${i + 1}월`, n: base.leaves.filter((l) => l.day.startsWith(mm) && isLeaveType(l.type)).length };
  });

  return {
    ok: base.months.length > 0,
    staff: staff.length, present: board.filter((b) => b.in !== null).length, late: board.filter((b) => b.late).length,
    leave: by("휴가").length, trip: by("출장·교육").length, absent: by("기록 없음").length, leaveTypes,
    near, usedRate: total ? Math.round((used / total) * 100) : 0, remain: Math.round((total - used) * 10) / 10, fy,
    monthly, depts, weekLeaves, leaveByMonth,
  };
});

// ---------------------------------------------------------------- 할 일 (기한·만기 모으기)
export type TodoCat = "문서" | "만기·갱신" | "기한" | "인사";
export interface Todo {
  area: "hr" | "ga" | "ehs" | "cert" | "misc"; cat: TodoCat; icon: string; title: string; sub: string; href: string;
  left: number | null; // 남은 날 (음수 = 지남, null = 기한 없음)
}

const ledgerRows = cache(async (): Promise<Row[]> => loadBooks(BOOKS.map((b) => b.key)));
export const allRows = ledgerRows;

/** 관리자면 모든 영역, 아니면 인사노무만 */
export const todos = cache(async (admin: boolean): Promise<Todo[]> => {
  const today = todayKst();
  const out: Todo[] = [];
  const hr = await hrSnap();
  for (const w of hr.near) {
    out.push({ area: "hr", cat: "인사", icon: "gauge", title: `${w.emp} 주 ${w.hours}시간`, sub: `주 52시간 관리 · ${w.dept || "부서 없음"}${w.hours > WEEK_LIMIT ? " · 초과" : ""}`, href: "/week52", left: null });
  }
  if (admin) {
    const [mails, items, certs, rows] = await Promise.all([loadOpenMails(), loadItems(), loadCerts(), ledgerRows()]);
    for (const m of mails) {
      out.push({ area: "ga", cat: "문서", icon: "mail", title: `${m.party} ${m.title}`.trim(), sub: `문서 수발 대장 · ${mailNo(m)}${m.due ? "" : " · 처리 중"}`,
        href: `/ga/mail?y=${m.year}&edit=${m.id}#form`, left: m.due ? daysBetween(today, m.due) : null });
    }
    for (const c of items) for (const a of certAlerts(c, today)) {
      out.push({ area: "cert", cat: "만기·갱신", icon: "medal", title: `${c.name} ${a.label}`, sub: `인증 · ${a.day}`, href: `/cert/item?id=${c.id}`, left: a.left });
    }
    for (const c of certs) if (certAlert(c, today)) {
      out.push({ area: "ga", cat: "만기·갱신", icon: "key", title: `${c.name} 만료`, sub: `공동인증서 관리 · ${c.expires}`, href: "/ga/certs", left: daysBetween(today, c.expires!) });
    }
    for (const r of rows) {
      const b = BOOKS.find((x) => x.key === r.book);
      if (!b) continue;
      for (const a of rowAlerts(b, r.data, today)) {
        const renew = /만기|만료|검사|보수교육|계약/.test(a.label);
        out.push({ area: b.area, cat: renew ? "만기·갱신" : "기한", icon: bookHref(b), title: `${rowName(b, r.data)} · ${a.label}`, sub: `${b.title} · ${a.day}`,
          href: `${bookHref(b)}?edit=${r.id}#form`, left: a.left });
      }
    }
  } else {
    // 담당자 계정: 인사노무 대장만
    const rows = (await ledgerRows()).filter((r) => BOOKS.find((b) => b.key === r.book)?.area === "hr");
    for (const r of rows) {
      const b = BOOKS.find((x) => x.key === r.book)!;
      for (const a of rowAlerts(b, r.data, today)) {
        out.push({ area: "hr", cat: "기한", icon: bookHref(b), title: `${rowName(b, r.data)} · ${a.label}`, sub: `${b.title} · ${a.day}`, href: `${bookHref(b)}?edit=${r.id}#form`, left: a.left });
      }
    }
  }
  return out.sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999));
});

// ---------------------------------------------------------------- 대장 요약
export interface BookStat { key: string; title: string; href: string; total: number; open: number; closed: number; alerts: number; thisMonth: number }
export async function bookStats(area: Area): Promise<BookStat[]> {
  const today = todayKst(), month = today.slice(0, 7);
  const rows = await ledgerRows();
  return BOOKS.filter((b) => b.area === area).map((b) => {
    const mine = rows.filter((r) => r.book === b.key);
    const closed = mine.filter((r) => isClosed(b, r.data)).length;
    return {
      key: b.key, title: b.title, href: bookHref(b), total: mine.length, open: mine.length - closed, closed,
      alerts: mine.reduce((t, r) => t + rowAlerts(b, r.data, today).length, 0),
      thisMonth: mine.filter((r) => r.day?.startsWith(month)).length,
    };
  });
}
/** 영역의 최근 기록 (날짜 최근 순) */
export async function recentRows(area: Area, n = 5, onlyOpen = false) {
  const rows = await ledgerRows();
  return rows.flatMap((r) => {
    const b = BOOKS.find((x) => x.key === r.book);
    if (!b || b.area !== area || (onlyOpen && isClosed(b, r.data))) return [];
    return [{ b, r, name: rowName(b, r.data) }];
  }).sort((x, y) => (y.r.day ?? "").localeCompare(x.r.day ?? "") || y.r.id - x.r.id).slice(0, n);
}

/** 남은 날 → 글자 */
export const ddayText = (left: number | null) => (left === null ? "확인" : left < 0 ? `${-left}일 지남` : left === 0 ? "오늘" : `D-${left}`);
export const ddayTone = (left: number | null) => (left === null ? "" : left <= 7 ? "r" : left <= 30 ? "o" : "");
