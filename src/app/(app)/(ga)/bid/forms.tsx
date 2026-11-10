"use client";
/** 입찰관리 화면의 입력 부품: 공고 등록·고치기, 단계, 업무 절차, 투찰 계산기, 결과, 메모, 알림 조건, 불러오기 */
import { useActionState, useState, useTransition } from "react";
import { type Bid, calcBid, DATE_KEYS, KINDS, STAGES, type Watch } from "@/lib/총무/bid";
import { addCheck, fetchNow, removeBid, removeCheck, saveBidForm, saveMemo, saveResult, saveWatchForm, setStage, toggleCheck } from "./actions";

type Res = { ok?: string; error?: string } | null;
const Msg = ({ r }: { r: Res }) => (r?.error ? <p className="fd-err">{r.error}</p> : r?.ok ? <p className="u-okmsg">{r.ok}</p> : null);
const n2s = (n: number | null) => (n === null ? "" : String(n));

/** 공고 등록·고치기 */
export function BidForm({ bid, owners }: { bid?: Bid; owners: string[] }) {
  const [res, act, saving] = useActionState(saveBidForm, null);
  const b = bid;
  return (
    <form action={act} className="u-bform">
      {b && <input type="hidden" name="id" value={b.id} />}
      <input type="hidden" name="src" value={b?.src ?? "manual"} />
      <div className="g">
        <label className="w2">공고명 *<input name="name" defaultValue={b?.name} required placeholder="예: ○○정수장 전동기 구매" /></label>
        <label>구분<select name="kind" defaultValue={b?.kind ?? "물품"}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label>공고번호<input name="ntceNo" defaultValue={b?.ntceNo} placeholder="R26BK…" /></label>
        <label>차수<input name="ntceOrd" defaultValue={b?.ntceOrd} placeholder="000" /></label>
        <label>공고기관<input name="org" defaultValue={b?.org} /></label>
        <label>수요기관<input name="demand" defaultValue={b?.demand} /></label>
        <label>계약 방법<input name="method" defaultValue={b?.method} placeholder="제한경쟁, 일반경쟁, 수의…" /></label>
        <label>낙찰 방법<input name="award" defaultValue={b?.award} placeholder="적격심사, 최저가…" /></label>
        <label>참가 제한 지역<input name="region" defaultValue={b?.region} placeholder="비우면 전국" /></label>
        <label>추정가격(원)<input name="price" defaultValue={n2s(b?.price ?? null)} inputMode="numeric" /></label>
        <label>기초금액(원)<input name="base" defaultValue={n2s(b?.base ?? null)} inputMode="numeric" /></label>
        <label>담당<input name="owner" list="bid-owners" defaultValue={b?.owner} /><datalist id="bid-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist></label>
        <label className="w2">공고 원문 주소 (투찰하러 갈 곳)<input name="url" defaultValue={b?.url} placeholder="https://" /></label>
      </div>
      <h4>📅 일정 <small>날짜만 적어도 됩니다. 시각은 마감 시각이 있을 때만.</small></h4>
      <div className="u-dates">
        {DATE_KEYS.map(([k, label]) => {
          const v = b?.dates[k] ?? "";
          return (
            <label key={k} className={["bidClose", "opening", "docDue"].includes(k) ? "hot" : ""}>{label}
              <span><input type="date" name={`d_${k}`} defaultValue={v.slice(0, 10)} /><input type="time" name={`t_${k}`} defaultValue={v.slice(11, 16)} /></span>
            </label>
          );
        })}
        <label>현장설명회 장소<input name="briefPlace" defaultValue={b?.briefPlace} /></label>
        <label className="ck"><input type="checkbox" name="briefRequired" defaultChecked={b?.briefRequired} /> 현장설명회 참석 필수</label>
      </div>
      <Msg r={res} />
      <div className="fd-btns"><button className="fd-btn pri" disabled={saving}>{saving ? "저장하는 중…" : b ? "고친 내용 저장" : "공고 등록"}</button></div>
    </form>
  );
}

