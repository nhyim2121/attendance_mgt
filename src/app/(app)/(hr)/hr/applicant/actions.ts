"use server";
/** 지원자 상세: 진행 단계·면접 점수 바로 바꾸기 (나머지 칸은 지원자 관리 대장의 고치기에서) */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { addDays, todayKst } from "@/lib/time";
import * as store from "@/lib/대장/store";

export async function setApplicantStage(f: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(f.get("id"));
  const row = id ? await store.loadRow(id) : null;
  if (!row || row.book !== "applicants") return;
  const data = { ...row.data };
  const stage = String(f.get("stage") ?? "");
  if (stage) data.stage = stage;
  const score = String(f.get("score") ?? "").trim();
  if (f.has("score")) data.score = score.replace(/[^\d.]/g, "");
  const memo = f.get("memo");
  if (memo !== null) data.memo = String(memo);
  // 불합격·포기로 바뀌면 결과 통보일·서류 파기 기한(기본 180일)을 비어 있을 때만 채운다
  if (["불합격", "지원 취소·포기"].includes(data.stage)) {
    data.notice ||= todayKst();
    data.purge ||= addDays(todayKst(), 180);
    data.disposed ||= "보관 중";
  }
  if (data.stage === "입사 확정") data.disposed = "입사";
  await store.saveRow("applicants", id, data, row.day);
  revalidatePath("/", "layout");
}
