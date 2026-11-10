/** 대시보드 공통 계산: 할 일을 '이번 주'와 '다가오는 일정'으로 나누기, 배너 쪽지, 시계 아래 요일 줄. 서버 전용. */
import "server-only";
import type { ClockProps } from "./client";
import type { NoteProps, SchedItem } from "./parts";
import { ddayText, type Todo } from "@/lib/대시/data";
import { menuOf } from "@/lib/대시/menu";
import { addDays, weekday } from "@/lib/time";

/** 이번 주 = 기한 없음·지남·7일 안, 다가오는 일정 = 8~90일 */
export function splitTodos(list: Todo[]) {
  const week = list.filter((t) => t.left === null || t.left <= 7);
  const later = list.filter((t) => t.left !== null && t.left > 7 && t.left <= 90);
  return { week, later };
}

/** 배너 쪽지: 기한이 가장 가까운 일 */
export function noteOf(week: Todo[]): NoteProps | null {
  const t = week.find((x) => x.left !== null) ?? week[0];
  return t ? { title: t.title, sub: `${t.sub.split(" · ")[0]} · ${ddayText(t.left)}`, href: t.href } : null;
}

/** 시계 칸의 NEXT: 오늘부터 기한이 가장 가까운 일 */
export function nextOf(week: Todo[]): ClockProps["next"] {
  const t = week.find((x) => x.left !== null && x.left >= 0);
  return t ? { title: t.title, when: ddayText(t.left), href: t.href } : null;
}

export function schedOf(later: Todo[], today: string, n = 6): SchedItem[] {
  return later.slice(0, n).map((t) => ({
    day: addDays(today, t.left!), title: t.title, sub: t.sub.split(" · ")[0], href: t.href, left: t.left!, area: menuOf(t.area),
  }));
}

const DAYS = ["월", "화", "수", "목", "금"];
/** 이번 주 월~금 칸. count(날짜)로 숫자를 채운다. */
export function weekStrip(today: string, count: (day: string) => number): ClockProps["strip"] {
  const monday = addDays(today, -weekday(today));
  return DAYS.map((label, i) => {
    const day = addDays(monday, i);
    return { label, n: count(day), today: day === today };
  });
}
