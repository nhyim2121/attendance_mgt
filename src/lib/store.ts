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
 * - employees   : 직원 명부 (입사·퇴사)
 */
import "server-only";
import type { Override } from "./analytics";
import type { Employee } from "./employees";
import type { Leave, RosterRow } from "./hiworks";
import { type CapsRecord, finalizeRecords, type LoadInfo, type RawRecord } from "./loader";
import type { ReportRow } from "./daily";
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

// ---------------------------------------------------------------- 기입·수정
interface OverrideRow {
  employee: string; day: string; clock_in: string | null; in_type: string | null; clock_out: string | null;
  out_type: string | null; place: string | null; note: string | null; edited_by: string; edited_at: string;
}
const OV_FIELDS = ["clock_in", "in_type", "clock_out", "out_type", "place", "note"] as const;
export type OverrideField = (typeof OV_FIELDS)[number];
export type OverrideChange = { employee: string; day: DateStr } & Partial<Record<OverrideField, string>>;

const toOverride = (r: OverrideRow): Override => ({
  employee: r.employee, day: r.day, clockIn: r.clock_in, inType: r.in_type, clockOut: r.clock_out, outType: r.out_type,
  place: r.place, note: r.note, editedBy: r.edited_by, editedAt: r.edited_at,
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
    name: r.name, capsName: r.caps_name, empId: r.emp_id, dept: r.dept, rank: r.rank, joinDate: r.join_date,
    leaveDate: r.leave_date, note: r.note, ord: r.ord,
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
    join_date: e.joinDate || null, leave_date: e.leaveDate || null, note: e.note.trim(), ord: i + 1,
  }));
  const sb = await createClient();
  return check(await sb.rpc("save_employees", { p_rows: rows, p_user: user }), "직원 명부 저장") as number;
}
