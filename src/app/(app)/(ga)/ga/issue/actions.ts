"use server";
import { requirePerm } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import * as issue from "@/lib/총무/issue";
import { addFile } from "@/lib/총무/mail";
import { addDays, isDateStr, todayKst } from "@/lib/time";

type Res = { ok?: string; error?: string } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|hwpx?|docx?|xlsx?|zip)$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const s = str(f, k).replace(/[^\d]/g, ""); return s ? +s : null; };
const filesOf = (f: FormData) => f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
const badFiles = (files: File[]) => {
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  return bad.length ? `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` : null;
};

// ---------------------------------------------------------------- 발급 대장
export async function saveIssueAction(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  await requireAdmin();
  const day = str(f, "day"), docType = str(f, "docType");
  if (!isDateStr(day)) return { error: "발급일을 확인해 주세요." };
  if (!docType) return { error: "서류 종류를 적어 주세요." };
  const files = filesOf(f);
  const bad = badFiles(files);
  if (bad) return { error: bad };
  const id = await issue.saveIssue(Number(f.get("id") || 0), {
    day, docType, copies: num(f, "copies") || 1, via: str(f, "via"), purpose: str(f, "purpose"), submitTo: str(f, "submitTo"),
    requester: str(f, "requester"), fee: num(f, "fee"), note: str(f, "note"),
  });
  for (const x of files) await addFile(issue.issueRef(id), x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
  revalidatePath("/ga", "layout");
  if (f.get("id")) redirect(String(f.get("back") || "/ga/issue"));
  return { ok: `${docType} ${num(f, "copies") || 1}부 발급을 적었습니다.${files.length ? ` (첨부 ${files.length}개)` : ""}` };
}

export async function attachIssue(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  await requireAdmin();
  const id = Number(f.get("id")), files = filesOf(f);
  if (!id || !files.length) return { error: "파일을 골라 주세요." };
  const bad = badFiles(files);
  if (bad) return { error: bad };
  for (const x of files) await addFile(issue.issueRef(id), x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
  revalidatePath("/ga", "layout");
  return { ok: "첨부했습니다." };
}

export async function removeIssue(id: number): Promise<void> {
  await requirePerm("delete");
  await requireAdmin();
  await issue.deleteIssue(id);
  revalidatePath("/ga", "layout");
}

// ---------------------------------------------------------------- 인증서
export async function saveCertAction(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  await requireAdmin();
  const name = str(f, "name"), issued = str(f, "issued"), expires = str(f, "expires");
  if (!name) return { error: "인증서 이름을 적어 주세요. (예: 법인 범용 공동인증서)" };
  if ((issued && !isDateStr(issued)) || (expires && !isDateStr(expires))) return { error: "날짜를 확인해 주세요." };
  const id = Number(f.get("id") || 0);
  await issue.saveCert(id, {
    name, kind: str(f, "kind") || "기타", issuer: str(f, "issuer"), usage: str(f, "usage"), holder: str(f, "holder"),
    location: str(f, "location"), issued: issued || null, expires: expires || null, active: str(f, "active") !== "0", note: str(f, "note"),
  });
  revalidatePath("/ga", "layout");
  if (id) redirect("/ga/certs");
  return { ok: `${name}을(를) 적었습니다.` };
}

/** 갱신: 새 만료일 (안 주면 오늘부터 1년) */
export async function renewCertAction(id: number, expires: string): Promise<{ error?: string }> {
  await requirePerm("update");
  await requireAdmin();
  const today = todayKst();
  const exp = expires || addDays(today, 365);
  if (!isDateStr(exp) || exp <= today) return { error: "새 만료일은 오늘 이후 날짜여야 합니다." };
  await issue.renewCert(id, today, exp);
  revalidatePath("/ga", "layout");
  return {};
}

export async function removeCert(id: number): Promise<void> {
  await requirePerm("delete");
  await requireAdmin();
  await issue.deleteCert(id);
  revalidatePath("/ga", "layout");
}
