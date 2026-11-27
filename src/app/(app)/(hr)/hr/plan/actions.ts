"use server";
/** 인력계획: 부서별 정원, 인력 충원계획 (설정 hr_capacity · hr_plans) */
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import * as store from "@/lib/store";
import { type HirePlan, PLAN_STAGES } from "@/lib/인사노무/hrPlan";


export async function saveCapacity(dept: string, n: number): Promise<{ error?: string }> {
  await requirePerm("update");
  if (!dept || !Number.isFinite(n) || n < 0 || n > 999) return { error: "정원은 0~999 사이 숫자로 넣어 주세요." };
  const cur = await store.getSetting<Record<string, number>>("hr_capacity", {});
  await store.setSetting("hr_capacity", { ...cur, [dept]: Math.round(n) });
  revalidatePath("/hr/plan");
  return {};
}

export async function savePlan(p: Partial<HirePlan>): Promise<{ error?: string; prev?: HirePlan | null }> {
  await requirePerm("update");
  const plans = await store.getSetting<HirePlan[]>("hr_plans", []);
  const title = String(p.title ?? "").trim();
  if (!p.id && !title) return { error: "무엇을 충원할지(예: 생산팀 조립반) 적어 주세요." };
  const i = p.id ? plans.findIndex((x) => x.id === p.id) : -1;
  const prev = i >= 0 ? plans[i] : null;
  const next: HirePlan = {
    id: prev?.id ?? `p${Date.now().toString(36)}`, created: prev?.created ?? new Date().toISOString().slice(0, 10),
    title: title || prev?.title || "", dept: String(p.dept ?? prev?.dept ?? ""), n: Math.max(1, Math.round(Number(p.n ?? prev?.n ?? 1)) || 1),
    why: String(p.why ?? prev?.why ?? ""), when: String(p.when ?? prev?.when ?? ""),
    stage: Math.max(0, Math.min(PLAN_STAGES.length, Math.round(Number(p.stage ?? prev?.stage ?? 0)))),
  };
  const out = i >= 0 ? plans.map((x, j) => (j === i ? next : x)) : [next, ...plans];
  await store.setSetting("hr_plans", out);
  revalidatePath("/hr/plan");
  return { prev };
}

export async function deletePlan(id: string): Promise<{ removed?: HirePlan }> {
  await requirePerm("delete");
  const plans = await store.getSetting<HirePlan[]>("hr_plans", []);
  const removed = plans.find((x) => x.id === id);
  await store.setSetting("hr_plans", plans.filter((x) => x.id !== id));
  revalidatePath("/hr/plan");
  return { removed };
}

/** 되돌리기: 지운 계획을 그대로 다시 넣기, 또는 바꾸기 전 값으로 */
export async function restorePlan(p: HirePlan): Promise<void> {
  await requirePerm("update");
  const plans = await store.getSetting<HirePlan[]>("hr_plans", []);
  const out = plans.some((x) => x.id === p.id) ? plans.map((x) => (x.id === p.id ? p : x)) : [p, ...plans];
  await store.setSetting("hr_plans", out);
  revalidatePath("/hr/plan");
}
