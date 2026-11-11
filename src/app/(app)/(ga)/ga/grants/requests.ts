"use server";
/** 지원사업 자료 요청 목록 (data.reqs JSON). 자료 첨부 ref = 'lg:<id>/rq-<요청>/<자료>'. 관리자만. */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { bookOf } from "@/lib/대장/books";
import type { Data } from "@/lib/대장/logic";
import * as store from "@/lib/대장/store";
import { buildGrantFile } from "@/lib/총무/grantGen";
import { type GrantReq, genKindOf, parseReqItems, readReqs, reqRef } from "@/lib/총무/grants";
import { addFile, deleteFilesOf, moveFiles } from "@/lib/총무/mail";

type Res = { ok?: string; error?: string } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|heic|tiff?|hwpx?|docx?|xlsx?|pptx?|zip)$/i;

async function edit(id: number, fn: (reqs: GrantReq[]) => void) {
  const row = await store.loadRow(id);
  if (!row || row.book !== "grants") throw new Error("없는 지원사업입니다.");
  const d: Data = { ...row.data };
  const reqs = readReqs(d);
  fn(reqs);
  d.reqs = JSON.stringify(reqs);
  await store.saveRow("grants", id, d, d[bookOf("grants")!.day] ?? null);
  revalidatePath("/ga/grants", "layout");
}
const find = (reqs: GrantReq[], rid: string) => {
  const r = reqs.find((x) => x.id === rid);
  if (!r) throw new Error("없는 자료 요청입니다.");
  return r;
};

/** 새 자료 요청: 메일 본문을 붙여 넣으면 '- 항목' 줄을 자료 목록으로 */
export async function addRequest(id: number, title: string, from: string, due: string, text: string): Promise<void> {
  await requireAdmin();
  const items = parseReqItems(text);
  const lines = items.length ? items : text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  await edit(id, (reqs) => reqs.push({
    id: Date.now().toString(36), title: title.trim() || "자료 요청", from: from.trim(), due: due.trim(), items: lines.map((name) => ({ name })),
  }));
}
export async function updateRequest(id: number, rid: string, title: string, from: string, due: string): Promise<void> {
  await requireAdmin();
  await edit(id, (reqs) => { const r = find(reqs, rid); r.title = title.trim() || r.title; r.from = from.trim(); r.due = due.trim(); });
}
/** 요청 지우기: 그 요청에 붙은 자료 파일도 지운다 (화면에서 한 번 더 묻는다) */
export async function deleteRequest(id: number, rid: string): Promise<void> {
  await requireAdmin();
  let names: string[] = [];
  await edit(id, (reqs) => { names = find(reqs, rid).items.map((x) => x.name); reqs.splice(reqs.findIndex((x) => x.id === rid), 1); });
  for (const n of names) await deleteFilesOf(reqRef(id, rid, n));
}

export async function addReqItem(id: number, rid: string, name: string): Promise<void> {
  await requireAdmin();
  const n = name.trim();
  if (!n) return;
  await edit(id, (reqs) => { const r = find(reqs, rid); if (!r.items.some((x) => x.name === n)) r.items.push({ name: n }); });
}
/** 자료 이름 고치기: 붙은 파일도 같이 옮긴다 */
export async function renameReqItem(id: number, rid: string, from: string, to: string): Promise<{ error?: string }> {
  await requireAdmin();
  const n = to.trim();
  if (!n || n === from) return {};
  let dup = false;
  await edit(id, (reqs) => {
    const r = find(reqs, rid);
    if (r.items.some((x) => x.name === n)) { dup = true; return; }
    const it = r.items.find((x) => x.name === from);
    if (it) it.name = n;
  });
  if (dup) return { error: "같은 이름의 자료가 이미 있습니다." };
  await moveFiles(reqRef(id, rid, from), reqRef(id, rid, n));
  return {};
}
export async function deleteReqItem(id: number, rid: string, name: string): Promise<void> {
  await requireAdmin();
  await edit(id, (reqs) => { const r = find(reqs, rid); r.items = r.items.filter((x) => x.name !== name); });
  await deleteFilesOf(reqRef(id, rid, name));
}
/** 보유 안 함 · 직접 완료 표시 · 메모 */
export async function setReqItem(id: number, rid: string, name: string, p: { na?: boolean; done?: boolean; note?: string }): Promise<void> {
  await requireAdmin();
  await edit(id, (reqs) => { const it = find(reqs, rid).items.find((x) => x.name === name); if (it) Object.assign(it, p); });
}

/** 자료 첨부 */
export async function uploadReqFile(_prev: Res, f: FormData): Promise<Res> {
  await requireAdmin();
  const id = Number(f.get("id")), rid = String(f.get("rid")), name = String(f.get("item"));
  const files = f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
  if (!id || !rid || !name || !files.length) return { error: "파일을 골라 주세요." };
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  if (bad.length) return { error: `20MB 이하 PDF·이미지·한글·오피스 파일만: ${bad.join(", ")}` };
  for (const x of files) await addFile(reqRef(id, rid, name), x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
  await edit(id, (reqs) => { const it = find(reqs, rid).items.find((x) => x.name === name); if (it) it.na = false; });
  return { ok: `${files.length}개 첨부` };
}

/** 자료 만들기: 직원 명부로 엑셀을 만들어 그 자료에 바로 첨부 */
export async function generateReqFile(id: number, rid: string, name: string): Promise<{ ok?: string; error?: string }> {
  await requireAdmin();
  const kind = genKindOf(name);
  if (!kind) return { error: "이 자료는 사이트에서 만들 수 없습니다." };
  const file = await buildGrantFile(kind, name);
  await addFile(reqRef(id, rid, name), file.name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file.data);
  revalidatePath("/ga/grants", "layout");
  return { ok: `${file.name}을(를) 만들어 첨부했습니다.` };
}
