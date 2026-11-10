/** 입찰 공고 읽기·쓰기. 표 ledger_rows (book='bids', data = Bid), 첨부는 ga_files ref='lg:<id>'.
 *  알림 조건·마지막 수집 기록은 settings (bid_watch·bid_fetch_log).
 *  sb를 안 주면 로그인한 사람 권한(RLS), 자동 수집(/api/bid/fetch)은 service role 클라이언트를 준다. 서버 전용. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import { type Bid, DEFAULT_WATCH, emptyBid, type Watch } from "./bid";

const BOOK = "bids";
type Db = SupabaseClient;
const db = async (sb?: Db): Promise<Db> => sb ?? ((await createClient()) as unknown as Db);
function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data;
}
type Row = { id: number; data: Partial<Bid> };
const toBid = (r: Row): Bid => ({ ...emptyBid(), ...r.data, id: r.id, dates: { ...(r.data.dates ?? {}) } });

export async function loadBids(sb?: Db): Promise<Bid[]> {
  const c = await db(sb);
  const rows = (check(await c.from("ledger_rows").select("id, data").eq("book", BOOK).order("id", { ascending: false }).limit(5000), "입찰 읽기") ?? []) as Row[];
  return rows.map(toBid);
}

export async function loadBid(id: number, sb?: Db): Promise<Bid | null> {
  const c = await db(sb);
  const r = check(await c.from("ledger_rows").select("id, data").eq("book", BOOK).eq("id", id).maybeSingle(), "입찰 읽기") as Row | null;
  return r ? toBid(r) : null;
}

export async function saveBid(b: Omit<Bid, "id"> & { id?: number }, sb?: Db): Promise<number> {
  const c = await db(sb);
  const { id, ...data } = b;
  const dayCol = (data.dates.bidClose ?? data.dates.posted ?? "").slice(0, 10) || null;
  if (id) {
    check(await c.from("ledger_rows").update({ data, day: dayCol, updated_at: new Date().toISOString() }).eq("id", id).eq("book", BOOK), "입찰 고치기");
    return id;
  }
  return (check(await c.from("ledger_rows").insert({ book: BOOK, data, day: dayCol }).select("id").single(), "입찰 저장") as { id: number }).id;
}

export async function deleteBid(id: number, sb?: Db): Promise<void> {
  const c = await db(sb);
  check(await c.from("ga_files").delete().eq("ref", `lg:${id}`), "첨부 삭제");
  check(await c.from("ledger_rows").delete().eq("id", id).eq("book", BOOK), "입찰 삭제");
}

async function getSet<T>(key: string, fallback: T, sb?: Db): Promise<T> {
  const c = await db(sb);
  const r = check(await c.from("settings").select("value").eq("key", key).maybeSingle(), "설정 읽기") as { value: T } | null;
  return r ? r.value : fallback;
}
async function setSet(key: string, value: unknown, sb?: Db): Promise<void> {
  const c = await db(sb);
  check(await c.from("settings").upsert({ key, value }), "설정 저장");
}

export const loadWatch = async (sb?: Db): Promise<Watch> => ({ ...DEFAULT_WATCH, ...(await getSet<Partial<Watch>>("bid_watch", {}, sb)) });
export const saveWatch = (w: Watch, sb?: Db) => setSet("bid_watch", w, sb);

export interface FetchLog { at: string; ok: boolean; message: string; added: number; seen: number; by: string }
export const loadFetchLog = (sb?: Db) => getSet<FetchLog | null>("bid_fetch_log", null, sb);
export const saveFetchLog = (l: FetchLog, sb?: Db) => setSet("bid_fetch_log", l, sb);
