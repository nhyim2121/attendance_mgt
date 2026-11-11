"use server";
import { requirePerm } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { removeAvatar, renameAvatar, setAvatar } from "@/lib/인사노무/avatar";
import { addEmpFile, birthFromRrn, cleanRrn, deleteEmpFile, dropPrivate, renamePrivate, revealRrn, SALARY_TYPES, savePrivate } from "@/lib/인사노무/private";
import type { Employee } from "@/lib/인사노무/employees";
import * as store from "@/lib/store";
import { isDateStr } from "@/lib/time";

type Res = { ok?: string; error?: string };

const cleanOne = (e: Employee, ord: number): Employee => ({
  name: String(e.name ?? "").trim(), capsName: String(e.capsName ?? ""), empId: String(e.empId ?? ""),
  dept: String(e.dept ?? ""), rank: String(e.rank ?? ""), position: String(e.position ?? ""),
  phone: String(e.phone ?? ""), ext: String(e.ext ?? ""), email: String(e.email ?? ""), note: String(e.note ?? ""), ord,
  joinDate: isDateStr(e.joinDate) ? e.joinDate : null, leaveDate: isDateStr(e.leaveDate) ? e.leaveDate : null,
});

/** 관리자만 보는 칸 (rrn: undefined = 그대로) */
export interface PrivateInput { birth: string | null; rrn?: string; salaryType: string; salary: string; salaryNote: string }

/** 한 사람 추가·고치기. orig = 고치기 전 이름 (새로 추가면 빈칸). priv는 관리자만 */
export async function saveEmployee(orig: string, e: Employee, priv?: PrivateInput): Promise<Res> {
  await requirePerm("update");
  const user = await requireUser();
  const list = await store.loadEmployees();
  const i = orig ? list.findIndex((x) => x.name === orig) : -1;
  if (orig && i < 0) return { error: "명부에서 이 직원을 찾지 못했습니다. 새로고침해 주세요." };
  const one = cleanOne(e, i >= 0 ? list[i].ord : list.length + 1);
  if (!one.name) return { error: "이름을 적어 주세요." };
  if (one.joinDate && one.leaveDate && one.leaveDate < one.joinDate) return { error: "퇴사일이 입사일보다 빠릅니다." };
  if (list.some((x, j) => j !== i && x.name === one.name)) return { error: `'${one.name}'이(가) 이미 있습니다 (동명이인은 '홍길동2'처럼 구분해 주세요).` };
  let p: Parameters<typeof savePrivate>[1] | null = null;
  if (priv && user.role === "관리자") {
    let rrn: string | undefined;
    if (priv.rrn !== undefined) {
      const t = String(priv.rrn).trim();
      if (t && !(rrn = cleanRrn(t) ?? undefined)) return { error: "주민등록번호는 숫자 13자리로 적어 주세요 (예: 900101-1234567)." };
      if (!t) rrn = "";
    }
    const amount = String(priv.salary ?? "").replace(/[,\s원]/g, "");
    if (amount && !/^\d+$/.test(amount)) return { error: "급여는 숫자로 적어 주세요." };
    const birth = isDateStr(priv.birth) ? priv.birth : rrn ? birthFromRrn(rrn) : null;
    p = { birth, rrn, salaryType: SALARY_TYPES.includes(priv.salaryType) ? priv.salaryType : "", salary: amount ? Number(amount) : null,
      salaryNote: String(priv.salaryNote ?? "").trim() };
  }
  const next = i >= 0 ? list.map((x, j) => (j === i ? one : x)) : [...list, one];
  try {
    await store.saveEmployees(next, user.loginId);
    if (orig && orig !== one.name && user.role === "관리자") { await renameAvatar(orig, one.name); await renamePrivate(orig, one.name); }
    if (p) await savePrivate(one.name, p);
  } catch (exc) {
    return { error: (exc as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: i >= 0 ? `${one.name} 정보를 저장했습니다.` : `${one.name}을(를) 명부에 추가했습니다.` };
}

/** 명부에서 지우기 (퇴사자는 지우지 말고 퇴사일만 넣는다) */
export async function deleteEmployee(name: string): Promise<Res> {
  await requirePerm("delete");
  const user = await requireUser();
  const list = await store.loadEmployees();
  if (!list.some((x) => x.name === name)) return { error: "이미 없는 직원입니다." };
  try {
    await store.saveEmployees(list.filter((x) => x.name !== name), user.loginId);
    if (user.role === "관리자") { await removeAvatar(name); await dropPrivate(name); }
  } catch (exc) {
    return { error: (exc as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: `${name}을(를) 명부에서 지웠습니다.` };
}

/** 캐릭터 저장 (브라우저에서 만든 PNG, 300KB 이하) */
export async function saveAvatar(f: FormData): Promise<Res> {
  await requirePerm("update");
  await requireAdmin();
  const name = String(f.get("name") ?? "");
  const file = f.get("file");
  if (!name || !(file instanceof File)) return { error: "캐릭터 그림이 없습니다." };
  if (file.type !== "image/png" || file.size > 300 * 1024) return { error: "캐릭터 그림이 너무 큽니다." };
  const emps = await store.loadEmployees();
  if (!emps.some((x) => x.name === name)) return { error: "먼저 직원 정보를 저장해 주세요." };
  await setAvatar(name, new Uint8Array(await file.arrayBuffer()));
  revalidatePath("/", "layout");
  return { ok: "캐릭터를 저장했습니다." };
}

export async function dropAvatar(name: string): Promise<Res> {
  await requirePerm("delete");
  await requireAdmin();
  await removeAvatar(name);
  revalidatePath("/", "layout");
  return { ok: "캐릭터를 지웠습니다." };
}

/** 주민등록번호 전체 보기 (관리자) */
export async function showRrn(name: string): Promise<Res & { rrn?: string }> {
  await requirePerm("update");
  await requireAdmin();
  try { return { rrn: await revealRrn(name) }; } catch (exc) { return { error: (exc as Error).message }; }
}

const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|heic|tiff?|hwpx?|docx?|xlsx?|pptx?|zip|txt)$/i;
/** 직원 첨부 파일 올리기 (근로계약서·이력서·자격증 사본 등) */
export async function uploadEmpFiles(f: FormData): Promise<Res> {
  await requirePerm("create");
  await requireAdmin();
  const name = String(f.get("name") ?? "");
  const files = f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
  if (!name || !files.length) return { error: "올릴 파일을 골라 주세요." };
  const emps = await store.loadEmployees();
  if (!emps.some((x) => x.name === name)) return { error: "먼저 직원 정보를 저장해 주세요." };
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  if (bad.length) return { error: `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` };
  const kind = String(f.get("kind") ?? "").trim();
  for (const x of files) {
    const fileName = kind && !x.name.startsWith(`[${kind}]`) ? `[${kind}] ${x.name}` : x.name;
    await addEmpFile(name, fileName, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));
  }
  revalidatePath("/employees");
  return { ok: `파일 ${files.length}개를 올렸습니다.` };
}

export async function removeEmpFile(id: number): Promise<Res> {
  await requirePerm("delete");
  await requireAdmin();
  await deleteEmpFile(id);
  revalidatePath("/employees");
  return { ok: "파일을 지웠습니다." };
}
