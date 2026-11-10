/** 입찰 공고 한 건: 정리본 · 일정(D-day) · 업무 절차 · 투찰금액 계산 · 투찰·개찰 결과 · 메모 · 첨부 · 고치기 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Win } from "@/components/대시/parts";
import { AttachRow } from "@/components/대장/forms";
import { requireBidPage } from "@/lib/auth";
import { DATE_KEYS, daysLeft, dLabel, fitScore, nextDeadline, siteOf, summaryOf } from "@/lib/총무/bid";
import { loadBid } from "@/lib/총무/bidStore";
import { loadFiles } from "@/lib/총무/mail";
import { todayKst } from "@/lib/time";
import { BidForm, Calculator, Checklist, DeleteBid, MemoBox, ResultForm, StageBar } from "../forms";

export const metadata = { title: "입찰 공고 · 통합관리시스템" };

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireBidPage();
  const id = Number((await searchParams).id);
  const b = Number.isInteger(id) ? await loadBid(id) : null;
  if (!b) notFound();
  const today = todayKst();
  const files = (await loadFiles("lg:")).get(`lg:${b.id}`) ?? [];
  const s = summaryOf(b, today), nd = nextDeadline(b, today), site = siteOf(b.src), fit = fitScore(b, today);
  return (
    <div className="ud">
      <header className="u-hello ar" style={{ ["--c" as string]: "#0e7490" }}>
        <span className="u-date"><Link href="/bid">입찰관리</Link> › {site?.short ?? "직접 등록"}{b.ntceNo ? ` · ${b.ntceNo}${b.ntceOrd ? `-${b.ntceOrd}` : ""}` : ""}</span>
        <h1>{b.name}</h1>
        <p>{s.line || "일정·금액을 적으면 요약이 생깁니다."}</p>
        <div className="u-note"><b>지금 단계 · 적합도 {"★".repeat(fit)}{"☆".repeat(5 - fit)}</b>{b.stage}<small>{nd ? `${nd.label} ${nd.at} · ${dLabel(nd.left)}` : "남은 마감 없음"}</small></div>
      </header>
      <div className="u-bidbar">
        <StageBar id={b.id} stage={b.stage} />
        <span className="go">
          {b.url && <a className="fd-btn pri" href={b.url} target="_blank" rel="noopener noreferrer">📄 공고 원문 · 투찰하러 가기</a>}
          {site && <a className="fd-btn" href={site.url} target="_blank" rel="noopener noreferrer">🌐 {site.short}</a>}
        </span>
      </div>
      <div className="u-grid">
        <Win en="SUMMARY" ko="정리본" tape="y" className="s7 u-memo">
          <ul className="u-points">{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
          {b.files.length > 0 && <><div className="lg">공고 첨부 (사이트)</div><ul className="u-files">{b.files.map((f) => <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer">📄 {f.name || "첨부 파일"}</a></li>)}</ul></>}
        </Win>
        <Win en="TIMELINE" ko="일정 · D-day" className="s5">
          <ul className="u-tl">{DATE_KEYS.map(([k, label]) => {
            const at = b.dates[k], left = daysLeft(at, today);
            return (
              <li key={k} className={`${at ? "" : "empty"} ${left !== null && left < 0 ? "past" : ""} ${nd?.key === k ? "next" : ""}`}>
                <span className="l">{label}</span><span className="at">{at ?? "-"}</span><span className="d">{at ? dLabel(left) : ""}</span>
              </li>
            );
          })}</ul>
        </Win>
        <Win en="PROCESS" ko="업무 절차 · 공고 확인부터 계약까지" className="s6"><Checklist id={b.id} items={b.checklist} stage={b.stage} /></Win>
        <Win en="CALC" ko="투찰금액 계산 (참고용)" className="s6"><Calculator base={b.base} /></Win>
        <Win en="RESULT" ko="투찰·개찰 결과" className="s6"><ResultForm bid={b} /></Win>
        <Win en="MEMO" ko="검토 메모 · 함께 보기" tape="b" className="s6"><MemoBox id={b.id} memo={b.memo} /></Win>
        <Win en="FILES" ko="우리 서류 · 투찰 확인증·제출 서류" className="s12">
          <div className="u-filesrow">
            {files.map((f) => <a key={f.id} className="file" href={`/api/ga/file/${f.id}`} target="_blank" rel="noreferrer">📎 {f.fileName}</a>)}
            {!files.length && <span className="fd-empty">아직 첨부가 없습니다.</span>}
            <AttachRow id={b.id} />
          </div>
        </Win>
        <Win en="EDIT" ko="공고 정보·일정 고치기" className="s12">
          <details className="u-fold"><summary>✏️ 고치기 칸 열기</summary><BidForm bid={b} owners={["김도아", "윤정아"]} /></details>
          <div className="fd-btns" style={{ marginTop: 10 }}><DeleteBid id={b.id} /></div>
        </Win>
      </div>
    </div>
  );
}