/** 단계 단추 */
export function StageBar({ id, stage }: { id: number; stage: string }) {
  const [pending, start] = useTransition();
  return (
    <div className={`u-stages${pending ? " busy" : ""}`}>
      {STAGES.map((s) => (
        <button key={s} type="button" className={s === stage ? "on" : ""} disabled={pending || s === stage} onClick={() => start(() => setStage(id, s))}>{s}</button>
      ))}
    </div>
  );
}

/** 업무 절차 체크리스트 */
export function Checklist({ id, items, stage }: { id: number; items: Bid["checklist"]; stage: string }) {
  const [pending, start] = useTransition();
  const [t, setT] = useState("");
  const left = items.filter((c) => !c.done).length;
  if (!items.length) return (
    <div>
      <p className="fd-empty">참여하기로 정하면 공고문 확인부터 계약까지 업무 절차가 생깁니다.</p>
      {stage !== "참여 결정" && <button type="button" className="u-more" disabled={pending} onClick={() => start(() => setStage(id, "참여 결정"))}>✋ 참여 결정하고 절차 만들기</button>}
    </div>
  );
  return (
    <div className={pending ? "busy" : ""}>
      <div className="u-att"><div><span>진행</span><span><b>{items.length - left}</b> / {items.length}</span></div><div className="u-prog"><i style={{ width: `${Math.round(((items.length - left) / items.length) * 100)}%` }} /></div></div>
      <ul className="u-check">{items.map((c, i) => (
        <li key={i} className={c.done ? "done" : ""}>
          <button type="button" className="ck" onClick={() => start(() => toggleCheck(id, i))} aria-label="체크" />
          <span onClick={() => start(() => toggleCheck(id, i))}>{c.t}</span>
          <button type="button" className="x" title="지우기" onClick={() => start(() => removeCheck(id, i))}>×</button>
        </li>
      ))}</ul>
      <form className="u-min" onSubmit={(e) => { e.preventDefault(); if (!t.trim()) return; const v = t; setT(""); start(() => addCheck(id, v)); }}>
        <input value={t} onChange={(e) => setT(e.target.value)} placeholder="할 일 더하기…" /><button aria-label="추가">+</button>
      </form>
    </div>
  );
}

/** 투찰금액 계산기: 기초금액 × 사정률 × 낙찰하한율 */
export function Calculator({ base }: { base: number | null }) {
  const [b, setB] = useState(base ? String(base) : "");
  const [a, setA] = useState("100.0");
  const [l, setL] = useState("87.745");
  const v = Number(b.replace(/,/g, "")), av = Number(a), lv = Number(l);
  const out = v > 0 && av > 0 && lv > 0 ? calcBid(v, av, lv) : null;
  return (
    <div className="u-calc">
      <label>기초금액(원)<input value={b} onChange={(e) => setB(e.target.value)} inputMode="numeric" /></label>
      <label>예상 사정률(%)<input value={a} onChange={(e) => setA(e.target.value)} inputMode="decimal" /></label>
      <label>낙찰하한율(%)<input value={l} onChange={(e) => setL(e.target.value)} inputMode="decimal" /></label>
      <div className="out">투찰금액 <b>{out ? `${out.toLocaleString("ko-KR")}원` : "-"}</b></div>
      <p className="fd-empty">낙찰하한율은 공고문의 적격심사 기준(예: 87.745%)을 확인해서 넣으세요. 계산 결과는 참고용입니다.</p>
    </div>
  );
}

