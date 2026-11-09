"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import * as mail from "@/lib/총무/mail";
import { readRaw } from "@/lib/excel";
import { parseLedger } from "@/lib/총무/mailImport";
import { isDateStr, nowKst } from "@/lib/time";

type Res = { ok?: string; error?: string } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|hwpx?|docx?|xlsx?|pptx?|eml|txt|zip)$/i;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const filesOf = (f: FormData) => f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);

function badFiles(files: File[]): string | null {
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  return bad.length ? `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` : null;
}
async function saveFiles(id: number, files: File[]) {
  for (const x of files) await mail.addFile(mail.mailRef(id), x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
}

function readInput(f: FormData): mail.MailInput | string {
  const dir = str(f, "dir") as mail.Dir;
  if (!mail.DIRS.includes(dir)) return "수신/발신을 골라 주세요.";
  const day = str(f, "day"), due = str(f, "due");
  if (!isDateStr(day)) return "날짜를 확인해 주세요.";
  if (due && !isDateStr(due)) return "기한 날짜를 확인해 주세요.";
  const party = str(f, "party"), title = str(f, "title");
  const cost = str(f, "cost").replace(/[^\d]/g, "");
  if (!party && !title) return "상대처나 제목 중 하나는 적어 주세요.";
  return {
    dir, day, kind: str(f, "kind") || "공문", party, title, refNo: str(f, "refNo"), route: str(f, "route"),
    status: str(f, "status") === "처리 중" ? "처리 중" : "완료", due: due || null, note: str(f, "note"),
    replyOf: Number(str(f, "replyOf")) || null, cost: cost ? +cost : null,
  };
}

/** 새로 적기 / 고치기 (id가 있으면 고친 뒤 목록으로) */
export async function saveMail(_prev: Res, f: FormData): Promise<Res> {
  await requireAdmin();
  const m = readInput(f);
  if (typeof m === "string") return { error: m };
  const files = filesOf(f);
  const bad = badFiles(files);
  if (bad) return { error: bad };
  const id = Number(f.get("id") || 0);
  const saved = id ? await mail.updateMail(id, m) : await mail.addMail(m);
  await saveFiles(saved.id, files);
  revalidatePath("/ga", "layout");
  if (id) redirect(String(f.get("back") || "/ga/mail"));
  return { ok: `${mail.mailNo(saved)} 로 적었습니다.${files.length ? ` (첨부 ${files.length}개)` : ""}` };
}

/** 줄마다 붙이는 첨부 */
export async function attachMail(_prev: Res, f: FormData): Promise<Res> {
  await requireAdmin();
  const id = Number(f.get("id"));
  const files = filesOf(f);
  if (!id || !files.length) return { error: "파일을 골라 주세요." };
  const bad = badFiles(files);
  if (bad) return { error: bad };
  await saveFiles(id, files);
  revalidatePath("/ga", "layout");
  return { ok: "첨부했습니다." };
}

export async function toggleMailStatus(id: number, status: string): Promise<void> {
  await requireAdmin();
  await mail.setMailStatus(id, status === "처리 중" ? "완료" : "처리 중");
  revalidatePath("/ga", "layout");
}

export async function removeMail(id: number): Promise<void> {
  await requireAdmin();
  await mail.deleteMail(id);
  revalidatePath("/ga", "layout");
}

export async function removeFile(id: number): Promise<void> {
  await requireAdmin();
  await mail.deleteFile(id);
  revalidatePath("/ga", "layout");
}

/** 예전 엑셀 대장 가져오기 */
export async function importLedger(_prev: Res, f: FormData): Promise<Res> {
  await requireAdmin();
  const file = filesOf(f)[0];
  if (!file) return { error: "엑셀 파일을 골라 주세요." };
  if (!/\.(xlsx?|csv)$/i.test(file.name)) return { error: "엑셀(.xlsx·.xls)이나 CSV 파일만 가져올 수 있습니다." };
  const dir = str(f, "dir") === "발신" ? "발신" : "수신";
  const sheets = readRaw(new Uint8Array(await file.arrayBuffer()), file.name);
  const rows = [], cols = new Set<string>();
  let skipped = 0;
  for (const [, grid] of sheets) {
    const r = parseLedger(grid, dir);
    rows.push(...r.rows); skipped += r.skipped; r.columns.forEach((c) => cols.add(c));
  }
  if (!rows.length) return { error: "날짜 칸이 있는 대장 표를 찾지 못했습니다. 첫 줄(머리글)에 '날짜'·'제목'·'발신처' 같은 칸 이름이 있는지 확인해 주세요." };
  const batch = `${nowKst().slice(0, 16)} ${file.name}`;
  const n = await mail.importMails(rows, batch);
  revalidatePath("/ga", "layout");
  return { ok: `${n}건을 가져왔습니다 (읽은 칸: ${[...cols].join(", ")})${skipped ? ` · 날짜를 못 읽어 건너뛴 줄 ${skipped}개` : ""}. 잘못 들어왔으면 아래에서 되돌릴 수 있습니다.` };
}

export async function undoLedger(batch: string): Promise<void> {
  await requireAdmin();
  await mail.undoImport(batch);
  revalidatePath("/ga", "layout");
}
