"use server";
/** 정비적격심사: 사람별 이전 경력·학력 저장, 요청서류 항목별 첨부. ga_files ref = 'qual:doc:<항목 key>' */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/store";
import { loadQualSettings } from "@/lib/인사노무/qualData";
import { pdfText, parseCareers } from "@/lib/인사노무/careerPdf";
import { type Career, EDU, QUAL_DOCS, type QualPerson } from "@/lib/인사노무/qualGrade";
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
  if (s.people[name]?.careers?.length) p.careers = s.people[name].careers; // 4대보험 이력은 따로 저장하므로 지키기
  if (Object.keys(p).length) people[name] = p; else delete people[name];
  await setSetting("qual_people", { ...s, people });
  revalidatePath("/hr/qual");
  return { ok: `${name} 저장` };
}

const isoOk = (v: unknown) => typeof v === "string" && (v === "" || isDateStr(v));

/** 한 사람의 다른 회사 근무 목록 저장 (관련 경력 체크 포함) */
export async function saveQualCareers(name: string, careers: Career[]): Promise<Res> {
  await requireAdmin();
  const list = (Array.isArray(careers) ? careers : []).slice(0, 60)
    .filter((c) => c && String(c.company ?? "").trim() && isDateStr(c.from) && isoOk(c.to) && (!c.to || c.to >= c.from))
    .map((c) => ({ company: String(c.company).trim().slice(0, 60), from: c.from, to: c.to || "", related: !!c.related }))
    .sort((a, b) => a.from.localeCompare(b.from));
  const s = await loadQualSettings();
  const people = { ...s.people, [name]: { ...(s.people[name] ?? {}), careers: list } };
  if (!list.length) delete people[name].careers;
  await setSetting("qual_people", { ...s, people });
  revalidatePath("/hr/qual");
  return { ok: `${name}: 근무 ${list.length}곳 저장` };
}

/** 건강보험 자격득실확인서·고용보험 가입이력 PDF → 근무 목록 (저장은 화면에서 확인 후). 파일은 증빙으로 보관 */
export async function readCareerPdf(fd: FormData): Promise<{ error?: string; careers?: Career[]; note?: string }> {
  await requireAdmin();
  const name = String(fd.get("name") ?? "");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "파일을 골라 주세요." };
  if (!/\.pdf$/i.test(file.name) || file.size > MAX) return { error: "20MB 이하 PDF만 읽을 수 있습니다." };
  const data = new Uint8Array(await file.arrayBuffer());
  await addFile(`qual:person:${name}`, file.name, file.type || "application/pdf", data);
  let text = "";
  try { text = await pdfText(data); } catch (e) { return { error: e instanceof Error ? e.message : "읽지 못했습니다.", careers: [] }; }
  const careers = parseCareers(text, /에쓰엔|에스엔\s*\(주\)|\(주\)\s*에스엔|SN\s*Heavy/i);
  revalidatePath("/hr/qual");
  return { careers, note: text.replace(/\s/g, "").length < 30 ? "글자가 없는 스캔본입니다. 근무 기간을 직접 적어 주세요." : careers.length ? "" : "근무 기간을 찾지 못했습니다. 직접 적어 주세요." };
}

/** 선택한 사람들을 기술인력에서 빼거나(include=false) 다시 넣기(true) */
export async function bulkInclude(fd: FormData): Promise<void> {
  await requireAdmin();
  const names = fd.getAll("names").map(String).filter(Boolean);
  const inc = String(fd.get("op")) === "in";
  if (!names.length) return;
  const s = await loadQualSettings();
  const people = { ...s.people };
  for (const n of names) people[n] = { ...(people[n] ?? {}), include: inc };
  await setSetting("qual_people", { ...s, people });
  revalidatePath("/hr/qual");
}

/** 관련 자격증·안전관리 가점 자격 고르기 */
export async function saveQualCerts(fd: FormData): Promise<void> {
  await requireAdmin();
  const certs = fd.getAll("certs").map(String).filter(Boolean).slice(0, 100);
  const extra = String(fd.get("extra") ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
  const safety = fd.getAll("safety").map(String).filter(Boolean).slice(0, 100);
  const s = await loadQualSettings();
  await setSetting("qual_people", { ...s, certs: [...new Set([...certs, ...extra])], safety });
  revalidatePath("/hr/qual");
}
