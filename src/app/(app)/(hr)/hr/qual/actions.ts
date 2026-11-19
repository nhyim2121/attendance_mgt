"use server";
/** 정비적격심사 서류 묶음 첨부 (관리대장·자격증 사본 등). ga_files ref = 'qual:<심사 이름>' */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { addFile } from "@/lib/총무/mail";

type Res = { ok?: string; error?: string } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|heic|tiff?|hwpx?|docx?|xlsx?|pptx?|zip)$/i;

export async function attachQualDoc(_: Res, f: FormData): Promise<Res> {
  await requireAdmin();
  const files = f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
  if (!files.length) return { error: "파일을 골라 주세요." };
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  if (bad.length) return { error: `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` };
  for (const x of files) await addFile("qual:docs", x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
  revalidatePath("/hr/qual");
  return { ok: `${files.length}개 올렸습니다.` };
}
