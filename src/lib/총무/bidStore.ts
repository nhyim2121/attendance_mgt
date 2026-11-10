/** 입찰 공고 읽기·쓰기. 표 ledger_rows (book='bids', data = Bid), 첨부는 ga_files ref='lg:<id>'.
 *  알림 조건·마지막 수집 기록은 settings (bid_watch·bid_fetch_log). 서버 전용. */
import "server-only";
import { createClient } from "../supabase/server";
import { getSetting, setSetting } from "../store";
import { type Bid, DEFAULT_WATCH, emptyBid, type Watch } from "./bid";

const BOOK = "bids";
function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data;
}
type Row = { id: number; data: Partial<Bid> };
const toBid = (r: Row): Bid => ({ ...emptyBid(), ...r.data, id: r.id, dates: { ...(r.data.dates ?? {}) } });

export async function loadBids(): Promise<Bid[]> {
  const sb = await createClient();
  const rows = (check(await sb.from("ledger_rows").select("id, data").eq("book", BOOK).order("id", { ascending: false }).limit(5000), "입찰 읽기") ?? []) as Row[];
  return rows.map(toBid);
}

export async function loadBid(id: number): Promise<Bid | null> {
  const sb = await createClient();
  const r = check(await sb.from("ledger_rows").select("id, data").eq("book", BOOK).eq("id", id).maybeSingle(), "입찰 읽기") as Row | null;
  return r ? toBid(r) : null;
}

export async function saveBid(b: Omit<Bid, "id"> & { id?: number }): Promise<number> {
  const sb = await createClient();
  const { id, ...data } = b;
  const dayCol = (data.dates.bidClose ?? data.dates.posted ?? "").slice(0, 10) || null;
  if (id) {
    check(await sb.from("ledger_rows").update({ data, day: dayCol, updated_at: new Date().toISOString() }).eq("id", id).eq("book", BOOK), "입찰 고치기");
    return id;
  }
  return (check(await sb.from("ledger_rows").insert({ book: BOOK, data, day: dayCol }).select("id").single(), "입찰 저장") as { id: number }).id;
}

export async function deleteBid(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("ga_files").delete().eq("ref", `lg:${id}`), "첨부 삭제");
  check(await sb.from("ledger_rows").delete().eq("id", id).eq("book", BOOK), "입찰 삭제");
}

export const loadWatch = async (): Promise<Watch> => ({ ...DEFAULT_WATCH, ...(await getSetting<Partial<Watch>>("bid_watch", {})) });
export const saveWatch = (w: Watch) => setSetting("bid_watch", w);

export interface FetchLog { at: string; ok: boolean; message: string; added: number; seen: number }
export const loadFetchLog = () => getSetting<FetchLog | null>("bid_fetch_log", null);
export const saveFetchLog = (l: FetchLog) => setSetting("bid_fetch_log", l);
