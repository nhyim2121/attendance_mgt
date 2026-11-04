/** 공용 저장소 (Supabase Postgres). 관리팀 모두가 같은 데이터를 본다. 로그인한 사용자 권한으로 읽고 쓴다.
 *
 * 테이블
 * - records     : 캡스 출입기록 (출입일시·이름·모드가 같으면 하나만)
 * - roster      : 명단 (근태현황 파일을 올릴 때마다 교체)
 * - leaves      : 하이웍스 근태 (근태현황 파일을 올릴 때마다 교체)
 * - uploads     : 업로드 이력
 * - overrides   : 웹에서 기입·수정한 값 (직원·일자 단위, NULL = 수정 안 함)
 * - settings    : 근무 기준·공휴일 등 공용 설정
 * - reports·report_rows·mail_log : 일일 근태현황 보고서와 메일 발송 이력
 * - employees   : 직원 명부 (입사·퇴사, 조직도용 직책·연락처)
 * - vacations·leave_adjust : 사이트에서 등록한 휴가, 연차 조정 (이월·포상 등)
 * - attachments : 근태 증빙 파일 (하이웍스 전자결재 출장 신청서 등)
 */
import "server-only";
import type { Override } from "./analytics";
import type { Employee } from "./employees";
import type { Leave, RosterRow } from "./hiworks";
import { type CapsRecord, finalizeRecords, type LoadInfo, type RawRecord } from "./loader";
import type { ReportRow } from "./daily";
import type { Approval } from "./approvals";
import type { Adjust, Vacation } from "./vacation";
import { createClient } from "./supabase/server";
import { addDays, type DateStr, parseTs, tsString } from "./time";

const PAGE = 10_000;
type Db = Awaited<ReturnType<typeof createClient>>;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data;
}

