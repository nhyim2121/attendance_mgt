/** 총무 > 문서 수발 대장: 공문·우편·등기·팩스·택배의 수신·발신 기록과 스캔본.
 *  총무 영역은 관리자 한 사람만 쓴다 (DB 권한도 관리자만). 서버 전용. */
import "server-only";
import { createClient } from "../supabase/server";
import type { DateStr } from "../time";

export const DIRS = ["수신", "발신"] as const;
export const KINDS = ["공문", "우편", "등기", "팩스", "택배", "이메일", "기타"] as const;
export const STATUSES = ["처리 중", "완료"] as const;
export type Dir = (typeof DIRS)[number];

export interface Mail {
  id: number; dir: Dir; year: number; seq: number; day: DateStr; kind: string; party: string; title: string;
  refNo: string; route: string; status: string; due: DateStr | null; note: string;
  replyOf: number | null; // 회신이면 원래 받은 문서 id
  cost: number | null;    // 발송 요금(원)
  batch: string;          // 엑셀에서 가져온 묶음 이름 (직접 적은 것은 빈칸)
}
export interface GaFile { id: number; ref: string; fileName: string; mime: string; size: number; createdAt: string }
export type MailInput = Omit<Mail, "id" | "year" | "seq" | "batch">;

/** 대장 번호: 2026-수신-001 */
export const mailNo = (m: Pick<Mail, "year" | "dir" | "seq">) => `${m.year}-${m.dir}-${String(m.seq).padStart(3, "0")}`;
export const mailRef = (id: number) => `mail:${id}`;

type Row = {
  id: number; dir: Dir; year: number; seq: number; day: string; kind: string; party: string; title: string;
  ref_no: string; route: string; status: string; due: string | null; note: string;
  reply_of: number | null; cost: number | null; batch: string;
};
const COLS = "id, dir, year, seq, day, kind, party, title, ref_no, route, status, due, note, reply_of, cost, batch";
const toMail = (r: Row): Mail => ({
  id: r.id, dir: r.dir, year: r.year, seq: r.seq, day: r.day, kind: r.kind, party: r.party, title: r.title,
  refNo: r.ref_no, route: r.route, status: r.status, due: r.due, note: r.note, replyOf: r.reply_of, cost: r.cost, batch: r.batch,
});
const toRow = (m: MailInput) => ({
  dir: m.dir, day: m.day, kind: m.kind, party: m.party, title: m.title, ref_no: m.refNo, route: m.route,
  status: m.status, due: m.due, note: m.note, reply_of: m.dir === "발신" ? m.replyOf : null, cost: m.cost,
});

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data;
}

/** 그 해의 대장 전체 (날짜 최신 순) */
export async function loadMails(year: number): Promise<Mail[]> {
  const sb = await createClient();
  const rows = check(await sb.from("ga_mail").select(COLS).eq("year", year)
    .order("day", { ascending: false }).order("seq", { ascending: false }), "문서 수발 대장 읽기") ?? [];
  return (rows as Row[]).map(toMail);
}

export async function loadMail(id: number): Promise<Mail | null> {
  const sb = await createClient();
  const r = check(await sb.from("ga_mail").select(COLS).eq("id", id).maybeSingle(), "문서 읽기");
  return r ? toMail(r as Row) : null;
}

/** 아직 처리 중인 것 (해 구분 없이) */
export async function loadOpenMails(): Promise<Mail[]> {
  const sb = await createClient();
  const rows = check(await sb.from("ga_mail").select(COLS).eq("status", "처리 중").order("day"), "처리 중 문서 읽기") ?? [];
  return (rows as Row[]).map(toMail);
}

/** 대장이 있는 해들 + 올해 */
export async function mailYears(thisYear: number): Promise<number[]> {
  const sb = await createClient();
  const rows = check(await sb.from("ga_mail").select("year"), "대장 연도 읽기") ?? [];
  return [...new Set([thisYear, ...(rows as { year: number }[]).map((r) => r.year)])].sort((a, b) => b - a);
}

