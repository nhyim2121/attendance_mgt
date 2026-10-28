"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { Employee } from "@/lib/employees";
import * as store from "@/lib/store";
import { isDateStr } from "@/lib/time";

export async function saveEmployeesAction(list: Employee[]): Promise<{ ok?: string; error?: string }> {
  const user = await requireUser();
  const clean = list.map((e, i) => ({
    name: String(e.name ?? ""), capsName: String(e.capsName ?? ""), empId: String(e.empId ?? ""),
    dept: String(e.dept ?? ""), rank: String(e.rank ?? ""), note: String(e.note ?? ""), ord: i + 1,
    joinDate: isDateStr(e.joinDate) ? e.joinDate : null, leaveDate: isDateStr(e.leaveDate) ? e.leaveDate : null,
  }));
  const bad = clean.filter((e) => e.joinDate && e.leaveDate && e.leaveDate < e.joinDate).map((e) => e.name);
  if (bad.length) return { error: `퇴사일이 입사일보다 빠른 직원: ${bad.join(", ")}` };
  try {
    const n = await store.saveEmployees(clean, user.loginId);
    revalidatePath("/", "layout");
    return { ok: `직원 명부를 저장했습니다 (${n}명).` };
  } catch (exc) {
    return { error: (exc as Error).message };
  }
}

/** 캡스에만 찍히는 사람을 명부 끝에 추가 */
export async function addFromCaps(names: string[], firstSeen: Record<string, string>): Promise<{ ok?: string; error?: string }> {
  const user = await requireUser();
  const emps = await store.loadEmployees();
  const add = names.filter((n) => !emps.some((e) => e.name === n)).map((n, i): Employee => ({
    name: n, capsName: "", empId: "", dept: "", rank: "", joinDate: firstSeen[n] ?? null, leaveDate: null,
    note: "캡스에서 추가", ord: emps.length + i + 1,
  }));
  await store.saveEmployees([...emps, ...add], user.loginId);
  revalidatePath("/", "layout");
  return { ok: `${names.join(", ")}을(를) 명부에 추가했습니다. 부서·입사일을 확인해 주세요.` };
}
