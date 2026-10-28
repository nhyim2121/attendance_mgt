"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { loadHiworksFile } from "@/lib/hiworks";
import { loadCapsFile } from "@/lib/loader";
import * as store from "@/lib/store";

export interface Result {
  ok?: string;
  errors?: string[];
  lastDay?: string; // 올린 기록의 마지막 날 (일일 현황에서 그날로 이동)
}

const files = (form: FormData) => form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

/** 캡스 월별 파일(여러 개) 저장 */
export async function uploadCaps(_prev: Result | null, form: FormData): Promise<Result> {
  const user = await requireUser();
  const msgs: string[] = [], errors: string[] = [];
  let lastDay = "";
  for (const f of files(form)) {
    try {
      const { records, info } = loadCapsFile(new Uint8Array(await f.arrayBuffer()), f.name);
      const added = await store.saveCaps(records, info, user.loginId);
      msgs.push(`${f.name}: ${records.length.toLocaleString()}건 중 새 기록 ${added.toLocaleString()}건 저장 (${info.period})`);
      const last = records.reduce((a, r) => (r.day > a ? r.day : a), "");
      if (last > lastDay) lastDay = last;
    } catch (exc) {
      errors.push(`${f.name}: ${(exc as Error).message}`);
    }
  }
  if (!msgs.length && !errors.length) errors.push("파일을 골라 주세요.");
  revalidatePath("/", "layout");
  return { ok: msgs.join("\n") || undefined, errors, lastDay: lastDay || undefined };
}

/** 근태현황(하이웍스 정리) 파일 저장: 명단·근태를 통째로 교체 */
export async function uploadHiworks(_prev: Result | null, form: FormData): Promise<Result> {
  const user = await requireUser();
  const f = files(form)[0];
  if (!f) return { errors: ["파일을 골라 주세요."] };
  try {
    const { roster, leaves, skipped } = loadHiworksFile(new Uint8Array(await f.arrayBuffer()), f.name);
    await store.saveHiworks(roster, leaves, f.name, user.loginId);
    revalidatePath("/", "layout");
    const note = skipped.length ? ` (날짜 시트가 아니어서 건너뜀: ${skipped.join(", ")})` : "";
    return { ok: `${f.name}: 명단 ${roster.length}명, 근태 ${leaves.length.toLocaleString()}건 저장${note}` };
  } catch (exc) {
    return { errors: [`${f.name}: ${(exc as Error).message}`] };
  }
}

export async function deleteUploadAction(_prev: Result | null, form: FormData): Promise<Result> {
  await requireAdmin();
  const id = Number(form.get("id"));
  try {
    const n = await store.deleteUpload(id);
    revalidatePath("/", "layout");
    return { ok: `업로드 #${id}의 기록 ${n.toLocaleString()}건을 삭제했습니다.` };
  } catch (exc) {
    return { errors: [(exc as Error).message] };
  }
}

export async function deleteMonthAction(_prev: Result | null, form: FormData): Promise<Result> {
  await requireAdmin();
  const month = String(form.get("month"));
  if (form.get("confirm") !== "on") return { errors: [`${month} 삭제를 확인해 주세요.`] };
  try {
    const n = await store.deleteMonth(month);
    revalidatePath("/", "layout");
    return { ok: `${month} 캡스 기록 ${n.toLocaleString()}건을 삭제했습니다.` };
  } catch (exc) {
    return { errors: [(exc as Error).message] };
  }
}
