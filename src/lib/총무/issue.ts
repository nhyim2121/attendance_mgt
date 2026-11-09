/** 총무 > 증빙·법인서류 발급 대장과 인증서 관리 (관리자만). 서버 전용.
 *  인증서는 파일·비밀번호를 저장하지 않고 종류·보관자·보관 위치·만료일만 둔다. */
import "server-only";
import { createClient } from "../supabase/server";
import { daysBetween, type DateStr } from "../time";

// ---------------------------------------------------------------- 발급처 (누르면 그 사이트가 새 창으로 열림)
export const VIAS: Record<string, string> = {
  홈택스: "https://www.hometax.go.kr",
  정부24: "https://www.gov.kr",
  인터넷등기소: "https://www.iros.go.kr",
  위택스: "https://www.wetax.go.kr",
  "4대사회보험 정보연계센터": "https://www.4insure.or.kr",
  중소기업현황정보시스템: "https://sminfo.mss.go.kr",
  "등기소·무인발급기": "",
  사내: "",
};
/** 자주 떼는 서류와 보통 발급처 */
export const DOC_TYPES: [doc: string, via: string][] = [
  ["사업자등록증명", "홈택스"],
  ["법인등기사항증명서(등기부등본)", "인터넷등기소"],
  ["법인인감증명서", "등기소·무인발급기"],
  ["국세 납세증명서", "홈택스"],
  ["지방세 납세증명서", "위택스"],
  ["4대보험 완납증명서", "4대사회보험 정보연계센터"],
  ["부가가치세 과세표준증명", "홈택스"],
  ["표준재무제표증명", "홈택스"],
  ["중소기업확인서", "중소기업현황정보시스템"],
  ["사업자등록증 사본", "사내"],
  ["사용인감계", "사내"],
];

export interface Issue {
  id: number; day: DateStr; docType: string; copies: number; via: string; purpose: string; submitTo: string;
  requester: string; fee: number | null; note: string;
}
export type IssueInput = Omit<Issue, "id">;
export const issueRef = (id: number) => `issue:${id}`;

type IRow = {
  id: number; day: string; doc_type: string; copies: number; via: string; purpose: string; submit_to: string;
  requester: string; fee: number | null; note: string;
};
const ICOLS = "id, day, doc_type, copies, via, purpose, submit_to, requester, fee, note";
const toIssue = (r: IRow): Issue => ({
  id: r.id, day: r.day, docType: r.doc_type, copies: r.copies, via: r.via, purpose: r.purpose, submitTo: r.submit_to,
  requester: r.requester, fee: r.fee, note: r.note,
});
const iRow = (m: IssueInput) => ({
  day: m.day, doc_type: m.docType, copies: m.copies, via: m.via, purpose: m.purpose, submit_to: m.submitTo,
  requester: m.requester, fee: m.fee, note: m.note,
});

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data;
}

/** 발급 대장 전체 (최신 순). 몇 년 치라도 수백 줄이라 한 번에 읽는다. */
export async function loadIssues(): Promise<Issue[]> {
  const sb = await createClient();
  const rows = (check(await sb.from("ga_issue").select(ICOLS).order("day", { ascending: false }).order("id", { ascending: false }),
    "발급 대장 읽기") ?? []) as IRow[];
  return rows.map(toIssue);
}
export async function loadIssue(id: number): Promise<Issue | null> {
  const sb = await createClient();
  const r = check(await sb.from("ga_issue").select(ICOLS).eq("id", id).maybeSingle(), "발급 기록 읽기");
  return r ? toIssue(r as IRow) : null;
}
export async function saveIssue(id: number, m: IssueInput): Promise<number> {
  const sb = await createClient();
  if (id) {
    check(await sb.from("ga_issue").update(iRow(m)).eq("id", id), "발급 기록 고치기");
    return id;
  }
  return (check(await sb.from("ga_issue").insert(iRow(m)).select("id").single(), "발급 기록 저장") as { id: number }).id;
}
export async function deleteIssue(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_files").delete().eq("ref", issueRef(id)), "첨부 삭제");
  check(await sb.from("ga_issue").delete().eq("id", id), "발급 기록 삭제");
}

// ---------------------------------------------------------------- 인증서
export const CERT_KINDS = ["공동인증서(범용)", "공동인증서(은행·보험용)", "전자세금계산서용", "금융인증서", "보안매체(OTP·보안카드)", "기타"];

export interface Cert {
  id: number; name: string; kind: string; issuer: string; usage: string; holder: string; location: string;
  issued: DateStr | null; expires: DateStr | null; active: boolean; note: string;
}
export type CertInput = Omit<Cert, "id">;
type CRow = {
  id: number; name: string; kind: string; issuer: string; usage: string; holder: string; location: string;
  issued: string | null; expires: string | null; active: boolean; note: string;
};
const CCOLS = "id, name, kind, issuer, usage, holder, location, issued, expires, active, note";
const toCert = (r: CRow): Cert => ({ ...r });

/** 만료까지 남은 날 (만료일 없으면 null, 지났으면 음수) */
export const daysLeft = (c: Pick<Cert, "expires">, today: DateStr) => (c.expires ? daysBetween(today, c.expires) : null);
/** 알림 단계: 지남 / 30일 안 / 60일 안 / 괜찮음 */
export function certAlert(c: Cert, today: DateStr): "late" | "d30" | "d60" | "" {
  const d = daysLeft(c, today);
  if (!c.active || d === null) return "";
  return d < 0 ? "late" : d <= 30 ? "d30" : d <= 60 ? "d60" : "";
}

export async function loadCerts(): Promise<Cert[]> {
  const sb = await createClient();
  const rows = (check(await sb.from("ga_cert").select(CCOLS).order("active", { ascending: false })
    .order("expires", { ascending: true, nullsFirst: false }), "인증서 읽기") ?? []) as CRow[];
  return rows.map(toCert);
}
export async function loadCert(id: number): Promise<Cert | null> {
  const sb = await createClient();
  const r = check(await sb.from("ga_cert").select(CCOLS).eq("id", id).maybeSingle(), "인증서 읽기");
  return r ? toCert(r as CRow) : null;
}
export async function saveCert(id: number, c: CertInput): Promise<void> {
  const sb = await createClient();
  if (id) check(await sb.from("ga_cert").update({ ...c, updated_at: new Date().toISOString() }).eq("id", id), "인증서 고치기");
  else check(await sb.from("ga_cert").insert(c), "인증서 저장");
}
/** 갱신: 발급일·만료일을 새로 하고 메모에 한 줄 남긴다 */
export async function renewCert(id: number, today: DateStr, expires: DateStr): Promise<void> {
  const c = await loadCert(id);
  if (!c) throw new Error("갱신할 인증서가 없습니다.");
  const line = `${today} 갱신 (이전 만료 ${c.expires ?? "모름"} → ${expires})`;
  const sb = await createClient();
  check(await sb.from("ga_cert").update({
    issued: today, expires, active: true, note: c.note ? `${c.note}\n${line}` : line, updated_at: new Date().toISOString(),
  }).eq("id", id), "인증서 갱신");
}
export async function deleteCert(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_cert").delete().eq("id", id), "인증서 삭제");
}
