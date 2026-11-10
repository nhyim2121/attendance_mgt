/** 나라장터 입찰공고 검색·자동 수집 (조달청_나라장터 입찰공고정보서비스, data.go.kr 15129394).
 *  인증키: .env.local 의 DATA_GO_KR_KEY (공공데이터포털 '일반 인증키(Decoding)'). 없으면 부르지 않는다.
 *  조회 기간은 한 번에 7일까지 (2026-11-10 공지). 물품·용역·공사 '조건검색(PPSSrch)'을 쓴다.
 *  응답 칸 이름은 공개 소스 기준이라, 실제 키로 처음 불러올 때 맞는지 확인이 필요하다. 서버 전용. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Bid, emptyBid, matchWatch, type Watch } from "./bid";
import { loadBids, saveBid } from "./bidStore";

const BASES = ["https://apis.data.go.kr/1230000/ad/BidPublicInfoService02", "https://apis.data.go.kr/1230000/ad/BidPublicInfoService"];
const OPS: Record<string, string> = { 물품: "getBidPblancListInfoThngPPSSrch", 용역: "getBidPblancListInfoServcPPSSrch", 공사: "getBidPblancListInfoCnstwkPPSSrch" };
export const hasG2bKey = () => !!process.env.DATA_GO_KR_KEY;

type Item = Record<string, string | number | null | undefined>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => { const n = Number(s(v).replace(/,/g, "")); return s(v) && Number.isFinite(n) && n > 0 ? n : null; };
/** '2026-11-10 10:00:00' · '202611101000' → '2026-11-10 10:00' */
function dt(v: unknown): string {
  const t = s(v);
  const d = t.replace(/[^0-9]/g, "");
  if (d.length >= 12) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${d.slice(8, 10)}:${d.slice(10, 12)}`;
  if (d.length >= 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return t;
}
/** 한국 시각 YYYYMMDDHHMM */
const ymdhm = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().replace(/[^0-9]/g, "").slice(0, 12);

async function call(op: string, params: Record<string, string>): Promise<{ items: Item[]; total: number }> {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) throw new Error("공공데이터포털 인증키(DATA_GO_KR_KEY)가 아직 없습니다.");
  let lastErr = "";
  for (const base of BASES) {
    const q = new URLSearchParams({ serviceKey: key, type: "json", ...params });
    try {
      const res = await fetch(`${base}/${op}?${q}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      if (!res.ok || text.trim().startsWith("<")) { lastErr = `${res.status} ${text.slice(0, 160)}`; continue; }
      const j = JSON.parse(text);
      const head = j?.response?.header;
      if (head?.resultCode && head.resultCode !== "00") { lastErr = `${head.resultCode} ${head.resultMsg}`; continue; }
      const body = j?.response?.body ?? {};
      const raw = body.items?.item ?? body.items ?? [];
      return { items: Array.isArray(raw) ? raw : [raw], total: Number(body.totalCount ?? 0) };
    } catch (e) { lastErr = (e as Error).message; }
  }
  throw new Error(`나라장터 응답 오류: ${lastErr || "응답이 없습니다."}`);
}

function toBid(it: Item, kind: string): Omit<Bid, "id"> {
  const files = Array.from({ length: 10 }, (_, i) => ({ name: s(it[`ntceSpecFileNm${i + 1}`]), url: s(it[`ntceSpecDocUrl${i + 1}`]) })).filter((f) => f.url);
  return {
    ...emptyBid(), src: "g2b", kind, stage: "새 공고",
    ntceNo: s(it.bidNtceNo), ntceOrd: s(it.bidNtceOrd), name: s(it.bidNtceNm), org: s(it.ntceInsttNm), demand: s(it.dminsttNm),
    method: s(it.cntrctCnclsMthdNm), award: s(it.sucsfbidMthdNm) || s(it.bidMethdNm), region: s(it.prtcptLmtRgnNm),
    price: num(it.presmptPrce), base: null, url: s(it.bidNtceDtlUrl) || s(it.bidNtceUrl), files,
    dates: Object.fromEntries(Object.entries({
      posted: dt(it.bidNtceDt), qualify: dt(it.bidQlfctRgstDt), bidOpen: dt(it.bidBeginDt), bidClose: dt(it.bidClseDt), opening: dt(it.opengDt),
    }).filter(([, v]) => v)),
    fetchedAt: new Date().toISOString(),
  };
}

