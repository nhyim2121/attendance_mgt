/** 직원 민감 정보(생년월일·주민등록번호·급여)와 첨부 파일. 관리자만. 서버 전용.
 *  주민등록번호는 AES-256-GCM으로 암호화해 저장하고, 화면에는 가린 값만 보낸다. */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "../supabase/server";
import { addFile, type GaFile, loadFiles } from "../총무/mail";
import { isDateStr } from "../time";

export interface EmpPrivate { birth: string | null; rrnMask: string; salaryType: string; salary: number | null; salaryNote: string }
export const SALARY_TYPES = ["월급", "연봉", "시급"];

function key(): Buffer {
  const k = process.env.EMP_SECRET_KEY;
  if (!k) throw new Error("암호화 키(EMP_SECRET_KEY)가 설정되지 않았습니다.");
  const b = Buffer.from(k, "base64");
  if (b.length !== 32) throw new Error("암호화 키 길이가 맞지 않습니다.");
  return b;
}
function encrypt(text: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}
function decrypt(s: string): string {
  const [v, iv, tag, enc] = s.split(":");
  if (v !== "v1") throw new Error("알 수 없는 암호문입니다.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}

/** 주민등록번호 정리: 숫자 13자리 → '000000-0000000'. 틀리면 null */
export function cleanRrn(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 13) return null;
  const mm = +d.slice(2, 4), dd = +d.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || !"1234567890".includes(d[6])) return null;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}
export const maskRrn = (rrn: string) => `${rrn.slice(0, 8)}******`;
/** 주민번호 앞 7자리로 생년월일 */
export function birthFromRrn(rrn: string): string | null {
  const g = rrn[7], cent = "1256".includes(g) ? 1900 : "3478".includes(g) ? 2000 : "90".includes(g) ? 1800 : 0;
  if (!cent) return null;
  const d = `${cent + +rrn.slice(0, 2)}-${rrn.slice(2, 4)}-${rrn.slice(4, 6)}`;
  return isDateStr(d) ? d : null;
}

type Row = { name: string; birth: string | null; rrn_enc: string; rrn_mask: string; salary_type: string; salary: number | null; salary_note: string };

export async function loadPrivate(): Promise<Record<string, EmpPrivate>> {
  const sb = await createClient();
  const { data, error } = await sb.from("emp_private").select("name, birth, rrn_mask, salary_type, salary, salary_note");
  if (error) throw new Error(`직원 정보 읽기 실패: ${error.message}`);
  return Object.fromEntries((data as Omit<Row, "rrn_enc">[]).map((r) => [r.name, {
    birth: r.birth, rrnMask: r.rrn_mask, salaryType: r.salary_type, salary: r.salary === null ? null : Number(r.salary), salaryNote: r.salary_note,
  }]));
}

/** rrn: undefined = 그대로, '' = 지우기, 그 밖 = 새 번호(정리된 형태) */
export async function savePrivate(name: string, p: { birth: string | null; rrn?: string; salaryType: string; salary: number | null; salaryNote: string }) {
  const sb = await createClient();
  const row: Partial<Row> & { name: string; updated_at: string } = {
    name, birth: p.birth, salary_type: p.salaryType, salary: p.salary, salary_note: p.salaryNote, updated_at: new Date().toISOString(),
  };
  if (p.rrn !== undefined) { row.rrn_enc = p.rrn ? encrypt(p.rrn) : ""; row.rrn_mask = p.rrn ? maskRrn(p.rrn) : ""; }
  const { error } = await sb.from("emp_private").upsert(row);
  if (error) throw new Error(`직원 정보 저장 실패: ${error.message}`);
}

export async function revealRrn(name: string): Promise<string> {
  const sb = await createClient();
  const { data, error } = await sb.from("emp_private").select("rrn_enc").eq("name", name).maybeSingle();
  if (error) throw new Error(`읽기 실패: ${error.message}`);
  return data?.rrn_enc ? decrypt(data.rrn_enc) : "";
}

// ---------------------------------------------------------------- 첨부 파일 (ga_files ref='empfile:<이름>')
const fref = (name: string) => `empfile:${name}`;
export async function loadEmpFiles(): Promise<Record<string, GaFile[]>> {
  const m = await loadFiles("empfile:");
  return Object.fromEntries([...m].map(([r, f]) => [r.slice(8), f]));
}
export const addEmpFile = (name: string, fileName: string, mime: string, data: Uint8Array) => addFile(fref(name), fileName, mime, data);
export async function deleteEmpFile(id: number): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.from("ga_files").delete().eq("id", id).like("ref", "empfile:%");
  if (error) throw new Error(`파일 지우기 실패: ${error.message}`);
}

/** 이름 바꾸기·지우기에 따라가기 */
export async function renamePrivate(from: string, to: string): Promise<void> {
  if (from === to) return;
  const sb = await createClient();
  const a = await sb.from("emp_private").update({ name: to }).eq("name", from);
  const b = await sb.from("ga_files").update({ ref: fref(to) }).eq("ref", fref(from));
  if (a.error || b.error) throw new Error(`이름 바꾸기 실패: ${(a.error ?? b.error)!.message}`);
}
export async function dropPrivate(name: string): Promise<void> {
  const sb = await createClient();
  await sb.from("emp_private").delete().eq("name", name);
  await sb.from("ga_files").delete().eq("ref", fref(name));
}
