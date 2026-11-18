/** 회사 정보 (2026-11-18): 사이드바 맨 위. 상호·대표·사업자번호·주소 등을 먼저 적어 둔다. */
import PageHead from "@/components/대시/PageHead";
import { requireAdminPage } from "@/lib/auth";
import { COMPANY_FIELDS, filledCount } from "@/lib/company";
import { loadCompany } from "@/lib/companyStore";
import CompanyForm from "./CompanyForm";

export const metadata = { title: "회사 정보 · 통합관리시스템" };

export default async function CompanyPage() {
  await requireAdminPage();
  const c = await loadCompany();
  const n = filledCount(c);
  return (
    <>
      <PageHead href="/company" title="회사 정보" emoji="🏢"
        desc={<>회사 기본 정보를 먼저 적어 두세요. {n}/{COMPANY_FIELDS.length}칸 입력됨. 관리자만 보고 고칠 수 있습니다.</>} />
      <div className="card"><CompanyForm c={c} /></div>
    </>
  );
}
