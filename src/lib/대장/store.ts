/** 업무 대장 읽기·쓰기 (표 ledger_rows, 관리자만). 첨부는 ga_files ref='lg:<id>'. 서버 전용. */
import "server-only";
import { createClient } from "../supabase/server";
import type { Data, Row } from "./logic";

export const rowRef = (id: number) => `lg:${id}`;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data;
}
const COLS = "id, book, day, data, batch";

export async function loadRows(book: string): Promise<Row[]> {
  const sb = await createClient();
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = (check(await sb.from("ledger_rows").select(COLS).eq("book", book)
      .order("day", { ascending: false, nullsFirst: true }).order("id", { ascending: false }).range(from, from + 999), "대장 읽기") ?? []) as Row[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** 여러 대장 한꺼번에 (알림 모으기용) */
export async function loadBooks(books: string[]): Promise<Row[]> {
  if (!books.length) return [];
  const sb = await createClient();
  return (check(await sb.from("ledger_rows").select(COLS).in("book", books).limit(20000), "대장 읽기") ?? []) as Row[];
}

export async function loadRow(id: number): Promise<Row | null> {
  const sb = await createClient();
  return check(await sb.from("ledger_rows").select(COLS).eq("id", id).maybeSingle(), "대장 줄 읽기") as Row | null;
}

export async function saveRow(book: string, id: number, data: Data, day: string | null): Promise<number> {
  const sb = await createClient();
  if (id) {
    check(await sb.from("ledger_rows").update({ data, day, updated_at: new Date().toISOString() }).eq("id", id).eq("book", book), "대장 고치기");
    return id;
  }
  return (check(await sb.from("ledger_rows").insert({ book, data, day }).select("id").single(), "대장 저장") as { id: number }).id;
}

export async function deleteRow(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_files").delete().eq("ref", rowRef(id)), "첨부 삭제");
  check(await sb.from("ga_files").delete().like("ref", `${rowRef(id)}/%`), "단계별 첨부 삭제"); // 지원사업 단계별 서류
  check(await sb.from("ledger_rows").delete().eq("id", id), "대장 줄 삭제");
}

export async function importRows(book: string, rows: { data: Data; day: string | null }[], batch: string): Promise<number> {
  const sb = await createClient();
  for (let i = 0; i < rows.length; i += 500) {
    check(await sb.from("ledger_rows").insert(rows.slice(i, i + 500).map((r) => ({ book, data: r.data, day: r.day, batch }))), "대장 가져오기");
  }
  return rows.length;
}

export async function batchesOf(book: string): Promise<{ batch: string; n: number }[]> {
  const sb = await createClient();
  const rows = (check(await sb.from("ledger_rows").select("batch").eq("book", book).neq("batch", ""), "가져온 묶음 읽기") ?? []) as { batch: string }[];
  const n = new Map<string, number>();
  for (const r of rows) n.set(r.batch, (n.get(r.batch) ?? 0) + 1);
  return [...n].map(([batch, c]) => ({ batch, n: c })).sort((a, b) => (a.batch < b.batch ? 1 : -1));
}

export async function undoBatch(book: string, batch: string): Promise<void> {
  const sb = await createClient();
  const ids = ((check(await sb.from("ledger_rows").select("id").eq("book", book).eq("batch", batch), "묶음 읽기") ?? []) as { id: number }[]).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) check(await sb.from("ga_files").delete().in("ref", ids.slice(i, i + 200).map(rowRef)), "첨부 삭제");
  check(await sb.from("ledger_rows").delete().eq("book", book).eq("batch", batch), "가져온 묶음 지우기");
}
