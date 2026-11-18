/** 회사 정보 읽기·저장 (서버 전용). 모양·입력 칸은 company.ts */
import { type Company, EMPTY_COMPANY } from "@/lib/company";
import * as store from "@/lib/store";

export async function loadCompany(): Promise<Company> {
  const v = await store.getSetting<Partial<Company>>("company", {});
  return { ...EMPTY_COMPANY, ...v };
}
export async function saveCompany(c: Company): Promise<void> {
  await store.setSetting("company", c);
}