/** 예전에 적은 상대처 (입력할 때 고르기용, 많이 쓴 순) */
export async function knownParties(): Promise<string[]> {
  const sb = await createClient();
  const rows = (check(await sb.from("ga_mail").select("party"), "상대처 읽기") ?? []) as { party: string }[];
  const n = new Map<string, number>();
  for (const r of rows) if (r.party) n.set(r.party, (n.get(r.party) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

async function nextSeq(sb: Awaited<ReturnType<typeof createClient>>, dir: Dir, year: number): Promise<number> {
  const r = check(await sb.from("ga_mail").select("seq").eq("dir", dir).eq("year", year)
    .order("seq", { ascending: false }).limit(1).maybeSingle(), "대장 번호 읽기") as { seq: number } | null;
  return (r?.seq ?? 0) + 1;
}

/** 새로 적기. 번호는 그 해 수신/발신마다 1부터 자동. */
export async function addMail(m: MailInput): Promise<Mail> {
  const sb = await createClient();
  const year = +m.day.slice(0, 4);
  for (let i = 0; ; i++) {
    const seq = await nextSeq(sb, m.dir, year);
    const res = await sb.from("ga_mail").insert({ ...toRow(m), year, seq }).select(COLS).single();
    if (!res.error) return closeReplied(toMail(res.data as Row));
    if (i >= 2 || !/duplicate|unique/i.test(res.error.message)) throw new Error(`문서 저장 실패: ${res.error.message}`);
  }
}

/** 고치기. 수신/발신이나 해가 바뀌면 새 번호를 받는다. */
export async function updateMail(id: number, m: MailInput): Promise<Mail> {
  const sb = await createClient();
  const old = await loadMail(id);
  if (!old) throw new Error("고칠 문서가 없습니다.");
  const year = +m.day.slice(0, 4);
  const renum = old.dir !== m.dir || old.year !== year;
  const patch = { ...toRow(m), updated_at: new Date().toISOString(), ...(renum ? { year, seq: await nextSeq(sb, m.dir, year) } : {}) };
  return closeReplied(toMail(check(await sb.from("ga_mail").update(patch).eq("id", id).select(COLS).single(), "문서 고치기") as Row));
}

/** 회신을 보냈으면 원래 받은 문서는 처리 완료 */
async function closeReplied(m: Mail): Promise<Mail> {
  if (m.dir === "발신" && m.replyOf) {
    const sb = await createClient();
    check(await sb.from("ga_mail").update({ status: "완료", updated_at: new Date().toISOString() }).eq("id", m.replyOf).eq("status", "처리 중"), "회신한 문서 완료 처리");
  }
  return m;
}

/** id들의 대장 번호 (다른 해 문서를 가리킬 때) */
export async function mailNos(ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const sb = await createClient();
  const rows = (check(await sb.from("ga_mail").select("id, dir, year, seq").in("id", [...new Set(ids)]), "대장 번호 읽기") ?? []) as Row[];
  return new Map(rows.map((r) => [r.id, mailNo(r)]));
}

/** 받은 문서 id → 그 회신으로 보낸 문서들 */
export async function repliesTo(ids: number[]): Promise<Map<number, Mail[]>> {
  const out = new Map<number, Mail[]>();
  if (!ids.length) return out;
  const sb = await createClient();
  const rows = (check(await sb.from("ga_mail").select(COLS).in("reply_of", ids).order("day"), "회신 읽기") ?? []) as Row[];
  for (const r of rows.map(toMail)) out.set(r.replyOf!, [...(out.get(r.replyOf!) ?? []), r]);
  return out;
}

/** 회신을 고를 후보: 처리 중인 받은 문서 + 최근 받은 문서 */
export async function replyCandidates(): Promise<Mail[]> {
  const sb = await createClient();
  const rows = (check(await sb.from("ga_mail").select(COLS).eq("dir", "수신")
    .order("day", { ascending: false }).order("seq", { ascending: false }).limit(200), "받은 문서 읽기") ?? []) as Row[];
  const list = rows.map(toMail);
  return [...list.filter((x) => x.status === "처리 중"), ...list.filter((x) => x.status !== "처리 중").slice(0, 40)];
}

// ---------------------------------------------------------------- 예전 엑셀 대장 가져오기
/** 여러 줄을 한 묶음으로 넣는다. 번호는 날짜 순서대로 그 해 마지막 번호 뒤에 붙인다. */
export async function importMails(list: MailInput[], batch: string): Promise<number> {
  const sb = await createClient();
  const sorted = [...list].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const next = new Map<string, number>();
  const rows = [];
  for (const m of sorted) {
    const year = +m.day.slice(0, 4), k = `${m.dir}|${year}`;
    if (!next.has(k)) next.set(k, await nextSeq(sb, m.dir, year));
    const seq = next.get(k)!;
    next.set(k, seq + 1);
    rows.push({ ...toRow(m), year, seq, batch });
  }
  for (let i = 0; i < rows.length; i += 500) check(await sb.from("ga_mail").insert(rows.slice(i, i + 500)), "대장 가져오기");
  return rows.length;
}

/** 가져온 묶음들 (되돌리기용) */
export async function importBatches(): Promise<{ batch: string; n: number }[]> {
  const sb = await createClient();
  const rows = (check(await sb.from("ga_mail").select("batch").neq("batch", ""), "가져온 묶음 읽기") ?? []) as { batch: string }[];
  const n = new Map<string, number>();
  for (const r of rows) n.set(r.batch, (n.get(r.batch) ?? 0) + 1);
  return [...n].map(([batch, c]) => ({ batch, n: c })).sort((a, b) => (a.batch < b.batch ? 1 : -1));
}

export async function undoImport(batch: string): Promise<void> {
  const sb = await createClient();
  const ids = ((check(await sb.from("ga_mail").select("id").eq("batch", batch), "묶음 읽기") ?? []) as { id: number }[]).map((r) => r.id);
  if (ids.length) check(await sb.from("ga_files").delete().in("ref", ids.map(mailRef)), "첨부 삭제");
  check(await sb.from("ga_mail").delete().eq("batch", batch), "가져온 묶음 지우기");
}

export async function setMailStatus(id: number, status: string): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_mail").update({ status, updated_at: new Date().toISOString() }).eq("id", id), "처리 상태 바꾸기");
}

export async function deleteMail(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_files").delete().eq("ref", mailRef(id)), "첨부 삭제");
  check(await sb.from("ga_mail").delete().eq("id", id), "문서 삭제");
}

// ---------------------------------------------------------------- 첨부 파일 (총무 공통)
const FCOLS = "id, ref, file_name, mime, size, created_at";
type FRow = { id: number; ref: string; file_name: string; mime: string; size: number; created_at: string };
const toFile = (r: FRow): GaFile => ({ id: r.id, ref: r.ref, fileName: r.file_name, mime: r.mime, size: r.size, createdAt: r.created_at });

/** ref 앞부분(예: 'mail:')이 같은 첨부 전체 → ref별 */
export async function loadFiles(prefix: string): Promise<Map<string, GaFile[]>> {
  const sb = await createClient();
  const rows = (check(await sb.from("ga_files").select(FCOLS).like("ref", `${prefix}%`).order("id"), "첨부 목록 읽기") ?? []) as FRow[];
  const out = new Map<string, GaFile[]>();
  for (const r of rows) out.set(r.ref, [...(out.get(r.ref) ?? []), toFile(r)]);
  return out;
}

export async function addFile(ref: string, fileName: string, mime: string, data: Uint8Array): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_files").insert({
    ref, file_name: fileName, mime, size: data.length, content: `\\x${Buffer.from(data).toString("hex")}`, // bytea 16진 표기
  }), "첨부 저장");
}

