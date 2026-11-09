"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { parseApprovalFile, summarize } from "@/lib/인사노무/approvals";
import { loadHiworksFile } from "@/lib/인사노무/hiworks";
import { readRaw } from "@/lib/excel";
import { hwDeducted, parseLeaveStatus } from "@/lib/인사노무/leaveStatus";
import { nowKst } from "@/lib/time";
import { loadCapsFile } from "@/lib/인사노무/loader";
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

/** 하이웍스 '근무계획 수립이력'(휴가 신청·취소, 연장근무, 휴일근무) 파일 여러 개 저장. 결재완료만 근태로 쓴다. */
export async function uploadApprovals(_prev: Result | null, form: FormData): Promise<Result> {
  const user = await requireUser();
  const msgs: string[] = [], errors: string[] = [];
  for (const f of files(form)) {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let text = new TextDecoder("utf-8").decode(buf);
      if (!/<t[rd]/i.test(text)) text = new TextDecoder("euc-kr").decode(buf);
      const list = parseApprovalFile(text);
      if (!list.length) { errors.push(`${f.name}: 결재 내역이 없습니다.`); continue; }
      const added = await store.saveApprovals(list, f.name, user.loginId);
      const s = summarize(list);
      const parts = [s.vacation && `휴가 ${s.vacation}건`, s.cancel && `휴가 취소 ${s.cancel}건`, s.overtime && `연장근무 ${s.overtime}건`,
        s.holiday && `휴일근무 ${s.holiday}건`].filter(Boolean).join(", ");
      msgs.push(`${f.name}: ${s.total}건 읽음 (새로 ${added}건) · 결재완료 ${parts || "없음"}${s.skipped ? ` · 반려·취소 등 ${s.skipped}건은 넣지 않음` : ""}`);
    } catch (exc) {
      errors.push(`${f.name}: ${(exc as Error).message}`);
    }
  }
  if (!msgs.length && !errors.length) errors.push("파일을 골라 주세요.");
  revalidatePath("/", "layout");
  return { ok: msgs.join("\n") || undefined, errors };
}

/** 하이웍스 '휴가현황(종류별)' 파일 저장: 그 연도의 직원별 생성·사용·잔여를 통째로 바꾼다 */
export async function uploadLeaveStatus(_prev: Result | null, form: FormData): Promise<Result> {
  const user = await requireUser();
  const f = files(form)[0];
  if (!f) return { errors: ["파일을 골라 주세요."] };
  try {
    const sheets = readRaw(new Uint8Array(await f.arrayBuffer()), f.name);
    const { fy, rows } = parseLeaveStatus(sheets, f.name, nowKst().slice(0, 16));
    await store.saveLeaveStatus(fy, rows, f.name, user.loginId);
    revalidatePath("/", "layout");
    const granted = rows.reduce((t, s) => t + s.granted, 0), used = rows.reduce((t, s) => t + hwDeducted(s), 0);
    const months = new Set(rows.flatMap((s) => Object.keys(s.months))).size;
    return {
      ok: `${f.name}: ${fy}년 ${rows.length}명 저장 (${rows[0].exportedAt} 기준) · 생성 ${Math.round(granted * 100) / 100}일, `
        + `사용 ${Math.round(used * 100) / 100}일${months ? ` · 월별 ${months}개월` : ""}. 연차 현황이 이 숫자로 바뀝니다.`,
    };
  } catch (exc) {
    return { errors: [`${f.name}: ${(exc as Error).message}`] };
  }
}

/** 근태현황(하이웍스 정리) 파일 저장: 명단·근태를 통째로 교체 */
export async function uploadHiworks(_prev: Result | null, form: FormData): Promise<Result> {
  const user = await requireUser();
  const f = files(form)[0];
  if (!f) return { errors: ["파일을 골라 주세요."] };
  try {
    const { roster, leaves, skipped } = loadHiworksFile(new Uint8Array(await f.arrayBuffer()), f.name);
    // 통째로 교체하므로, 근태가 하나도 없는 파일(빈 파일·다른 파일)은 기존 기록을 지우지 않도록 막는다
    if (!leaves.length) {
      return { errors: [`${f.name}: 근태 기록을 하나도 찾지 못해 저장하지 않았습니다. 기존 근태현황은 그대로 둡니다. `
        + "하이웍스 근태현황 정리 파일(날짜별 시트가 있는 파일)이 맞는지 확인해 주세요."] };
    }
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
