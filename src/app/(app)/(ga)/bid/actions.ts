"use server";
import { requirePerm } from "@/lib/auth";
/** 입찰관리 저장: 공고 등록·고치기, 단계 바꾸기, 업무 절차 체크, 투찰·개찰 결과, 메모, 알림 조건, 나라장터 불러오기 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBid } from "@/lib/auth";
import { type Bid, DATE_KEYS, DEFAULT_CHECKLIST, emptyBid, KINDS, matchWatch, type Stage, STAGES, summaryOf, type Watch } from "@/lib/총무/bid";
import { deleteBid, loadBid, loadWatch, saveBid, saveFetchLog, saveWatch } from "@/lib/총무/bidStore";
import { fetchG2b, keepBid, searchG2b } from "@/lib/총무/g2b";
import { todayKst } from "@/lib/time";

type Res = { ok?: string; error?: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => { const n = Number(str(f, k).replace(/[^0-9.]/g, "")); return str(f, k) && Number.isFinite(n) ? n : null; };
const list = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const done = () => revalidatePath("/", "layout");

/** 공고 직접 등록·고치기 (사이트에서 본 공고를 옮겨 적기) */
export async function saveBidForm(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  await requireBid();
  const id = Number(f.get("id") || 0);
  const old = id ? await loadBid(id) : null;
  const name = str(f, "name");
  if (!name) return { error: "공고명을 적어 주세요." };
  const kind = str(f, "kind");
  const dates: Bid["dates"] = {};
  for (const [k] of DATE_KEYS) {
    const d = str(f, `d_${k}`), t = str(f, `t_${k}`);
    if (d) dates[k] = t ? `${d} ${t}` : d;
  }
  const b: Omit<Bid, "id"> = {
    ...(old ?? emptyBid()),
    src: str(f, "src") || old?.src || "manual", ntceNo: str(f, "ntceNo"), ntceOrd: str(f, "ntceOrd"), name, org: str(f, "org"), demand: str(f, "demand"),
    kind: (KINDS as readonly string[]).includes(kind) ? kind : "기타", method: str(f, "method"), award: str(f, "award"), region: str(f, "region"),
    price: money(f, "price"), base: money(f, "base"), url: str(f, "url"), dates, briefPlace: str(f, "briefPlace"), briefRequired: f.get("briefRequired") === "on",
    owner: str(f, "owner"),
  };
  const newId = await saveBid(id ? { ...b, id } : b);
  done();
  if (!id) redirect(`/bid/item?id=${newId}`);
  return { ok: "저장했습니다." };
}

/** 단계 바꾸기. 참여를 정하면 업무 절차 체크리스트를 붙인다. */
export async function setStage(id: number, stage: string): Promise<void> {
  await requirePerm("update");
  await requireBid();
  const b = await loadBid(id);
  if (!b || !(STAGES as readonly string[]).includes(stage)) return;
  const checklist = stage === "참여 결정" && !b.checklist.length ? DEFAULT_CHECKLIST.map((t) => ({ t, done: false })) : b.checklist;
  await saveBid({ ...b, stage: stage as Stage, checklist });
  done();
}

export async function toggleCheck(id: number, i: number): Promise<void> {
  await requirePerm("update");
  await requireBid();
  const b = await loadBid(id);
  if (!b?.checklist[i]) return;
  await saveBid({ ...b, checklist: b.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)) });
  done();
}
export async function addCheck(id: number, t: string): Promise<void> {
  await requirePerm("create");
  await requireBid();
  const b = await loadBid(id);
  if (!b || !t.trim()) return;
  await saveBid({ ...b, checklist: [...b.checklist, { t: t.trim().slice(0, 100), done: false }] });
  done();
}
export async function removeCheck(id: number, i: number): Promise<void> {
  await requirePerm("delete");
  await requireBid();
  const b = await loadBid(id);
  if (!b) return;
  await saveBid({ ...b, checklist: b.checklist.filter((_, j) => j !== i) });
  done();
}