/** PostgREST는 한 번에 최대 PAGE행이라 나눠서 읽는다. */
async function selectAll<T>(what: string, page: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null;
}>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += PAGE) {
    const rows = check(await page(i, i + PAGE - 1), what) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// ---------------------------------------------------------------- 캡스 기록
interface RecordRow {
  ts: string; name: string; emp_id: string; dept: string; door: string; mode: string; auth: string;
  work_type: string; place: string; note: string;
}

/** 기간 [from, to]의 캡스 기록 (없으면 전체) */
export async function loadRecords(from?: DateStr, to?: DateStr, db?: Db): Promise<CapsRecord[]> {
  const sb = db ?? await createClient();
  const rows = await selectAll<RecordRow>("캡스 기록 읽기", (a, b) => {
    let q = sb.from("records").select("ts, name, emp_id, dept, door, mode, auth, work_type, place, note");
    if (from) q = q.gte("ts", from);
    if (to) q = q.lt("ts", addDays(to, 1));
    return q.order("ts").order("id").range(a, b);
  });
  return finalizeRecords(rows.map((r): RawRecord => ({
    ts: parseTs(r.ts), name: r.name, empId: r.emp_id, dept: r.dept, door: r.door, mode: r.mode, auth: r.auth,
    workType: r.work_type, place: r.place, note: r.note,
  })));
}

export interface MonthInfo {
  month: string;
  first_day: DateStr;
  last_day: DateStr;
  n: number;
}

/** 기록이 있는 달 (오래된 달 먼저) */
export async function recordMonths(): Promise<MonthInfo[]> {
  const sb = await createClient();
  return check(await sb.rpc("record_months"), "기록 기간 읽기") ?? [];
}

/** 이름별 첫·마지막 출입일 */
export async function recordNameSpan(): Promise<{ name: string; first_day: DateStr; last_day: DateStr }[]> {
  const sb = await createClient();
  return check(await sb.rpc("record_name_span"), "출입자 목록 읽기") ?? [];
}

/** 캡스 기록을 저장한다. 이미 있는 기록은 건너뛰고 새로 들어간 건수를 돌려준다. */
export async function saveCaps(records: CapsRecord[], info: LoadInfo, user: string): Promise<number> {
  const sb = await createClient();
  const rows = records.map((r) => ({
    ts: tsString(r.ts), name: r.name, emp_id: r.empId, dept: r.dept, door: r.door, mode: r.mode, auth: r.auth,
    work_type: r.workType, place: r.place, note: r.note,
  }));
  return check(await sb.rpc("save_caps", {
    p_rows: rows, p_file: info.file, p_sheet: info.sheet, p_period: info.period, p_user: user,
  }), "캡스 기록 저장") as number;
}

export async function deleteUpload(id: number): Promise<number> {
  const sb = await createClient();
  return check(await sb.rpc("delete_upload", { p_id: id }), "업로드 삭제") as number;
}

export async function deleteMonth(month: string): Promise<number> {
  const sb = await createClient();
  return check(await sb.rpc("delete_month", { p_month: month }), "월 기록 삭제") as number;
}

export interface Upload {
  id: number; kind: string; file: string; sheet: string; count: number; added: number | null; period: string;
  user_id: string; created_at: string;
}

export async function loadUploads(): Promise<Upload[]> {
  const sb = await createClient();
  return check(await sb.from("uploads").select("*").order("id", { ascending: false }), "업로드 이력 읽기") ?? [];
}

// ---------------------------------------------------------------- 명단·하이웍스
/** 근태현황 파일은 1월부터 누적된 파일이라 올릴 때마다 통째로 교체한다. */
export async function saveHiworks(roster: RosterRow[], leaves: Leave[], filename: string, user: string) {
  const sb = await createClient();
  check(await sb.rpc("replace_hiworks", { p_roster: roster, p_leaves: leaves, p_file: filename, p_user: user }),
    "근태현황 저장");
}

export async function loadRoster(): Promise<RosterRow[]> {
  const sb = await createClient();
  return check(await sb.from("roster").select("ord, dept, name").order("ord"), "명단 읽기") ?? [];
}

export async function loadLeaves(): Promise<Leave[]> {
  const sb = await createClient();
  return selectAll<Leave>("하이웍스 근태 읽기", (a, b) =>
    sb.from("leaves").select("day, name, dept, rank, type, content, note, sheet").order("day").order("id").range(a, b));
}

// ---------------------------------------------------------------- 하이웍스 결재 (근무계획 수립이력)
type ApprovalRow = {
  key: string; drafted_at: string; title: string; name: string; done_at: string; status: string; kind: string; type: string;
  day_from: string | null; day_to: string | null; amount: string; time_from: string; time_to: string;
};
export async function loadApprovals(): Promise<Approval[]> {
  const sb = await createClient();
  const rows = await selectAll<ApprovalRow>("하이웍스 결재 읽기", (a, b) =>
    sb.from("approvals").select("key, drafted_at, title, name, done_at, status, kind, type, day_from, day_to, amount, time_from, time_to")
      .order("drafted_at").range(a, b));
  return rows.map((r) => ({
    key: r.key, draftedAt: r.drafted_at, title: r.title, name: r.name, doneAt: r.done_at, status: r.status,
    kind: r.kind as Approval["kind"], type: r.type, dayFrom: r.day_from, dayTo: r.day_to, amount: r.amount,
    timeFrom: r.time_from, timeTo: r.time_to,
  }));
}

/** 결재 목록 저장 (같은 키는 최신 상태로 덮어씀). 새로 들어간 건수를 돌려준다. */
export async function saveApprovals(list: Approval[], file: string, user: string): Promise<number> {
  if (!list.length) return 0;
  const sb = await createClient();
  const keys = list.map((a) => a.key);
  const old = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const got = check(await sb.from("approvals").select("key").in("key", keys.slice(i, i + 200)), "하이웍스 결재 읽기") ?? [];
    got.forEach((r: { key: string }) => old.add(r.key));
  }
  const rows = list.map((a) => ({
    key: a.key, drafted_at: a.draftedAt, title: a.title, name: a.name, done_at: a.doneAt, status: a.status, kind: a.kind,
    type: a.type, day_from: a.dayFrom, day_to: a.dayTo, amount: a.amount, time_from: a.timeFrom, time_to: a.timeTo,
    uploaded_by: user, uploaded_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) check(await sb.from("approvals").upsert(rows.slice(i, i + 500)), "하이웍스 결재 저장");
  const days = list.map((a) => a.dayFrom).filter(Boolean).sort() as string[];
  const added = list.filter((a) => !old.has(a.key)).length;
  check(await sb.from("uploads").insert({
    kind: "하이웍스 결재", file, sheet: "근무계획 수립이력", count: list.length, added,
    period: days.length ? `${days[0]} ~ ${days[days.length - 1]}` : "-", user_id: user,
  }), "업로드 이력 저장");
  return added;
}

// ---------------------------------------------------------------- 기입·수정
interface OverrideRow {
  employee: string; day: string; clock_in: string | null; in_type: string | null; clock_out: string | null;
  out_type: string | null; place: string | null; note: string | null; work: string | null; edited_by: string; edited_at: string;
}
const OV_FIELDS = ["clock_in", "in_type", "clock_out", "out_type", "place", "note", "work"] as const; // note = 인원, work = 업무내용
export type OverrideField = (typeof OV_FIELDS)[number];
export type OverrideChange = { employee: string; day: DateStr } & Partial<Record<OverrideField, string>>;

const toOverride = (r: OverrideRow): Override => ({
  employee: r.employee, day: r.day, clockIn: r.clock_in, inType: r.in_type, clockOut: r.clock_out, outType: r.out_type,
  place: r.place, note: r.note, work: r.work ?? null, editedBy: r.edited_by, editedAt: r.edited_at,
});

export async function loadOverrides(): Promise<Override[]> {
  const sb = await createClient();
  const rows = await selectAll<OverrideRow>("기입값 읽기", (a, b) =>
    sb.from("overrides").select("*").order("employee").order("day").range(a, b));
  return rows.map(toOverride);
}

/** 바뀐 필드만 넘긴다. 기존 수정값과 합친다. */
export async function saveOverrides(changes: OverrideChange[], user: string): Promise<number> {
  if (!changes.length) return 0;
  const sb = await createClient();
  const emps = [...new Set(changes.map((c) => c.employee))];
  const days = changes.map((c) => c.day);
  const old = check(await sb.from("overrides").select("*").in("employee", emps).in("day", days), "기입값 읽기") ?? [];
  const cur = new Map((old as OverrideRow[]).map((r) => [`${r.employee}|${r.day}`, r]));
  const now = new Date().toISOString();
  const rows = changes.map((ch) => {
    const base = cur.get(`${ch.employee}|${ch.day}`);
    const row: Record<string, string | null> = { employee: ch.employee, day: ch.day, edited_by: user, edited_at: now };
    for (const f of OV_FIELDS) row[f] = f in ch ? ch[f]! : base?.[f] ?? null;
    return row;
  });
  check(await sb.from("overrides").upsert(rows), "기입값 저장");
  return changes.length;
}

export async function clearOverrides(employee: string, days: DateStr[]): Promise<void> {
  const sb = await createClient();
  check(await sb.from("overrides").delete().eq("employee", employee).in("day", days), "기입값 되돌리기");
}

// ---------------------------------------------------------------- 설정
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const sb = await createClient();
  const row = check(await sb.from("settings").select("value").eq("key", key).maybeSingle(), "설정 읽기");
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const sb = await createClient();
  check(await sb.from("settings").upsert({ key, value }), "설정 저장");
}

// ---------------------------------------------------------------- 일일 근태현황 보고서
const REPORT_SELECT = "day, section, ord, dept, rank, name, types, title, detail, value, note";
const SECTION_ORDER = ["근태", "도제", "휴가일정", "휴일근무"];

export async function loadReportRows(day?: DateStr): Promise<ReportRow[]> {
  const sb = await createClient();
  const rows = await selectAll<ReportRow>("보고서 읽기", (a, b) => {
    let q = sb.from("report_rows").select(REPORT_SELECT);
    if (day) q = q.eq("day", day);
    return q.order("day").order("ord").order("id").range(a, b);
  });
  return rows.sort((x, y) => (x.day! < y.day! ? -1 : x.day! > y.day! ? 1 : 0)
    || SECTION_ORDER.indexOf(x.section) - SECTION_ORDER.indexOf(y.section) || x.ord - y.ord);
}

export interface ReportInfo {
  day: DateStr; author: string; updated_at: string; sent_at: string | null; sent_by: string | null;
}

export async function reportInfo(day: DateStr): Promise<ReportInfo | null> {
  const sb = await createClient();
  return check(await sb.from("reports").select("*").eq("day", day).maybeSingle(), "보고서 정보 읽기");
}

/** 보고서가 있는 날 (최근 먼저) */
export async function reportDays(): Promise<DateStr[]> {
  const sb = await createClient();
  const rows = check(await sb.from("reports").select("day").order("day", { ascending: false }), "보고서 목록 읽기");
  return (rows ?? []).map((r) => r.day);
}

/** 그날 보고서를 통째로 교체 저장한다 (행 추가·수정·삭제 모두 반영). */
export async function saveReport(day: DateStr, rows: ReportRow[], user: string): Promise<void> {
  const sb = await createClient();
  const clean = rows.map(({ day: _d, ...r }) => r);
  check(await sb.rpc("save_report", { p_day: day, p_rows: clean, p_user: user }), "보고서 저장");
}

export async function deleteReport(day: DateStr): Promise<void> {
  const sb = await createClient();
  check(await sb.from("report_rows").delete().eq("day", day), "보고서 삭제");
  check(await sb.from("reports").delete().eq("day", day), "보고서 삭제");
}

export async function logMail(day: DateStr, subject: string, to: string, cc: string, result: string, user: string) {
  const sb = await createClient();
  check(await sb.from("mail_log").insert({ day, subject, to_addr: to, cc_addr: cc, result, user_id: user }), "발송 기록");
  if (result === "성공") {
    check(await sb.from("reports").update({ sent_at: new Date().toISOString(), sent_by: user }).eq("day", day),
      "발송 기록");
  }
}

export interface MailLog {
  day: DateStr; subject: string; to_addr: string; cc_addr: string; result: string; user_id: string; created_at: string;
}

export async function loadMailLog(limit = 30): Promise<MailLog[]> {
  const sb = await createClient();
  return check(await sb.from("mail_log").select("day, subject, to_addr, cc_addr, result, user_id, created_at")
    .order("id", { ascending: false }).limit(limit), "발송 이력 읽기") ?? [];
}

// ---------------------------------------------------------------- 직원 명부 (입사·퇴사)
export async function loadEmployees(): Promise<Employee[]> {
  const sb = await createClient();
  const rows = check(await sb.from("employees").select("*").order("ord").order("name"), "직원 명부 읽기") ?? [];
  return rows.map((r) => ({
    name: r.name, capsName: r.caps_name, empId: r.emp_id, dept: r.dept, rank: r.rank, position: r.position ?? "",
    phone: r.phone ?? "", ext: r.ext ?? "", email: r.email ?? "", joinDate: r.join_date, leaveDate: r.leave_date,
    note: r.note, ord: r.ord,
  }));
}

/** 직원 명부를 통째로 교체 저장한다 (추가·수정·삭제 모두 반영). 저장한 인원 수를 돌려준다. */
export async function saveEmployees(list: Employee[], user: string): Promise<number> {
  const d = list.map((e) => ({ ...e, name: e.name.trim() })).filter((e) => e.name);
  const seen = new Set<string>(), dup = new Set<string>();
  d.forEach((e) => (seen.has(e.name) ? dup.add(e.name) : seen.add(e.name)));
  if (dup.size) {
    throw new Error(`같은 이름이 두 번 있습니다: ${[...dup].sort().join(", ")} (동명이인은 '홍길동2'처럼 구분해 주세요)`);
  }
  const rows = d.map((e, i) => ({
    name: e.name, caps_name: e.capsName.trim(), emp_id: e.empId.trim(), dept: e.dept.trim(), rank: e.rank.trim(),
    position: e.position.trim(), phone: e.phone.trim(), ext: e.ext.trim(), email: e.email.trim(),
    join_date: e.joinDate || null, leave_date: e.leaveDate || null, note: e.note.trim(), ord: i + 1,
  }));
  const sb = await createClient();
  return check(await sb.rpc("save_employees", { p_rows: rows, p_user: user }), "직원 명부 저장") as number;
}

// ---------------------------------------------------------------- 휴가 등록·연차 조정
interface VacationRow {
  id: number; name: string; type: string; start_day: string; end_day: string; start_time: string; end_time: string;
  reason: string; note: string; created_by: string; created_at: string;
}

export async function loadVacations(): Promise<Vacation[]> {
  const sb = await createClient();
  const rows = await selectAll<VacationRow>("휴가 읽기", (a, b) =>
    sb.from("vacations").select("*").order("start_day").order("id").range(a, b));
  return rows.map((r) => ({
    id: r.id, name: r.name, type: r.type, startDay: r.start_day, endDay: r.end_day, startTime: r.start_time,
    endTime: r.end_time, reason: r.reason, note: r.note, createdBy: r.created_by, createdAt: r.created_at,
  }));
}

export async function addVacation(v: Omit<Vacation, "id" | "createdAt">): Promise<void> {
  const sb = await createClient();
  check(await sb.from("vacations").insert({
    name: v.name, type: v.type, start_day: v.startDay, end_day: v.endDay, start_time: v.startTime, end_time: v.endTime,
    reason: v.reason, note: v.note, created_by: v.createdBy,
  }), "휴가 등록");
}

export async function deleteVacation(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("vacations").delete().eq("id", id), "휴가 삭제");
}

