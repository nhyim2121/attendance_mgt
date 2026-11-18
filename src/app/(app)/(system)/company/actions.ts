"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { COMPANY_FIELDS, type Company, EMPTY_COMPANY } from "@/lib/company";
import { saveCompany } from "@/lib/companyStore";

type Res = { ok?: string; error?: string } | null;

export async function saveCompanyAction(_: Res, fd: FormData): Promise<Res> {
  const u = await requireUser();
  if (u.role !== "관리자") return { error: "관리자만 회사 정보를 고칠 수 있습니다." };
  const c: Company = { ...EMPTY_COMPANY };
  for (const f of COMPANY_FIELDS) c[f.key] = String(fd.get(f.key) ?? "").trim().slice(0, f.long ? 2000 : 200);
  if (!c.name) return { error: "회사 이름은 꼭 적어 주세요." };
  if (c.bizNo && !/^\d{3}-?\d{2}-?\d{5}$/.test(c.bizNo)) return { error: "사업자등록번호는 숫자 10자리입니다 (예: 123-45-67890)." };
  if (c.bizNo) c.bizNo = c.bizNo.replace(/^(\d{3})-?(\d{2})-?(\d{5})$/, "$1-$2-$3");
  if (c.openDate && !/^\d{4}-\d{2}-\d{2}$/.test(c.openDate)) return { error: "설립일은 2010-01-01처럼 적어 주세요." };
  try {
    await saveCompany(c);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했습니다." };
  }
  revalidatePath("/", "layout");
  return { ok: "회사 정보를 저장했습니다." };
}
