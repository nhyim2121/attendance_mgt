/** 휴일근무·연장근무 신청서(증빙) 확인 (2026-11-10 사용자 결정)
 *  - 2026-11-01부터 휴일근무·연장근무가 있는 날은 신청서(근태 증빙 첨부, 종류 = 휴일근무/연장근무)가 있어야 '인정'.
 *  - 신청서가 없으면 '미인정(신청서 대기)'으로 표시만 한다 — 시간 합계에서 빼지는 않는다.
 *  - 첨부하면 바로 인정 (승인 단계 없음). 조기출근은 신청서가 필요 없다. 그 이전 날짜는 모두 인정. */
export const PROOF_FROM = "2026-11-01";
export const PROOF_KINDS = ["휴일근무", "연장근무"] as const;

export interface ProofFile { id: number; fileName: string; type: string }
export interface Proof { need: string[]; ok: string[]; missing: string[]; files: ProofFile[] }

interface Att { id: number; name: string; dayFrom: string; dayTo: string; type: string; fileName: string }

/** 그날 신청서가 필요한 근무 종류 */
export const needProof = (kinds: string[], day: string) => (day >= PROOF_FROM ? PROOF_KINDS.filter((k) => kinds.includes(k)) : []);

/** 그날·그 직원의 신청서 확인 결과. exempt = 그 직원이 신청서 없이 인정되는 근태 (직원별 기준 noProof) */
export function proofOf(name: string, day: string, kinds: string[], atts: Att[], exempt: string[] = []): Proof {
  const need = needProof(kinds, day).filter((k) => !exempt.includes(k));
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