export async function loadAdjusts(): Promise<Adjust[]> {
  const sb = await createClient();
  const rows = check(await sb.from("leave_adjust").select("*").order("id"), "연차 조정 읽기") ?? [];
  return rows.map((r) => ({
    id: r.id, name: r.name, fy: r.fy, days: Number(r.days), reason: r.reason, createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function addAdjust(a: Omit<Adjust, "id" | "createdAt">): Promise<void> {
  const sb = await createClient();
  check(await sb.from("leave_adjust").insert({
    name: a.name, fy: a.fy, days: a.days, reason: a.reason, created_by: a.createdBy,
  }), "연차 조정 저장");
}

export async function deleteAdjust(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("leave_adjust").delete().eq("id", id), "연차 조정 삭제");
}

// ---------------------------------------------------------------- 근태 증빙 파일
export interface Attachment {
  id: number; name: string; dayFrom: DateStr; dayTo: DateStr; type: string; title: string; fileName: string;
  mime: string; size: number; uploadedBy: string; createdAt: string;
}

const ATT_COLS = "id, name, day_from, day_to, type, title, file_name, mime, size, uploaded_by, created_at";
type AttRow = {
  id: number; name: string; day_from: string; day_to: string; type: string; title: string; file_name: string;
  mime: string; size: number; uploaded_by: string; created_at: string;
};
const toAtt = (r: AttRow): Attachment => ({
  id: r.id, name: r.name, dayFrom: r.day_from, dayTo: r.day_to, type: r.type, title: r.title, fileName: r.file_name,
  mime: r.mime, size: r.size, uploadedBy: r.uploaded_by, createdAt: r.created_at,
});

/** 기간 [from, to]와 겹치는 증빙 목록 (파일 내용 제외) */
export async function loadAttachments(from?: DateStr, to?: DateStr): Promise<Attachment[]> {
  const sb = await createClient();
  let q = sb.from("attachments").select(ATT_COLS);
  if (to) q = q.lte("day_from", to);
  if (from) q = q.gte("day_to", from);
  const rows = check(await q.order("day_from").order("id"), "증빙 목록 읽기") ?? [];
  return (rows as AttRow[]).map(toAtt);
}

export async function addAttachment(a: Omit<Attachment, "id" | "createdAt" | "size">, data: Uint8Array): Promise<void> {
  const sb = await createClient();
  check(await sb.from("attachments").insert({
    name: a.name, day_from: a.dayFrom, day_to: a.dayTo, type: a.type, title: a.title, file_name: a.fileName,
    mime: a.mime, size: data.length, uploaded_by: a.uploadedBy, content: `\\x${Buffer.from(data).toString("hex")}`, // bytea 16진 표기
  }), "증빙 저장");
}

/** 증빙 파일 하나 (내용 포함) */
export async function loadAttachmentFile(id: number): Promise<(Attachment & { data: Buffer }) | null> {
  const sb = await createClient();
  const r = check(await sb.from("attachments").select(`${ATT_COLS}, content`).eq("id", id).maybeSingle(), "증빙 읽기");
  if (!r) return null;
  const hex = String((r as AttRow & { content: string }).content).replace(/^\\x/, "");
  return { ...toAtt(r as AttRow), data: Buffer.from(hex, "hex") };
}

export async function deleteAttachment(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("attachments").delete().eq("id", id), "증빙 삭제");
}
