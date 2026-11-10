"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireBid } from "@/lib/auth";

/** 입찰 대장은 담당자도, 나머지는 관리자만 (담당자는 DB 규칙상 입찰 대장 줄만 건드릴 수 있다) */
const guardBook = (key: string) => (key === "bids" ? requireBid() : requireAdmin());
import { readRaw } from "@/lib/excel";
import { bookOf } from "@/lib/대장/books";
import { cleanData, type Data, parseGrid } from "@/lib/대장/logic";
import * as store from "@/lib/대장/store";
import { addFile } from "@/lib/총무/mail";
import { nowKst } from "@/lib/time";

type Res = { ok?: string; error?: string } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|heic|tiff?|hwpx?|docx?|xlsx?|pptx?|zip)$/i;
const filesOf = (f: FormData) => f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
const badFiles = (files: File[]) => {
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  return bad.length ? `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` : null;
};
async function saveFiles(id: number, files: File[]) {
  for (const x of files) await addFile(store.rowRef(id), x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
}

/** 적기·고치기 */
export async function saveLedger(_prev: Res, f: FormData): Promise<Res> {
  await guardBook(String(f.get("book")));
  const book = bookOf(String(f.get("book")));
  if (!book) return { error: "없는 대장입니다." };
  const raw: Data = Object.fromEntries(book.fields.map((x) => [x.k, String(f.get(`f_${x.k}`) ?? "")]));
  const c = cleanData(book, raw);
  if (c.error) return { error: c.error };
  const files = filesOf(f);
  const bad = badFiles(files);
  if (bad) return { error: bad };
  const id0 = Number(f.get("id") || 0);
  const id = await store.saveRow(book.key, id0, c.data, c.day);
  await saveFiles(id, files);
  revalidatePath("/", "layout");
  if (id0) redirect(String(f.get("back") || "/"));
  return { ok: `적었습니다.${files.length ? ` (첨부 ${files.length}개)` : ""}` };
}

export async function attachLedger(_prev: Res, f: FormData): Promise<Res> {
  await requireBid();
  const id = Number(f.get("id")), files = filesOf(f);
  if (!id || !files.length) return { error: "파일을 골라 주세요." };
  const bad = badFiles(files);
  if (bad) return { error: bad };
  await saveFiles(id, files);
  revalidatePath("/", "layout");
  return { ok: "첨부했습니다." };
}

export async function removeLedgerRow(id: number): Promise<void> {
  await requireBid();
  await store.deleteRow(id);
  revalidatePath("/", "layout");
}

/** 예전 엑셀 대장 가져오기: 머리글 이름으로 칸을 맞춘다 */
export async function importLedgerFile(_prev: Res, f: FormData): Promise<Res> {
  await guardBook(String(f.get("book")));
  const book = bookOf(String(f.get("book")));
  const file = filesOf(f)[0];
  if (!book) return { error: "없는 대장입니다." };
  if (!file || !/\.(xlsx?|xlsm|csv)$/i.test(file.name)) return { error: "엑셀(.xlsx·.xls·.xlsm)이나 CSV 파일을 골라 주세요." };
  const sheets = readRaw(new Uint8Array(await file.arrayBuffer()), file.name);
  const out: { data: Data; day: string | null }[] = [];
  const matched = new Set<string>();
  let skipped = 0;
  for (const [, grid] of sheets) {
    const p = parseGrid(book, grid);
    p.matched.forEach((m) => matched.add(m));
    for (const d of p.rows) {
      const c = cleanData(book, d);
      if (c.error) { skipped++; continue; }
      out.push({ data: c.data, day: c.day });
    }
  }
  if (!out.length) return { error: `맞는 칸을 찾지 못했습니다. 첫 줄 머리글에 ${book.fields.slice(0, 4).map((x) => `'${x.label}'`).join("·")} 같은 칸 이름이 있는지 확인해 주세요.${skipped ? ` (꼭 필요한 칸이 비어 건너뛴 줄 ${skipped}개)` : ""}` };
  const n = await store.importRows(book.key, out, `${nowKst().slice(0, 16)} ${file.name}`);
  revalidatePath("/", "layout");
  return { ok: `${n}줄을 가져왔습니다 (맞춘 칸: ${[...matched].join(", ")})${skipped ? ` · 꼭 필요한 칸이 비어 건너뛴 줄 ${skipped}개` : ""}.` };
}

export async function undoLedgerImport(book: string, batch: string): Promise<void> {
  await guardBook(book);
  await store.undoBatch(book, batch);
  revalidatePath("/", "layout");
}
