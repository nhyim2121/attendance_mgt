"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { loadBase } from "@/lib/data";
import { syncReports } from "@/lib/reportSync";
import * as store from "@/lib/store";
import { dayLabel, isDateStr, parseClock } from "@/lib/time";

const FIELDS = ["clock_in", "in_type", "clock_out", "out_type", "place", "note", "work", "work_ot"] as const;

/** changes: [{employee, day, 필드: 값, mates?}] 바뀐 필드만. mates(같이 근무한 직원)에게는 같은 날 근무지·인원·업무내용을 함께 넣는다. */
export async function saveEdits(changes: (store.OverrideChange & { mates?: string[] })[]): Promise<{ ok?: string; error?: string }> {
  const user = await requireUser();
  const bad: string[] = [];
  const clean = changes.filter((c) => isDateStr(c.day) && c.employee).map((c) => {
    const out: store.OverrideChange = { employee: c.employee, day: c.day };
    for (const f of FIELDS) {
      if (!(f in c)) continue;
      let v = String(c[f] ?? "").trim();
      if ((f === "clock_in" || f === "clock_out") && v) {
        if (parseClock(v) === null) bad.push(`${c.day} ${v}`);
        if (v.split(":").length === 2) v += ":00";
        v = v.padStart(8, "0");
      }
      out[f] = v;
    }
    return out;
  });
  if (bad.length) return { error: `시각 형식이 맞지 않습니다 (HH:MM): ${bad.join(", ")}` };
  // 같이 근무한 직원: 같은 날 근무지(있으면)·업무내용(있으면)을 똑같이, 인원은 "나를 뺀 같이 일한 사람"으로
  // 예) 김환복이 이정헌·조승연을 고르면 이정헌 = 김환복 조승연, 조승연 = 김환복 이정헌
  const mateRows: store.OverrideChange[] = [];
  const copyFrom = new Map<string, string>(); // '직원|날짜' -> 고른 사람 (보고서 줄 복사용)
  for (const c of changes) {
    if (!isDateStr(c.day) || !Array.isArray(c.mates)) continue;
    const place = String(c.place ?? "").trim(), work = String(c.work ?? "").trim(), work_ot = String(c.work_ot ?? "").trim();
    const mates = [...new Set(c.mates.map((x) => String(x).trim()).filter((x) => x && x !== c.employee))];
    const group = [c.employee, ...mates];
    const words = String(c.note ?? "").split(/[\s,·/]+/).filter(Boolean);
    const rest = words.filter((w) => !group.includes(w)); // 이름이 아닌 글은 그대로 둔다
    for (const m of mates) {
      if ([...clean, ...mateRows].some((x) => x.employee === m && x.day === c.day)) continue;
      const note = [...group.filter((x) => x !== m), ...rest].join(" ");
      mateRows.push({ employee: m, day: c.day, note, ...(place ? { place } : {}), ...(work ? { work } : {}), ...(work_ot ? { work_ot } : {}) });
      copyFrom.set(`${m}|${c.day}`, c.employee);
    }
  }
  const n = await store.saveOverrides([...clean, ...mateRows], user.loginId);
  // 일일 근태현황 보고서에도 근무지·업무내용 반영 (보고서가 있는 날만)
  const emps = (await loadBase()).employees;
  const info = (name: string) => { const e = emps.find((x) => x.name === name); return { dept: e?.dept ?? "", rank: e?.rank ?? "" }; };
  const synced = await syncReports([...clean, ...mateRows].map((c) => ({ ...c, copyFrom: copyFrom.get(`${c.employee}|${c.day}`) })),
    user.loginId, info);
  revalidatePath("/", "layout");
  const who = [...new Set(mateRows.map((r) => r.employee))];
  return { ok: `${clean[0]?.employee ?? ""}: ${n - mateRows.length}일을 저장했습니다.${who.length ? ` 같이 근무한 ${who.join(", ")}에게도 ${mateRows.length}건 반영했습니다.` : ""}${synced ? ` 일일 근태현황 보고서 ${synced}일치에도 반영했습니다.` : ""}` };
}

export async function revertEdits(employee: string, days: string[]): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  const ds = days.filter(isDateStr);
  if (!ds.length) return { error: "되돌릴 날짜를 골라 주세요." };
  await store.clearOverrides(employee, ds);
  revalidatePath("/", "layout");
  return { ok: `${employee}: ${ds.map((d) => dayLabel(d)).join(", ")}을(를) 원래 값으로 되돌렸습니다.` };
}
