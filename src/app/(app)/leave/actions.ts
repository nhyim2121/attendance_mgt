"use server";

import { revalidatePath } from "next/cache";
import { isHoliday } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { getHolidays, getLeavePolicy, getRule } from "@/lib/data";
import * as store from "@/lib/store";
import { addDays, dayLabel, isDateStr, parseHM } from "@/lib/time";
import { DEFAULT_POLICY, type LeavePolicy, RANGE_TYPES, VACATION_TYPES, vacationDays } from "@/lib/vacation";

type Res = { ok?: string; error?: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function addVacationAction(_prev: Res, f: FormData): Promise<Res> {
  const user = await requireUser();
  const name = str(f, "name"), type = str(f, "type");
  const startDay = str(f, "start"), endDay = RANGE_TYPES.has(type) ? str(f, "end") || startDay : startDay;
  const startTime = str(f, "startTime"), endTime = str(f, "endTime");
  if (!name) return { error: "직원을 골라 주세요." };
  if (!VACATION_TYPES.includes(type)) return { error: "휴가 유형을 골라 주세요." };
  if (!isDateStr(startDay) || !isDateStr(endDay) || endDay < startDay) return { error: "날짜를 확인해 주세요." };
  if ((startTime || endTime) && (parseHM(startTime) === null || parseHM(endTime) === null || endTime <= startTime)) {
    return { error: "시각은 09:00 ~ 11:00 처럼 시작이 종료보다 빠르게 적어 주세요." };
  }
  if (type === "외출" && !(startTime && endTime)) return { error: "외출은 시작·종료 시각을 적어 주세요." };
  const [rule, holidays, policy] = await Promise.all([getRule(), getHolidays(), getLeavePolicy()]);
  const isWorkday = (d: string) => !isHoliday(d, rule, holidays);
  if (startDay !== endDay) {
    let any = false;
    for (let d = startDay; d <= endDay && !any; d = addDays(d, 1)) any = isWorkday(d);
    if (!any) return { error: "기간 안에 근무일이 없습니다 (주말·공휴일만 있음)." };
  }
  await store.addVacation({
    name, type, startDay, endDay, startTime, endTime, reason: str(f, "reason"), note: str(f, "note"), createdBy: user.loginId,
  });
  revalidatePath("/", "layout");
  const n = vacationDays({ type, startDay, endDay }, isWorkday, policy, `${startTime}~${endTime}`);
  const span = startDay === endDay ? dayLabel(startDay) : `${dayLabel(startDay)} ~ ${dayLabel(endDay)}`;
  return { ok: `${name} ${type} ${span} 등록했습니다.${n ? ` (연차 ${n}일 차감)` : ""}` };
}

export async function deleteVacationAction(id: number): Promise<Res> {
  await requireUser();
  await store.deleteVacation(id);
  revalidatePath("/", "layout");
  return { ok: "휴가를 삭제했습니다." };
}

export async function addAdjustAction(_prev: Res, f: FormData): Promise<Res> {
  const user = await requireUser();
  const name = str(f, "name"), fy = Number(str(f, "fy")), days = Number(str(f, "days"));
  if (!name) return { error: "직원을 골라 주세요." };
  if (!Number.isInteger(fy) || fy < 2000) return { error: "회계연도를 확인해 주세요." };
  if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 60) return { error: "조정 일수를 확인해 주세요 (예: 2, -1, 0.5)." };
  await store.addAdjust({ name, fy, days, reason: str(f, "reason"), createdBy: user.loginId });
  revalidatePath("/", "layout");
  return { ok: `${name} ${fy} 연차 ${days > 0 ? "+" : ""}${days}일 조정했습니다.` };
}

export async function deleteAdjustAction(id: number): Promise<Res> {
  await requireUser();
  await store.deleteAdjust(id);
  revalidatePath("/", "layout");
  return { ok: "조정을 삭제했습니다." };
}

export async function savePolicyAction(_prev: Res, f: FormData): Promise<Res> {
  await requireUser();
  const num = (k: keyof LeavePolicy, lo: number, hi: number) => {
    const v = Number(str(f, k));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : (DEFAULT_POLICY[k] as number);
  };
  const round = str(f, "prorateRound");
  const p: LeavePolicy = {
    fyStartMonth: Math.round(num("fyStartMonth", 1, 12)), baseDays: num("baseDays", 0, 30), addEvery: num("addEvery", 1, 10),
    maxDays: num("maxDays", 0, 60), prorate: f.get("prorate") === "on",
    prorateRound: round === "none" || round === "one" || round === "halfRound" ? round : "half", monthly: f.get("monthly") === "on",
    monthlyMax: num("monthlyMax", 0, 12), joinCutoffDay: Math.round(num("joinCutoffDay", 0, 31)),
    joinExtra: num("joinExtra", 0, 5), outingDeduct: f.get("outingDeduct") === "on",
    outingHoursPerDay: num("outingHoursPerDay", 1, 24),
    exclude: [...new Set(str(f, "exclude").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))],
  };
  await store.setSetting("leave_policy", p);
  revalidatePath("/", "layout");
  return { ok: "연차 기준을 저장했습니다 (모든 사용자 공통)." };
}
