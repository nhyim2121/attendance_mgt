"use server";
/** 채용관리: 지원자 단계 바꾸기·합격/불합격 통보 기록 (지원자 관리 대장 applicants) */
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import type { Data } from "@/lib/대장/logic";
import { loadRow, saveRow } from "@/lib/대장/store";
import { todayKst } from "@/lib/time";

const STAGES = ["서류 검토", "서류 합격", "면접 예정", "면접 완료", "최종 합격", "입사 확정", "불합격", "지원 취소·포기"];

/** 지원자 단계 바꾸기. 최종 합격·불합격이면 결과 통보일을 오늘로. 되돌리기용으로 바꾸기 전 data를 돌려준다 */
export async function setApplicantStage(id: number, stage: string): Promise<{ error?: string; prev?: Data }> {
  await requirePerm("update");
  if (!STAGES.includes(stage)) return { error: "알 수 없는 단계입니다." };
  const row = await loadRow(id);
  if (!row || row.book !== "applicants") return { error: "지원자를 찾지 못했습니다." };
  const data: Data = { ...row.data, stage };
  if ((stage === "최종 합격" || stage === "불합격") && !row.data.notice) data.notice = todayKst();
  await saveRow("applicants", id, data, row.day);
  revalidatePath("/hr/hire");
  return { prev: row.data };
}

export async function restoreApplicant(id: number, data: Data): Promise<void> {
  await requirePerm("update");
  const row = await loadRow(id);
  if (!row || row.book !== "applicants") return;
  await saveRow("applicants", id, data, row.day);
  revalidatePath("/hr/hire");
}
