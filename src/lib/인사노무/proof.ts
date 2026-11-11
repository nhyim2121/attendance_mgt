/** 휴일근무·연장근무 신청서(증빙) 확인 (2026-11-10 사용자 결정)
 *  - 2026-11-01부터 휴일근무·연장근무가 있는 날은 신청서(근태 증빙 첨부, 종류 = 휴일근무/연장근무)가 있어야 '인정'.
 *  - 신청서가 없으면 '미인정(신청서 대기)'으로 표시만 한다 — 시간 합계에서 빼지는 않는다.
 *  - 첨부하면 바로 인정 (승인 단계 없음). 그 이전 날짜는 모두 인정.
 *  - 누가 어떤 근무에 신청서를 내야 하는지는 직원별 기준(proofNeedFor, 2026-11-11)을 따른다. */
export const PROOF_FROM = "2026-11-01";
export const PROOF_KINDS = ["휴일근무", "연장근무", "조기출근"] as const;

/** 직원별 신청서 기준 (2026-11-11 사용자 결정). 여기 없는 직원은 휴일근무·연장근무에 신청서가 있어야 인정.
 *  - 신청서 없이 인정: 연구소 전체, 대전지사, 이병욱, 김도아, 윤정아
 *  - 휴일근무만 신청서: 영업팀 김운경·임택권 (연장근무는 신청서 없이 인정), 품질팀 신용재
 *  - 휴일근무·연장근무·조출 모두 신청서: 품질팀 장경천·최일호 (조출은 근태 기입에 직접 적은 날만 조출로 봄) */
const DEFAULT_NEED = ["휴일근무", "연장근무"];
const NO_PROOF_NAMES = ["이병욱", "김도아", "윤정아"];
const NO_PROOF_DEPT = /연구소|대전/;
const NEED_BY_NAME: Record<string, string[]> = {
  김운경: ["휴일근무"], 임택권: ["휴일근무"], 신용재: ["휴일근무"],
  장경천: ["휴일근무", "연장근무", "조기출근"], 최일호: ["휴일근무", "연장근무", "조기출근"],
};
/** 그 직원이 신청서를 내야 인정되는 근무 종류 */
export function proofNeedFor(name: string, dept = ""): string[] {
  if (NO_PROOF_NAMES.includes(name) || NO_PROOF_DEPT.test(dept)) return [];
  return NEED_BY_NAME[name] ?? DEFAULT_NEED;
}

export interface ProofFile { id: number; fileName: string; type: string }
export interface Proof { need: string[]; ok: string[]; missing: string[]; files: ProofFile[] }

interface Att { id: number; name: string; dayFrom: string; dayTo: string; type: string; fileName: string }

/** 그날 신청서가 필요한 근무 종류 */
export const needProof = (kinds: string[], day: string, need: string[] = DEFAULT_NEED) =>
  (day >= PROOF_FROM ? need.filter((k) => kinds.includes(k)) : []);

/** 그날·그 직원의 신청서 확인 결과. exempt = 그 직원이 신청서 없이 인정되는 근태 (직원별 기준 noProof), dept = 명부 부서 */
export function proofOf(name: string, day: string, kinds: string[], atts: Att[], exempt: string[] = [], dept = ""): Proof {
  const need = needProof(kinds, day, proofNeedFor(name, dept)).filter((k) => !exempt.includes(k));
  const files = atts.filter((a) => a.name === name && a.dayFrom <= day && a.dayTo >= day && (PROOF_KINDS as readonly string[]).includes(a.type))
    .map((a) => ({ id: a.id, fileName: a.fileName, type: a.type }));
  const ok = need.filter((k) => files.some((f) => f.type === k));
  return { need: [...need], ok, missing: need.filter((k) => !ok.includes(k)), files };
}

/** 그날 근태 구분: 휴가·출장 등 근태 종류 + 휴일근무(공휴일·주말에 출퇴근 기록이 있는 날만) + 조기출근(조출을 직접 적은 날) + 연장근무 */
export function kindsOf(d: { leave: string; in: number | null; out: number | null } | undefined, outType: string, redDay: boolean, inType = ""): string[] {
  const out = (d?.leave ?? "").split(",").map((x) => x.trim()).filter(Boolean).filter((x) => x !== "휴일근무" && x !== "연장근무");
  // 휴일근무는 빨간날(공휴일·주말)에 출퇴근 기록이 있는 경우만. 휴일근무로 적혀만 있고 기록이 없으면 붙이지 않는다.
  const leave = d?.leave ?? "";
  if (redDay && d && (d.in !== null || d.out !== null)) out.push("휴일근무");
  if (inType.startsWith("조출")) out.push("조기출근");
  if (outType.startsWith("연장") || leave.includes("연장근무")) out.push("연장근무");
  return [...new Set(out)];
}
