"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { WorkRule } from "@/lib/config";
import { ruleToSetting } from "@/lib/data";
import * as store from "@/lib/store";
import { isDateStr, parseHM } from "@/lib/time";

type Res = { ok?: string; error?: string } | null;

export async function saveRule(_prev: Res, form: FormData): Promise<Res> {
  await requireUser();
  const start = parseHM(String(form.get("start") ?? "")), end = parseHM(String(form.get("end") ?? ""));
  if (start === null || end === null || end <= start) return { error: "출근·퇴근 기준 시각을 확인해 주세요." };
  const workdays = form.getAll("workdays").map(Number).filter((d) => d >= 0 && d <= 6).sort();
  const roundMin = Number(form.get("round"));
  const rule: WorkRule = {
    start, end, graceMin: Math.min(120, Math.max(0, Number(form.get("grace")) || 0)), workdays,
    overtimeMin: Math.min(240, Math.max(0, Number(form.get("overtime")) || 0)),
    roundMin: [10, 15, 30, 60].includes(roundMin) ? roundMin : 30, labelAll: form.get("labelAll") === "on",
  };
  await store.setSetting("rule", ruleToSetting(rule));
  revalidatePath("/", "layout");
  return { ok: "근무 기준을 저장했습니다 (모든 사용자 공통)." };
}

/** 한 줄에 하나씩: 'YYYY-MM-DD 이름' */
export async function saveHolidays(_prev: Res, form: FormData): Promise<Res> {
  await requireUser();
  const out: Record<string, string> = {};
  const bad: string[] = [];
  for (const line of String(form.get("text") ?? "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const [d, ...rest] = t.split(/\s+/);
    if (!isDateStr(d)) {
      bad.push(t);
      continue;
    }
    out[d] = rest.join(" ") || "휴일";
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  await store.setSetting("holidays", sorted);
  revalidatePath("/", "layout");
  return { ok: `공휴일 ${Object.keys(sorted).length}일을 저장했습니다 (모든 사용자 공통).${bad.length ? `\n날짜 형식이 아니어서 뺀 줄: ${bad.join(", ")}` : ""}` };
}
