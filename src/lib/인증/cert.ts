/** 인증 영역: 회사가 가진 인증·지정·확인과 그 이력 (관리자만). 서버 전용.
 *  인증서 스캔본은 ga_files ref='cert:<id>', 이력 첨부는 ref='certev:<id>'. */
import "server-only";
import { createClient } from "../supabase/server";
import { daysBetween, type DateStr } from "../time";

export const CATEGORIES = ["경영시스템", "기업 인증·확인", "연구·인력", "제품·조달", "지식재산", "기타"] as const;
export const STATUSES = ["유효", "진행 중", "만료", "취소·반납"] as const;
export const EVENT_KINDS = ["신청", "취득", "사후심사", "갱신", "변경신고", "현장실사", "보고·제출", "만료", "취소", "기타"] as const;

/** 자주 쓰는 인증: 고르면 분류·기관·유효기간(년)·심사 주기가 채워진다. 유효기간은 보통값이라 인증서로 꼭 확인. */
export interface Preset { name: string; category: string; issuer: string; years: number | null; audit: string }
export const PRESETS: Preset[] = [
  { name: "ISO 9001 (품질경영)", category: "경영시스템", issuer: "", years: 3, audit: "사후심사(매년)" },
  { name: "ISO 14001 (환경경영)", category: "경영시스템", issuer: "", years: 3, audit: "사후심사(매년)" },
  { name: "ISO 45001 (안전보건경영)", category: "경영시스템", issuer: "", years: 3, audit: "사후심사(매년)" },
  { name: "ISO 37001 (부패방지경영)", category: "경영시스템", issuer: "", years: 3, audit: "사후심사(매년)" },
  { name: "벤처기업확인", category: "기업 인증·확인", issuer: "벤처기업확인기관", years: 3, audit: "" },
  { name: "이노비즈(기술혁신형 중소기업)", category: "기업 인증·확인", issuer: "중소벤처기업부", years: 3, audit: "" },
  { name: "메인비즈(경영혁신형 중소기업)", category: "기업 인증·확인", issuer: "중소벤처기업부", years: 3, audit: "" },
  { name: "AEO 공인(수출입 안전관리 우수업체)", category: "기업 인증·확인", issuer: "관세청", years: 5, audit: "정기 자율평가(매년)" },
  { name: "성과공유제 도입기업", category: "기업 인증·확인", issuer: "대·중소기업·농어업협력재단", years: null, audit: "" },
  { name: "가족친화인증", category: "기업 인증·확인", issuer: "성평등가족부", years: 3, audit: "" },
  { name: "청년친화강소기업", category: "기업 인증·확인", issuer: "고용노동부", years: 1, audit: "" },
  { name: "기업부설연구소", category: "연구·인력", issuer: "한국산업기술진흥협회(KOITA)", years: null, audit: "변경신고·현황보고" },
  { name: "병역지정업체(산업기능요원)", category: "연구·인력", issuer: "병무청", years: null, audit: "" },
  { name: "일학습병행 학습기업", category: "연구·인력", issuer: "한국산업인력공단", years: null, audit: "" },
  { name: "직접생산확인", category: "제품·조달", issuer: "중소기업중앙회", years: 2, audit: "" },
  { name: "특허", category: "지식재산", issuer: "특허청", years: 20, audit: "연차료 납부" },
];

export interface CertItem {
  id: number; category: string; name: string; certNo: string; issuer: string; acquired: DateStr | null;
  validFrom: DateStr | null; expires: DateStr | null; nextAudit: DateStr | null; nextAuditLabel: string; status: string; note: string;
}
export type CertItemInput = Omit<CertItem, "id">;
export interface CertEvent { id: number; itemId: number; day: DateStr; kind: string; title: string; note: string }

export const itemRef = (id: number) => `cert:${id}`;
export const eventRef = (id: number) => `certev:${id}`;

