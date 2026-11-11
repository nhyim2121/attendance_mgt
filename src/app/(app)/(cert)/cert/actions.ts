"use server";
import { requirePerm } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import * as cert from "@/lib/인증/cert";
import { addFile } from "@/lib/총무/mail";
import { isDateStr } from "@/lib/time";

type Res = { ok?: string; error?: string } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|hwpx?|docx?|xlsx?|pptx?|zip)$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const day = (f: FormData, k: string) => { const s = str(f, k); return isDateStr(s) ? s : null; };
const filesOf = (f: FormData) => f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
const badFiles = (files: File[]) => {
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  return bad.length ? `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` : null;
};
async function saveFiles(ref: string, files: File[]) {
  for (const x of files) await addFile(ref, x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
}
const done = () => revalidatePath("/", "layout");

/** 인증 등록·고치기 */
export async function saveItemAction(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  await requireAdmin();
  const name = str(f, "name");
  if (!name) return { error: "인증 이름을 적어 주세요." };
  for (const k of ["acquired", "validFrom", "expires", "nextAudit"]) if (str(f, k) && !day(f, k)) return { error: "날짜를 확인해 주세요." };
  const files = filesOf(f);
  const bad = badFiles(files);
  if (bad) return { error: bad };
  const id0 = Number(f.get("id") || 0);
  const id = await cert.saveItem(id0, {
    category: str(f, "category") || "기타", name, certNo: str(f, "certNo"), issuer: str(f, "issuer"),
    acquired: day(f, "acquired"), validFrom: day(f, "validFrom"), expires: day(f, "expires"), nextAudit: day(f, "nextAudit"),
    nextAuditLabel: str(f, "nextAuditLabel"), status: str(f, "status") || "유효", note: str(f, "note"),
  });
  if (!id0 && day(f, "acquired")) await cert.addEvent({ itemId: id, day: day(f, "acquired")!, kind: "취득", title: `${name} 취득`, note: "" });
  await saveFiles(cert.itemRef(id), files);
  done();
  redirect(`/cert/item?id=${id}`);
}

/** 인증서 스캔본·이력 첨부 추가 */
export async function attachCert(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  await requireAdmin();
  const ref = str(f, "ref"), files = filesOf(f);
  if (!/^(cert|certev):\d+$/.test(ref) || !files.length) return { error: "파일을 골라 주세요." };
  const bad = badFiles(files);
  if (bad) return { error: bad };
  await saveFiles(ref, files);
  done();
  return { ok: "첨부했습니다." };
}

/** 이력 한 줄 추가. 갱신이면 새 유효기간, 심사면 다음 심사일을 인증에도 반영한다. */
export async function addEventAction(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("create");
  await requireAdmin();
  const itemId = Number(f.get("itemId")), d = day(f, "day"), kind = str(f, "kind") || "기타";
  if (!itemId || !d) return { error: "날짜를 확인해 주세요." };
  const files = filesOf(f);
  const bad = badFiles(files);
  if (bad) return { error: bad };
  const item = await cert.loadItem(itemId);
  if (!item) return { error: "인증이 없습니다." };
  const evId = await cert.addEvent({ itemId, day: d, kind, title: str(f, "title") || kind, note: str(f, "note") });
  await saveFiles(cert.eventRef(evId), files);

  const newExp = day(f, "newExpires"), nextAudit = day(f, "nextAudit");
  const patch: Partial<cert.CertItemInput> = {};
  if (newExp) Object.assign(patch, { expires: newExp, validFrom: d, status: "유효" });
  if (nextAudit) Object.assign(patch, { nextAudit, nextAuditLabel: str(f, "nextAuditLabel") || item.nextAuditLabel });
  else if (["사후심사", "갱신", "보고·제출"].includes(kind) && item.nextAudit && item.nextAudit <= d) Object.assign(patch, { nextAudit: null });
  if (kind === "만료") patch.status = "만료";
  if (kind === "취소") patch.status = "취소·반납";
  if (kind === "취득" && !item.acquired) patch.acquired = d;
  if (Object.keys(patch).length) {
    const { id: _id, ...rest } = item;
    await cert.saveItem(itemId, { ...rest, ...patch });
  }
  done();
  return { ok: `${kind} 이력을 적었습니다.${newExp ? ` 유효기간을 ${newExp}까지로 바꿨습니다.` : ""}` };
}

export async function removeItem(id: number): Promise<void> {
  await requirePerm("delete");
  await requireAdmin();
  await cert.deleteItem(id);
  done();
  redirect("/cert");
}

export async function removeEvent(id: number): Promise<void> {
  await requirePerm("delete");
  await requireAdmin();
  await cert.deleteEvent(id);
  done();
}
