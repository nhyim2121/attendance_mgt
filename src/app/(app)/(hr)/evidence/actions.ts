"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import * as store from "@/lib/store";
import { isDateStr } from "@/lib/time";

type Res = { ok?: string; error?: string } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|hwpx?|docx?|xlsx?|pptx?|eml|html?|txt|zip)$/i;

export async function uploadEvidence(_prev: Res, f: FormData): Promise<Res> {
  const user = await requireUser();
  const name = String(f.get("name") ?? "").trim(), type = String(f.get("type") ?? "출장").trim();
  const from = String(f.get("from") ?? ""), to = String(f.get("to") ?? "") || from;
  const files = f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
  if (!name) return { error: "직원을 골라 주세요." };
  if (!isDateStr(from) || !isDateStr(to) || to < from) return { error: "기간을 확인해 주세요." };
  if (!files.length) return { error: "첨부할 파일을 골라 주세요." };
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  if (bad.length) return { error: `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` };
  for (const file of files) {
    await store.addAttachment({
      name, dayFrom: from, dayTo: to, type, title: String(f.get("title") ?? "").trim(), fileName: file.name,
      mime: file.type || "application/octet-stream", uploadedBy: user.loginId,
    }, new Uint8Array(await file.arrayBuffer()));
  }
  revalidatePath("/", "layout");
  return { ok: `${name} ${type} 증빙 ${files.length}개를 첨부했습니다.` };
}

export async function deleteEvidence(id: number): Promise<Res> {
  await requireUser();
  await store.deleteAttachment(id);
  revalidatePath("/", "layout");
  return { ok: "증빙을 삭제했습니다." };
}
