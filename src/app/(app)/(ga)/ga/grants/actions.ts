"use server";
/** 지원사업 저장 (관리자만). 저장은 업무 대장 ledger_rows(book = grants). 단계를 바꿔도 앞 단계 첨부는 지우지 않는다. */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { bookOf } from "@/lib/대장/books";
import { cleanData, type Data } from "@/lib/대장/logic";
import * as store from "@/lib/대장/store";
import { addFile, deleteFile } from "@/lib/총무/mail";
import { currentStage, docRef, type GrantDocs, readDocs, stageOf } from "@/lib/총무/grants";

type Res = { ok?: string; error?: string; id?: number } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|heic|tiff?|hwpx?|docx?|xlsx?|pptx?|zip)$/i;
const filesOf = (f: FormData) => f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
const badFiles = (files: File[]) => {
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  return bad.length ? `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` : null;
};
const KEEP_FOLDERS = ["6. 성과·수요조사", "7. 기타"]; // 단계와 상관없이 직접 고른 폴더

async function load(id: number) {
  const row = await store.loadRow(id);
  if (!row || row.book !== "grants") throw new Error("없는 지원사업입니다.");
  return row;
}
async function put(id: number, data: Data) {
  const book = bookOf("grants")!;
  await store.saveRow("grants", id, data, data[book.day] ?? null);
  revalidatePath("/ga/grants", "layout");
}

/** 등록·고치기 (서랍). 폴더는 단계에 따라 자동, '6·7'을 고르면 그 폴더. 화면에 없는 칸(단계별 서류)은 그대로 둔다. */
export async function saveGrant(_prev: Res, f: FormData): Promise<Res> {
  await requireAdmin();
  const book = bookOf("grants")!;
  const id0 = Number(f.get("id") || 0);
  const old = id0 ? (await load(id0)).data : {};
  const raw: Data = { ...old, ...Object.fromEntries(book.fields.filter((x) => f.has(`f_${x.k}`)).map((x) => [x.k, String(f.get(`f_${x.k}`) ?? "")])) };
  const st = stageOf(raw.stage || "notice")!;
  raw.stage = st.key;
  const pick = String(f.get("f_folder") ?? "");
  raw.folder = KEEP_FOLDERS.includes(pick) ? pick : st.folder;
  const c = cleanData(book, raw);
  if (c.error) return { error: c.error };
  const files = filesOf(f);
  const bad = badFiles(files);
  if (bad) return { error: bad };
  const id = await store.saveRow("grants", id0, c.data, c.day);
  for (const x of files) await addFile(store.rowRef(id), x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
  revalidatePath("/ga/grants", "layout");
  return { ok: id0 ? "저장했습니다." : "등록했습니다.", id };
}

/** 단계 바꾸기 (다음 단계·미선정·협약 해지·되돌리기). 폴더도 따라 바뀌고, 첨부는 그대로. */
export async function setGrantStage(id: number, stage: string): Promise<void> {
  await requireAdmin();
  const st = stageOf(stage);
  if (!st) throw new Error("없는 단계입니다.");
  const d = { ...(await load(id)).data };
  d.stage = st.key;
  if (!KEEP_FOLDERS.includes(d.folder ?? "")) d.folder = st.folder;
  await put(id, d);
}

async function editDocs(id: number, fn: (docs: GrantDocs) => void) {
  const d = { ...(await load(id)).data };
  const docs = readDocs(d);
  fn(docs);
  d.docs = JSON.stringify(docs);
  if (!d.stage) d.stage = currentStage(d);
  await put(id, d);
}
const slot = (docs: GrantDocs, stage: string) => (docs[stage] ??= { done: [], extra: [] });

/** 서류 준비 완료 표시 켜고 끄기 */
export async function toggleGrantDoc(id: number, stage: string, doc: string, done: boolean): Promise<void> {
  await requireAdmin();
  await editDocs(id, (docs) => {
    const s = slot(docs, stage);
    s.done = done ? [...new Set([...s.done, doc])] : s.done.filter((x) => x !== doc);
  });
}

/** 이 사업에만 필요한 서류 더하기·빼기 (뺄 때 첨부가 있으면 남겨 둔다) */
export async function addGrantDoc(id: number, stage: string, doc: string): Promise<void> {
  await requireAdmin();
  const name = doc.trim();
  if (!name) return;
  await editDocs(id, (docs) => { const s = slot(docs, stage); if (!s.extra.includes(name)) s.extra.push(name); });
}
export async function removeGrantDoc(id: number, stage: string, doc: string): Promise<void> {
  await requireAdmin();
  await editDocs(id, (docs) => { const s = slot(docs, stage); s.extra = s.extra.filter((x) => x !== doc); s.done = s.done.filter((x) => x !== doc); });
}

/** 서류 첨부: 올리면 그 서류는 준비 완료로 표시 */
export async function uploadGrantDoc(_prev: Res, f: FormData): Promise<Res> {
  await requireAdmin();
  const id = Number(f.get("id")), stage = String(f.get("stage")), doc = String(f.get("doc"));
  const files = filesOf(f);
  if (!id || !stage || !doc || !files.length) return { error: "파일을 골라 주세요." };
  const bad = badFiles(files);
  if (bad) return { error: bad };
  for (const x of files) await addFile(docRef(id, stage, doc), x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
  await editDocs(id, (docs) => { const s = slot(docs, stage); s.done = [...new Set([...s.done, doc])]; });
  return { ok: `${doc}: ${files.length}개 첨부` };
}

export async function deleteGrantFile(fileId: number): Promise<void> {
  await requireAdmin();
  await deleteFile(fileId);
  revalidatePath("/ga/grants", "layout");
}