type IRow = {
  id: number; category: string; name: string; cert_no: string; issuer: string; acquired: string | null; valid_from: string | null;
  expires: string | null; next_audit: string | null; next_audit_label: string; status: string; note: string;
};
const ICOLS = "id, category, name, cert_no, issuer, acquired, valid_from, expires, next_audit, next_audit_label, status, note";
const toItem = (r: IRow): CertItem => ({
  id: r.id, category: r.category, name: r.name, certNo: r.cert_no, issuer: r.issuer, acquired: r.acquired, validFrom: r.valid_from,
  expires: r.expires, nextAudit: r.next_audit, nextAuditLabel: r.next_audit_label, status: r.status, note: r.note,
});
const iRow = (m: CertItemInput) => ({
  category: m.category, name: m.name, cert_no: m.certNo, issuer: m.issuer, acquired: m.acquired, valid_from: m.validFrom,
  expires: m.expires, next_audit: m.nextAudit, next_audit_label: m.nextAuditLabel, status: m.status, note: m.note,
});

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data;
}

// ---------------------------------------------------------------- 알림
export type Alert = { kind: "만료" | "심사"; day: DateStr; label: string; left: number; level: "late" | "d30" | "d90" };
/** 유효한(또는 진행 중) 인증의 만료·다음 심사 중 90일 안에 오는 것 */
export function alertsOf(c: CertItem, today: DateStr): Alert[] {
  if (c.status === "만료" || c.status === "취소·반납") return [];
  const out: Alert[] = [];
  const push = (kind: Alert["kind"], day: DateStr | null, label: string) => {
    if (!day) return;
    const left = daysBetween(today, day);
    if (left <= 90) out.push({ kind, day, label, left, level: left < 0 ? "late" : left <= 30 ? "d30" : "d90" });
  };
  push("만료", c.expires, "유효기간 만료");
  push("심사", c.nextAudit, c.nextAuditLabel || "심사·보고");
  return out;
}

// ---------------------------------------------------------------- 인증
export async function loadItems(): Promise<CertItem[]> {
  const sb = await createClient();
  const rows = (check(await sb.from("cert_items").select(ICOLS).order("category").order("name"), "인증 목록 읽기") ?? []) as IRow[];
  return rows.map(toItem);
}
export async function loadItem(id: number): Promise<CertItem | null> {
  const sb = await createClient();
  const r = check(await sb.from("cert_items").select(ICOLS).eq("id", id).maybeSingle(), "인증 읽기");
  return r ? toItem(r as IRow) : null;
}
export async function saveItem(id: number, m: CertItemInput): Promise<number> {
  const sb = await createClient();
  if (id) {
    check(await sb.from("cert_items").update({ ...iRow(m), updated_at: new Date().toISOString() }).eq("id", id), "인증 고치기");
    return id;
  }
  return (check(await sb.from("cert_items").insert(iRow(m)).select("id").single(), "인증 저장") as { id: number }).id;
}
export async function deleteItem(id: number): Promise<void> {
  const sb = await createClient();
  const evs = await loadEvents(id);
  const refs = [itemRef(id), ...evs.map((e) => eventRef(e.id))];
  check(await sb.from("ga_files").delete().in("ref", refs), "첨부 삭제");
  check(await sb.from("cert_items").delete().eq("id", id), "인증 삭제"); // 이력은 함께 지워진다 (on delete cascade)
}

// ---------------------------------------------------------------- 이력
type ERow = { id: number; item_id: number; day: string; kind: string; title: string; note: string };
const toEvent = (r: ERow): CertEvent => ({ id: r.id, itemId: r.item_id, day: r.day, kind: r.kind, title: r.title, note: r.note });

export async function loadEvents(itemId?: number): Promise<CertEvent[]> {
  const sb = await createClient();
  let q = sb.from("cert_events").select("id, item_id, day, kind, title, note");
  if (itemId) q = q.eq("item_id", itemId);
  const rows = (check(await q.order("day", { ascending: false }).order("id", { ascending: false }), "인증 이력 읽기") ?? []) as ERow[];
  return rows.map(toEvent);
}
export async function addEvent(e: Omit<CertEvent, "id">): Promise<number> {
  const sb = await createClient();
  return (check(await sb.from("cert_events").insert({ item_id: e.itemId, day: e.day, kind: e.kind, title: e.title, note: e.note })
    .select("id").single(), "인증 이력 저장") as { id: number }).id;
}
export async function deleteEvent(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_files").delete().eq("ref", eventRef(id)), "첨부 삭제");
  check(await sb.from("cert_events").delete().eq("id", id), "인증 이력 삭제");
}
