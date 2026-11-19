"use server";
/** 정비적격심사: 사람별 이전 경력·학력 저장, 요청서류 항목별 첨부. ga_files ref = 'qual:doc:<항목 key>' */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/store";
import { loadQualSettings } from "@/lib/인사노무/qualData";
import { EDU, QUAL_DOCS, type QualPerson } from "@/lib/인사노무/qualGrade";
import { isDateStr } from "@/lib/time";
import { addFile } from "@/lib/총무/mail";

type Res = { ok?: string; error?: string } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|heic|tiff?|hwpx?|docx?|xlsx?|pptx?|zip)$/i;

export async function attachQualDoc(_: Res, f: FormData): Promise<Res> {
  await requireAdmin();
  const key = String(f.get("key") ?? "");
  if (!QUAL_DOCS.some((d) => d.key === key)) return { error: "서류 항목을 찾지 못했습니다." };
  const files = f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
  if (!files.length) return { error: "파일을 골라 주세요." };
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  if (bad.length) return { error: `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` };
  for (const x of files) await addFile(`qual:doc:${key}`, x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
  revalidatePath("/hr/qual");
  return { ok: `${files.length}개 올렸습니다.` };
}

/** 한 사람의 이전 경력(년·개월)·학력·포함 여부 */
export async function saveQualPerson(_: Res, f: FormData): Promise<Res> {
  await requireAdmin();
  const name = String(f.get("name") ?? "").trim();
  if (!name) return { error: "이름이 없습니다." };
  const num = (k: string) => Math.max(0, Math.round(Number(f.get(k) || 0)) || 0);
  const prev = num("prevY") * 12 + num("prevM");
  const edu = String(f.get("edu") ?? "");
  const eduDate = String(f.get("eduDate") ?? "");
  const inc = String(f.get("include") ?? "");
  const p: QualPerson = {
    ...(prev ? { prev } : {}),
    ...((EDU as readonly string[]).includes(edu) ? { edu } : {}),
    ...(isDateStr(eduDate) ? { eduDate } : {}),
    ...(inc === "1" ? { include: true } : inc === "0" ? { include: false } : {}),
    ...(isDateStr(String(f.get("insured") ?? "")) ? { insured: String(f.get("insured")) } : {}),
    ...(String(f.get("role") ?? "").trim() ? { role: String(f.get("role")).trim().slice(0, 40) } : {}),
    ...(String(f.get("note") ?? "").trim() ? { note: String(f.get("note")).trim().slice(0, 200) } : {}),
  };
  const s = await loadQualSettings();
  const people = { ...s.people };
  if (Object.keys(p).length) people[name] = p; else delete people[name];
  await setSetting("qual_people", { ...s, people });
  revalidatePath("/hr/qual");
  return { ok: `${name} 저장` };
}
