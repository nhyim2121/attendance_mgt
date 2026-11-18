/** 회사 정보 (2026-11-18): 사이드바 맨 위 '회사 정보'에서 먼저 입력한다. settings 'company'에 저장. */
export interface Company {
  name: string; nameEn: string; ceo: string; bizNo: string; corpNo: string; openDate: string;
  bizType: string; bizItem: string; addr: string; factoryAddr: string;
  tel: string; fax: string; email: string; homepage: string; memo: string;
}

/** 입력 칸 순서·이름 (화면과 저장이 같이 쓴다) */
export const COMPANY_FIELDS: { key: keyof Company; label: string; hint?: string; wide?: boolean; long?: boolean }[] = [
  { key: "name", label: "회사 이름 (상호)", hint: "주식회사 에쓰엔" },
  { key: "nameEn", label: "영문 이름", hint: "SN Heavy Industry Co.,Ltd." },
  { key: "ceo", label: "대표자" },
  { key: "openDate", label: "설립일 (개업일)", hint: "2010-01-01" },
  { key: "bizNo", label: "사업자등록번호", hint: "000-00-00000" },
  { key: "corpNo", label: "법인등록번호", hint: "000000-0000000" },
  { key: "bizType", label: "업태", hint: "제조업" },
  { key: "bizItem", label: "종목", hint: "강구조물 제작" },
  { key: "addr", label: "본사 주소", wide: true },
  { key: "factoryAddr", label: "공장·사업장 주소", wide: true },
  { key: "tel", label: "대표 전화", hint: "000-000-0000" },
  { key: "fax", label: "팩스" },
  { key: "email", label: "대표 이메일" },
  { key: "homepage", label: "홈페이지" },
  { key: "memo", label: "메모", wide: true, long: true, hint: "인증·지정 현황, 주거래 은행 등 자유롭게" },
];

export const EMPTY_COMPANY: Company = Object.fromEntries(COMPANY_FIELDS.map((f) => [f.key, ""])) as unknown as Company;

/** 몇 칸이나 채웠는지 (사이드바·화면 안내용) */
export const filledCount = (c: Company) => COMPANY_FIELDS.filter((f) => c[f.key].trim()).length;