/** 투찰·개찰 결과 */
export function ResultForm({ bid }: { bid: Bid }) {
  const [res, act, saving] = useActionState(saveResult, null);
  return (
    <form action={act} className="u-bform">
      <input type="hidden" name="id" value={bid.id} />
      <div className="g">
        <label>투찰금액(원)<input name="bidAmount" defaultValue={n2s(bid.bidAmount)} inputMode="numeric" /></label>
        <label>투찰 시각<input type="datetime-local" name="bidAt" defaultValue={bid.bidAt.replace(" ", "T")} /></label>
        <label>투찰률(%)<input name="rate" defaultValue={n2s(bid.rate)} inputMode="decimal" /></label>
        <label>낙찰금액(원)<input name="winAmount" defaultValue={n2s(bid.winAmount)} inputMode="numeric" /></label>
        <label>우리 순위<input name="rank" defaultValue={bid.rank} placeholder="예: 3 / 27" /></label>
        <label>낙찰 업체<input name="winner" defaultValue={bid.winner} /></label>
        <label>단계<select name="stage" defaultValue={bid.stage}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <Msg r={res} />
      <div className="fd-btns"><button className="fd-btn pri" disabled={saving}>{saving ? "저장하는 중…" : "결과 저장"}</button></div>
    </form>
  );
}

export function MemoBox({ id, memo }: { id: number; memo: string }) {
  const [v, setV] = useState(memo);
  const [pending, start] = useTransition();
  const dirty = v !== memo;
  return (
    <div className="u-memo2">
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={7} placeholder="검토 의견, 질의 내용, 경쟁사, 다음에 참고할 점…" />
      <div className="fd-btns"><button type="button" className="fd-btn pri" disabled={!dirty || pending} onClick={() => start(() => saveMemo(id, v))}>{pending ? "저장하는 중…" : dirty ? "메모 저장" : "저장됨"}</button></div>
    </div>
  );
}

export function QuickStage({ id, label, stage }: { id: number; label: string; stage: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="u-qs" disabled={pending} onClick={() => start(() => setStage(id, stage))}>{label}</button>;
}

export function DeleteBid({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return <button type="button" className="fd-btn" style={{ color: "var(--red)" }} disabled={pending} onClick={() => confirm("이 공고를 지울까요? 첨부도 함께 지워집니다.") && start(() => removeBid(id))}>공고 지우기</button>;
}

/** 알림 조건 */
export function WatchForm({ w }: { w: Watch }) {
  const [res, act, saving] = useActionState(saveWatchForm, null);
  return (
    <form action={act} className="u-bform">
      <label>키워드 (공고명에 하나라도 들어가면, 쉼표로 구분)<textarea name="keywords" rows={2} defaultValue={w.keywords.join(", ")} /></label>
      <label>빼는 말<input name="exclude" defaultValue={w.exclude.join(", ")} /></label>
      <div className="g">
        <div className="kinds">구분 {KINDS.slice(0, 3).map((k) => <label key={k} className="ck"><input type="checkbox" name="kinds" value={k} defaultChecked={w.kinds.includes(k)} />{k}</label>)}</div>
        <label>추정가격 최소(원)<input name="minPrice" defaultValue={n2s(w.minPrice)} inputMode="numeric" /></label>
        <label>추정가격 최대(원)<input name="maxPrice" defaultValue={n2s(w.maxPrice)} inputMode="numeric" /></label>
        <label>참가 지역 (비우면 상관없음)<input name="regions" defaultValue={w.regions.join(", ")} placeholder="예: 충청남도, 전국" /></label>
        <label>기관 (비우면 상관없음)<input name="orgs" defaultValue={w.orgs.join(", ")} placeholder="예: 한국전력, 수자원" /></label>
      </div>
      <Msg r={res} />
      <div className="fd-btns"><button className="fd-btn pri" disabled={saving}>{saving ? "저장하는 중…" : "조건 저장"}</button></div>
    </form>
  );
}

export function FetchButton({ ready }: { ready: boolean }) {
  const [res, act, busy] = useActionState(fetchNow, null);
  return (
    <form action={act} className="u-fetch">
      <button className="fd-btn pri" disabled={busy || !ready}>{busy ? "불러오는 중… (1~2분)" : "🔄 나라장터에서 지금 불러오기"}</button>
      <Msg r={res} />
    </form>
  );
}
