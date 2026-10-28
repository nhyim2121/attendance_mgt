"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import * as store from "@/lib/store";
import { dayLabel, isDateStr, parseClock } from "@/lib/time";

const FIELDS = ["clock_in", "in_type", "clock_out", "out_type", "place", "note"] as const;

/** changes: [{employee, day, 필드: 값}] 바뀐 필드만 */
export async function saveEdits(changes: store.OverrideChange[]): Promise<{ ok?: string; error?: string }> {
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
  const n = await store.saveOverrides(clean, user.loginId);
  revalidatePath("/", "layout");
  return { ok: `${clean[0]?.employee ?? ""}: ${n}일을 저장했습니다.` };
}

export async function revertEdits(employee: string, days: string[]): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  const ds = days.filter(isDateStr);
  if (!ds.length) return { error: "되돌릴 날짜를 골라 주세요." };
  await store.clearOverrides(employee, ds);
  revalidatePath("/", "layout");
  return { ok: `${employee}: ${ds.map((d) => dayLabel(d)).join(", ")}을(를) 원래 값으로 되돌렸습니다.` };
}