/** 투찰·개찰 결과 */
export async function saveResult(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  await requireBid();
  const id = Number(f.get("id"));
  const b = await loadBid(id);
  if (!b) return { error: "없는 공고입니다." };
  const stage = str(f, "stage");
  await saveBid({
    ...b, bidAmount: money(f, "bidAmount"), bidAt: str(f, "bidAt").replace("T", " "), rate: money(f, "rate"),
    winAmount: money(f, "winAmount"), rank: str(f, "rank"), winner: str(f, "winner"),
    stage: (STAGES as readonly string[]).includes(stage) ? (stage as Stage) : b.stage,
  });
  done();
  return { ok: "저장했습니다." };
}

export async function saveMemo(id: number, memo: string): Promise<void> {
  await requirePerm("update");
  await requireBid();
  const b = await loadBid(id);
  if (!b) return;
  await saveBid({ ...b, memo: memo.slice(0, 5000) });
  done();
}

export async function removeBid(id: number): Promise<void> {
  await requirePerm("delete");
  await requireBid();
  await deleteBid(id);
  done();
  redirect("/bid");
}

/** 알림 조건 */
export async function saveWatchForm(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  await requireBid();
  const w: Watch = {
    keywords: list(str(f, "keywords")), exclude: list(str(f, "exclude")), kinds: f.getAll("kinds").map(String),
    minPrice: money(f, "minPrice"), maxPrice: money(f, "maxPrice"), regions: list(str(f, "regions")), orgs: list(str(f, "orgs")),
  };
  if (!w.keywords.length) return { error: "키워드를 하나 이상 적어 주세요." };
  await saveWatch(w);
  done();
  return { ok: "알림 조건을 저장했습니다. 다음 불러오기부터 적용됩니다." };
}

/** 나라장터에서 지금 불러오기 (알림 조건으로, 최근 7일) */
export async function fetchNow(_prev: Res): Promise<Res> {
  const me = await requireBid();
  const at = new Date().toISOString();
  try {
    const r = await fetchG2b(await loadWatch(), undefined, 7);
    await saveFetchLog({ at, ok: true, message: `새 공고 ${r.added}건 · 확인 ${r.seen}건 · 일정 갱신 ${r.updated}건`, added: r.added, seen: r.seen, by: me.name });
    done();
    return { ok: `나라장터에서 새 공고 ${r.added}건을 가져왔습니다.` };
  } catch (e) {
    const message = (e as Error).message;
    await saveFetchLog({ at, ok: false, message, added: 0, seen: 0, by: me.name });
    done();
    return { error: message };
  }
}

// ---------------------------------------------------------------- 공고 검색 (저장 안 함) · 담기
export interface Found { key: string; bid: Omit<Bid, "id">; line: string; matched: string[] }
export type SearchRes = { error?: string; items?: Found[]; note?: string } | null;

export async function searchNow(_prev: SearchRes, f: FormData): Promise<SearchRes> {
  await requireBid();
  const kinds = f.getAll("kinds").map(String).filter((k) => (KINDS as readonly string[]).includes(k));
  const q = { keyword: str(f, "keyword"), kinds, days: Number(str(f, "days")) || 7, minPrice: money(f, "minPrice"), maxPrice: money(f, "maxPrice"), region: str(f, "region"), org: str(f, "org") };
  if (!q.keyword && !q.org) return { error: "키워드나 기관 중 하나는 적어 주세요." };
  try {
    const [found, w] = await Promise.all([searchG2b(q), loadWatch()]);
    const today = todayKst();
    const items = found.slice(0, 200).map((b) => ({ key: `${b.ntceNo}-${b.ntceOrd}`, bid: b, line: summaryOf({ ...b, id: 0 }, today).line, matched: matchWatch(w, b) ?? [] }));
    return { items, note: found.length > 200 ? `${found.length}건 중 200건만 보입니다. 조건을 좁혀 주세요.` : undefined };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** 검색 결과를 받은 공고에 담기 */
export async function keepFound(b: Omit<Bid, "id">, matched: string[]): Promise<{ id: number; isNew: boolean }> {
  await requirePerm("update");
  await requireBid();
  const clean: Omit<Bid, "id"> = { ...emptyBid(), ...b, src: "g2b", stage: "새 공고", checklist: [], memo: "", fetchedAt: new Date().toISOString() };
  const r = await keepBid(clean, matched.map(String).slice(0, 20));
  done();
  return r;
}