export async function loadFileData(id: number): Promise<(GaFile & { data: Buffer }) | null> {
  const sb = await createClient();
  const r = check(await sb.from("ga_files").select(`${FCOLS}, content`).eq("id", id).maybeSingle(), "첨부 읽기");
  if (!r) return null;
  const hex = String((r as FRow & { content: string }).content).replace(/^\\x/, "");
  return { ...toFile(r as FRow), data: Buffer.from(hex, "hex") };
}

export async function deleteFile(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_files").delete().eq("id", id), "첨부 삭제");
}

// ---------------------------------------------------------------- 화면·엑셀 공통 거르기
export interface MailFilter { y: number; m: string; dir: string; kind: string; q: string; open: boolean }
type Sp = Record<string, string | string[] | undefined>;
const one = (v: Sp[string]) => (typeof v === "string" ? v : "");

export function readFilter(sp: Sp, thisYear: number): MailFilter {
  const y = Number(one(sp.y)) || thisYear;
  const m = /^(0[1-9]|1[0-2])$/.test(one(sp.m)) ? one(sp.m) : "";
  const dir = DIRS.includes(one(sp.dir) as Dir) ? one(sp.dir) : "";
  const kind = (KINDS as readonly string[]).includes(one(sp.kind)) ? one(sp.kind) : "";
  return { y, m, dir, kind, q: one(sp.q).trim(), open: one(sp.open) === "1" };
}

export function filterMails(list: Mail[], f: MailFilter): Mail[] {
  const q = f.q.toLowerCase();
  return list.filter((x) => (!f.m || x.day.slice(5, 7) === f.m) && (!f.dir || x.dir === f.dir) && (!f.kind || x.kind === f.kind)
    && (!f.open || x.status === "처리 중")
    && (!q || [mailNo(x), x.party, x.title, x.refNo, x.route, x.note].some((s) => s.toLowerCase().includes(q))));
}

/** 첨부의 ref 바꾸기 (예: 지원사업 자료 이름을 고칠 때 파일도 따라가게) */
export async function moveFiles(fromRef: string, toRef: string): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_files").update({ ref: toRef }).eq("ref", fromRef), "첨부 옮기기");
}
/** ref가 정확히 같은 첨부 지우기 */
export async function deleteFilesOf(ref: string): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_files").delete().eq("ref", ref), "첨부 삭제");
}
