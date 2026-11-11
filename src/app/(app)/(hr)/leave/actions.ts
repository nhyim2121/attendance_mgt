"use server";
import { requirePerm } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { isHoliday } from "@/lib/인사노무/analytics";
import { requireUser } from "@/lib/auth";
import { getHolidays, getLeavePolicy, getRule } from "@/lib/인사노무/data";
import * as store from "@/lib/store";
import { addDays, dayLabel, isDateStr, parseHM } from "@/lib/time";
import { leaveKey } from "@/lib/인사노무/leave";
import { HW_DEDUCT } from "@/lib/인사노무/leaveStatus";
import { DEFAULT_POLICY, type LeavePolicy, RANGE_TYPES, VACATION_TYPES, vacationDays } from "@/lib/인사노무/vacation";

type Res = { ok?: string; error?: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function addVacationAction(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("create");
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
  await requirePerm("delete");
  await requireUser();
  await store.deleteVacation(id);
  revalidatePath("/", "layout");
  return { ok: "휴가를 삭제했습니다." };
}

export async function addAdjustAction(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("create");
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
  await requirePerm("delete");
  await requireUser();
  await store.deleteAdjust(id);
  revalidatePath("/", "layout");
  return { ok: "조정을 삭제했습니다." };
}

export async function savePolicyAction(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
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

// ---------------------------------------------------------------- 연차 현황에서 직접 고치기
/** 연차 현황 '내역'의 한 줄 */
export interface LeaveRef { name: string; day: string; type: string; content: string; src: string }
export interface LeaveInput {
  name: string; type: string; start: string; end: string; startTime: string; endTime: string; reason: string;
  hours?: number; // 외출 시간 (시각 대신 일수로 넣을 때, 0.5시간 단위)
}
/** 사유에 적힌 시간 글자 ('(1.5시간)', '30분') — 외출 시간은 새로 붙인다 */
const HOURS_TEXT = /\(?\s*(외출\s*)?\d+(\.\d+)?\s*시간(\s*\d+\s*분)?\s*\)?|\(?\s*\d+\s*분\s*\)?/g;

/** 기록 한 줄을 없앤다: 휴가 등록으로 넣은 것은 등록을 지우거나(기간이면 그날만 잘라냄), 다른 자료에서 온 것은 숨김 목록에 넣는다 */
async function removeLeave(ref: LeaveRef, user: string): Promise<string | null> {
  if (ref.src === "휴가관리") {
    const vs = (await store.loadVacations()).filter((v) => v.name === ref.name && v.type === ref.type && v.startDay <= ref.day && v.endDay >= ref.day);
    if (!vs.length) return "등록한 휴가를 찾지 못했습니다. 새로고침 후 다시 해 주세요.";
    for (const v of vs) {
      await store.deleteVacation(v.id);
      const keep = { name: v.name, type: v.type, startTime: v.startTime, endTime: v.endTime, reason: v.reason, note: v.note, createdBy: v.createdBy };
      if (v.startDay < ref.day) await store.addVacation({ ...keep, startDay: v.startDay, endDay: addDays(ref.day, -1) });
      if (v.endDay > ref.day) await store.addVacation({ ...keep, startDay: addDays(ref.day, 1), endDay: v.endDay });
    }
    return null;
  }
  const list = await store.loadHiddenLeaves();
  if (!list.some((h) => leaveKey(h) === leaveKey(ref))) {
    list.push({ day: ref.day, name: ref.name, type: ref.type, content: ref.content, src: ref.src, by: user, at: new Date().toISOString() });
    await store.saveHiddenLeaves(list);
  }
  return null;
}

export async function removeLeaveAction(ref: LeaveRef): Promise<Res> {
  await requirePerm("delete");
  const user = await requireUser();
  if (!isDateStr(ref.day) || !ref.name) return { error: "지울 기록을 확인해 주세요." };
  const err = await removeLeave(ref, user.loginId);
  if (err) return { error: err };
  revalidatePath("/", "layout");
  return { ok: `${ref.name} ${dayLabel(ref.day)} ${ref.type}을(를) 지웠습니다.` };
}

/** 추가(old 없음) 또는 수정(old를 지우고 새로 등록). 새 기록은 '휴가 등록'에 들어간다. */
export async function saveLeaveAction(old: LeaveRef | null, v: LeaveInput): Promise<Res> {
  await requirePerm("update");
  const user = await requireUser();
  const type = v.type, startDay = v.start, endDay = RANGE_TYPES.has(type) && v.end ? v.end : v.start;
  const startTime = v.startTime.trim(), endTime = v.endTime.trim();
  if (!v.name) return { error: "직원이 없습니다." };
  if (!VACATION_TYPES.includes(type)) return { error: "휴가 유형을 골라 주세요." };
  if (!isDateStr(startDay) || !isDateStr(endDay) || endDay < startDay) return { error: "날짜를 확인해 주세요." };
  if ((startTime || endTime) && (parseHM(startTime) === null || parseHM(endTime) === null || endTime <= startTime)) {
    return { error: "시각은 09:00 ~ 11:00 처럼 시작이 종료보다 빠르게 적어 주세요." };
  }
  let reason = v.reason.trim();
  if (type === "외출" && !(startTime && endTime)) {
    const h = Number(v.hours);
    if (!Number.isFinite(h) || h <= 0 || h >= 4 || Math.round(h * 2) !== h * 2) {
      return { error: "외출은 0.5시간 단위로 4시간 미만이어야 합니다 (4시간 이상은 반차로 넣어 주세요)." };
    }
    // 시간은 사유 끝에 '(1.5시간)'으로 적는다 (외출 차감 계산이 이 글자를 읽음)
    reason = `${reason.replace(HOURS_TEXT, "").replace(/\s+/g, " ").trim()} (${h}시간)`.trim();
  }
  if (startDay !== endDay) {
    const [rule, holidays] = await Promise.all([getRule(), getHolidays()]);
    let any = false;
    for (let d = startDay; d <= endDay && !any; d = addDays(d, 1)) any = !isHoliday(d, rule, holidays);
    if (!any) return { error: "기간 안에 근무일이 없습니다 (주말·공휴일만 있음)." };
  }
  if (old) {
    const err = await removeLeave(old, user.loginId);
    if (err) return { error: err };
  }
  await store.addVacation({
    name: v.name, type, startDay, endDay, startTime, endTime, reason, note: old ? "연차 현황에서 수정" : "연차 현황에서 추가",
    createdBy: user.loginId,
  });
  revalidatePath("/", "layout");
  const span = startDay === endDay ? dayLabel(startDay) : `${dayLabel(startDay)} ~ ${dayLabel(endDay)}`;
  return { ok: `${v.name} ${type} ${span} ${old ? "고쳤습니다" : "추가했습니다"}.` };
}

/** 지운 기록 되살리기 */
export async function restoreLeaveAction(key: string): Promise<Res> {
  await requirePerm("update");
  await requireUser();
  const list = await store.loadHiddenLeaves();
  await store.saveHiddenLeaves(list.filter((h) => leaveKey(h) !== key));
  revalidatePath("/", "layout");
  return { ok: "지운 기록을 되살렸습니다." };
}

/** 하이웍스 숫자 직접 고치기 (없으면 추가). 사용은 유형별 일수(외출도 일), 잔여를 비우면 생성 − 차감 유형 합. */
export async function saveHwRowAction(fy: number, name: string, v: {
  grant: { 정기: number; 포상: number; 기타: number }; used: Record<string, number>; remain: number | null; joinDate: string | null; exportedAt: string;
}): Promise<Res> {
  await requirePerm("update");
  const user = await requireUser();
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  const nums = [v.grant.정기, v.grant.포상, v.grant.기타, ...Object.values(v.used), v.remain ?? 0];
  if (!name || !Number.isInteger(fy) || nums.some((x) => !Number.isFinite(x) || Math.abs(x) > 400)) return { error: "숫자를 확인해 주세요." };
  const used: Record<string, number> = {};
  for (const [t, d] of Object.entries(v.used)) if (VACATION_TYPES.includes(t) || t === "포상") { if (d) used[t] = r4(d); }
  const grant = { 정기: r4(v.grant.정기), 포상: r4(v.grant.포상), 기타: r4(v.grant.기타) };
  const granted = r4(grant.정기 + grant.포상 + grant.기타);
  const remain = v.remain ?? r4(granted - HW_DEDUCT.reduce((t, k) => t + (used[k] ?? 0), 0));
  await store.saveLeaveStatusRow(fy, name, { granted, grant, used, remain: r4(remain), joinDate: isDateStr(v.joinDate) ? v.joinDate : null, exportedAt: v.exportedAt }, user.loginId);
  revalidatePath("/", "layout");
  return { ok: `${name}: 생성 ${granted} · 잔여 ${r4(remain)}일로 저장했습니다.` };
}

export async function deleteHwRowAction(fy: number, name: string): Promise<Res> {
  await requirePerm("delete");
  await requireUser();
  await store.deleteLeaveStatusRow(fy, name);
  revalidatePath("/", "layout");
  return { ok: `${name}의 하이웍스 숫자를 지웠습니다. 이제 사이트 계산으로 보입니다.` };
}

/** 휴가 생성 (하이웍스 '휴가 생성' 창처럼 종류별 일수 ±). 연차 조정에 '○○ 생성'으로 남기고, 하이웍스 숫자가 있으면 그것도 같이 늘린다. */
export async function grantLeaveAction(fy: number, name: string, rows: { type: string; days: number; note: string }[]): Promise<Res> {
  await requirePerm("create");
  const user = await requireUser();
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  const list = rows.filter((r) => ["연차", "포상", "월차"].includes(r.type) && Number.isFinite(r.days) && r.days !== 0);
  if (!name || !Number.isInteger(fy)) return { error: "직원·회계연도를 확인해 주세요." };
  if (!list.length) return { error: "생성할 일수를 넣어 주세요 (− 는 줄이기)." };
  if (list.some((r) => Math.abs(r.days) > 60)) return { error: "일수를 확인해 주세요." };
  for (const r of list) {
    await store.addAdjust({ name, fy, days: r4(r.days), reason: `${r.type} 생성${r.note.trim() ? `: ${r.note.trim()}` : ""}`, createdBy: user.loginId });
  }
  const hw = (await store.loadLeaveStatus(fy)).find((s) => s.name === name);
  if (hw) {
    const add = (t: string) => list.filter((r) => r.type === t).reduce((x, r) => x + r.days, 0);
    const grant = { ...hw.grant, 정기: r4(hw.grant.정기 + add("연차") + add("월차")), 포상: r4(hw.grant.포상 + add("포상")) };
    const sum = list.reduce((x, r) => x + r.days, 0);
    await store.saveLeaveStatusRow(fy, name, {
      granted: r4(hw.granted + sum), grant, used: hw.used, remain: r4(hw.remain + sum), joinDate: hw.joinDate, exportedAt: hw.exportedAt,
    }, user.loginId);
  }
  revalidatePath("/", "layout");
  return { ok: `${name}: ${list.map((r) => `${r.type} ${r.days > 0 ? "+" : ""}${r4(r.days)}일`).join(", ")} 생성했습니다.` };
}
