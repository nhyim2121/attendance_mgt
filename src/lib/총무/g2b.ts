/** 나라장터 입찰공고 자동 수집 (조달청_나라장터 입찰공고정보서비스, data.go.kr 15129394).
 *  인증키: .env.local 의 DATA_GO_KR_KEY (공공데이터포털 '일반 인증키(Decoding)'). 없으면 수집하지 않는다.
 *  조회 기간은 한 번에 7일까지 (2026-11-10 공지). 물품·용역·공사 '조건검색(PPSSrch)'을 키워드마다 부른다.
 *  응답 칸 이름은 공개 소스 기준이라, 실제 키로 처음 불러올 때 맞는지 확인이 필요하다. 서버 전용. */
import "server-only";
import { type Bid, emptyBid, matchWatch, type Watch } from "./bid";
import { loadBids, saveBid } from "./bidStore";

const BASES = ["https://apis.data.go.kr/1230000/ad/BidPublicInfoService02", "https://apis.data.go.kr/1230000/ad/BidPublicInfoService"];
const OPS: [kind: string, op: string][] = [["물품", "getBidPblancListInfoThngPPSSrch"], ["용역", "getBidPblancListInfoServcPPSSrch"], ["공사", "getBidPblancListInfoCnstwkPPSSrch"]];

type Item = Record<string, string | number | null | undefined>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => { const n = Number(s(v).replace(/,/g, "")); return s(v) && Number.isFinite(n) && n > 0 ? n : null; };
/** '2026-11-10 10:00:00' · '202611101000' → '2026-11-10 10:00' */
function dt(v: unknown): string {
  const t = s(v);
  if (!t) return "";
  const d = t.replace(/[^0-9]/g, "");
  if (d.length >= 12) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${d.slice(8, 10)}:${d.slice(10, 12)}`;
  if (d.length >= 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return t;
}
const ymdhm = (d: Date) => d.toISOString().replace(/[^0-9]/g, "").slice(0, 12);

async function call(op: string, params: Record<string, string>, key: string): Promise<{ items: Item[]; total: number }> {
  let lastErr = "";
  for (const base of BASES) {
    const q = new URLSearchParams({ serviceKey: key, type: "json", ...params });
    try {
      const res = await fetch(`${base}/${op}?${q}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      if (!res.ok || text.trim().startsWith("<")) { lastErr = `${res.status} ${text.slice(0, 120)}`; continue; }
      const j = JSON.parse(text);
      const head = j?.response?.header;
      if (head && head.resultCode && head.resultCode !== "00") { lastErr = `${head.resultCode} ${head.resultMsg}`; continue; }
      const body = j?.response?.body ?? {};
      const raw = body.items?.item ?? body.items ?? [];
      return { items: Array.isArray(raw) ? raw : [raw], total: Number(body.totalCount ?? 0) };
    } catch (e) { lastErr = (e as Error).message; }
  }
  throw new Error(lastErr || "응답이 없습니다.");
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

/** 최근 days일(최대 7) 공고를 키워드로 찾아 조건에 맞는 것만 '새 공고'로 넣는다. 이미 있는 공고는 일정만 새로 고친다. */
export async function fetchG2b(w: Watch, days = 7): Promise<{ added: number; seen: number; updated: number }> {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) throw new Error("공공데이터포털 인증키(DATA_GO_KR_KEY)가 아직 없습니다.");
  const end = new Date(), begin = new Date(end.getTime() - Math.min(days, 7) * 864e5);
  const have = new Map((await loadBids()).filter((b) => b.src === "g2b").map((b) => [`${b.ntceNo}-${b.ntceOrd}`, b]));
  const seenKeys = new Set<string>();
  let added = 0, updated = 0;
  for (const [kind, op] of OPS) {
    if (w.kinds.length && !w.kinds.includes(kind)) continue;
    for (const kw of w.keywords.filter(Boolean)) {
      for (let page = 1; page <= 5; page++) {
        const { items, total } = await call(op, { inqryDiv: "1", inqryBgnDt: ymdhm(begin), inqryEndDt: ymdhm(end), bidNtceNm: kw, pageNo: String(page), numOfRows: "100" }, key);
        for (const it of items) {
          const b = toBid(it, kind);
          const k = `${b.ntceNo}-${b.ntceOrd}`;
          if (!b.ntceNo || seenKeys.has(k)) continue;
          seenKeys.add(k);
          const old = have.get(k);
          if (old) {
            await saveBid({ ...old, dates: { ...old.dates, ...b.dates }, url: b.url || old.url, files: b.files.length ? b.files : old.files });
            updated++;
            continue;
          }
          const hit = matchWatch(w, b);
          if (!hit) continue;
          await saveBid({ ...b, matched: hit });
          added++;
        }
        if (page * 100 >= total) break;
      }
    }
  }
  return { added, seen: seenKeys.size, updated };
}
