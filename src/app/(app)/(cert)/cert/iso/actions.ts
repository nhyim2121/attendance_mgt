"use server";
/** ISO 27001 실적문서: 새로 작성·저장·줄 늘리기·삭제 (관리자만) */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requirePerm } from "@/lib/auth";
import * as iso from "@/lib/인증/iso27k";
import { isDateStr, todayKst } from "@/lib/time";

/** 새 문서: 빈 양식 또는 고른 문서를 복사 */
export async function createIsoDoc(f: FormData) {
  await requirePerm("create");
  const u = await requireAdmin();
  const form = await iso.findForm(String(f.get("form") ?? ""));
  if (!form) throw new Error("양식을 찾을 수 없습니다.");
  const from = Number(f.get("copy") || 0);
  const src = from ? await iso.loadDoc(from) : null;
  const day = todayKst();
  const id = await iso.createDoc(form.key, day, src ? `${src.title} (복사)` : `${form.title} ${day.slice(0, 7)}`,
    src?.form === form.key ? src.data : { v: {}, rows: {} }, u.name);
  revalidatePath("/cert/iso", "layout");
  redirect(`/cert/iso/doc?form=${form.key}&id=${id}`);
}

/** 자동 저장: 제목·작성일·바뀐 칸 */
export async function saveIsoDoc(id: number, patch: { title?: string; day?: string; v?: Record<string, string> }): Promise<{ ok?: string; error?: string }> {
  try {
    await requirePerm("update");
    const u = await requireAdmin();
    const doc = await iso.loadDoc(id);
    if (!doc) return { error: "문서가 없습니다." };
    const p: Parameters<typeof iso.updateDoc>[1] = {};
    if (patch.title !== undefined) p.title = patch.title.trim().slice(0, 200) || doc.title;
    if (patch.day !== undefined) { if (!isDateStr(patch.day)) return { error: "작성일을 확인해 주세요." }; p.day = patch.day; }
    if (patch.v) p.data = { ...doc.data, v: patch.v };
    await iso.updateDoc(id, p, u.name);
    if (patch.title !== undefined || patch.day !== undefined) revalidatePath("/cert/iso", "layout");
    return { ok: "저장됨" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했습니다." };
  }
}

/** 표 줄 늘리기·줄이기 (늘린 줄만 줄일 수 있음) */
export async function growIsoTable(id: number, table: string, delta: number) {
  await requirePerm("update");
  const u = await requireAdmin();
  const doc = await iso.loadDoc(id);
  if (!doc) return;
  const n = Math.max(0, Math.min(200, (doc.data.rows[table] ?? 0) + delta));
  await iso.updateDoc(id, { data: { ...doc.data, rows: { ...doc.data.rows, [table]: n } } }, u.name);
  revalidatePath("/cert/iso/doc");
}

export async function deleteIsoDoc(f: FormData) {
  await requirePerm("delete");
  await requireAdmin();
  const id = Number(f.get("id"));
  const doc = await iso.loadDoc(id);
  if (doc) await iso.deleteDoc(id);
  revalidatePath("/cert/iso", "layout");
  redirect(`/cert/iso/doc?form=${doc?.form ?? ""}`);
}