export interface SearchQuery { keyword: string; kinds: string[]; days: number; minPrice: number | null; maxPrice: number | null; region: string; org: string }

/** 공고 검색 (저장하지 않음). 기간은 최근 1~7일. */
export async function searchG2b(q: SearchQuery, maxPages = 3): Promise<Omit<Bid, "id">[]> {
  const end = new Date(), begin = new Date(end.getTime() - Math.min(Math.max(q.days, 1), 7) * 864e5);
  const out: Omit<Bid, "id">[] = [];
  const seen = new Set<string>();
  for (const kind of (q.kinds.length ? q.kinds : Object.keys(OPS)).filter((k) => OPS[k])) {
    for (let page = 1; page <= maxPages; page++) {
      const params: Record<string, string> = { inqryDiv: "1", inqryBgnDt: ymdhm(begin), inqryEndDt: ymdhm(end), pageNo: String(page), numOfRows: "100" };
      if (q.keyword) params.bidNtceNm = q.keyword;
      if (q.minPrice !== null) params.presmptPrceBgn = String(q.minPrice);
      if (q.maxPrice !== null) params.presmptPrceEnd = String(q.maxPrice);
      if (q.region) params.prtcptLmtRgnNm = q.region;
      if (q.org) params.ntceInsttNm = q.org;
      const { items, total } = await call(OPS[kind], params);
      for (const it of items) {
        const b = toBid(it, kind), k = `${b.ntceNo}-${b.ntceOrd}`;
        if (b.ntceNo && !seen.has(k)) { seen.add(k); out.push(b); }
      }
      if (page * 100 >= total) break;
    }
  }
  return out.sort((a, b) => (b.dates.posted ?? "").localeCompare(a.dates.posted ?? ""));
}

/** 공고 한 건을 받은 공고에 담기 (이미 있으면 일정만 새로 고침) */
export async function keepBid(b: Omit<Bid, "id">, matched: string[], sb?: SupabaseClient): Promise<{ id: number; isNew: boolean }> {
  const old = (await loadBids(sb)).find((x) => x.src === b.src && x.ntceNo === b.ntceNo && x.ntceOrd === b.ntceOrd);
  if (old) {
    await saveBid({ ...old, dates: { ...old.dates, ...b.dates }, url: b.url || old.url, files: b.files.length ? b.files : old.files }, sb);
    return { id: old.id, isNew: false };
  }
  return { id: await saveBid({ ...b, matched }, sb), isNew: true };
}

/** 자동 수집: 알림 조건의 키워드마다 최근 days일을 찾아 조건에 맞는 것만 '받은 공고'에 넣는다. */
export async function fetchG2b(w: Watch, sb?: SupabaseClient, days = 2): Promise<{ added: number; seen: number; updated: number }> {
  const have = new Map((await loadBids(sb)).filter((b) => b.src === "g2b").map((b) => [`${b.ntceNo}-${b.ntceOrd}`, b]));
  const seen = new Set<string>();
  let added = 0, updated = 0;
  for (const kw of w.keywords.filter(Boolean)) {
    const found = await searchG2b({ keyword: kw, kinds: w.kinds, days, minPrice: null, maxPrice: null, region: "", org: "" }, 5);
    for (const b of found) {
      const k = `${b.ntceNo}-${b.ntceOrd}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const old = have.get(k);
      if (old) {
        await saveBid({ ...old, dates: { ...old.dates, ...b.dates }, url: b.url || old.url, files: b.files.length ? b.files : old.files }, sb);
        updated++;
        continue;
      }
      const hit = matchWatch(w, b);
      if (!hit) continue;
      const id = await saveBid({ ...b, matched: hit }, sb);
      have.set(k, { ...b, id, matched: hit });
      added++;
    }
  }
  return { added, seen: seen.size, updated };
}
