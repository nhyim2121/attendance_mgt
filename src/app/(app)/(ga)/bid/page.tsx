/** 입찰관리 대시보드: 사이트 바로가기 · 받은 공고(자동 수집·조건) · 다가오는 마감 · 진행 단계(칸반) · 알림 조건 · 직접 등록 · 우리 회사 입찰 이력.
 *  공고 한 건의 정리본·일정·업무 절차·투찰 계산·결과는 /bid/item. */
import Link from "next/link";
import { type KpiProps, Kpis, Win } from "@/components/대시/parts";
import { requireBidPage } from "@/lib/auth";
import { BID_SITES, type Bid, dateLabel, DATE_KEYS, daysLeft, dLabel, DONE_STAGES, fitScore, FLOW, nextDeadline, siteOf, summaryOf, won } from "@/lib/총무/bid";
import { loadBids, loadFetchLog, loadWatch } from "@/lib/총무/bidStore";
import { fullKst, todayKst } from "@/lib/time";
import { BidForm, FetchButton, QuickStage, WatchForm } from "./forms";

export const metadata = { title: "입찰관리 · 통합관리시스템" };
const OWNERS = ["김도아", "윤정아"];
const API_TXT = { ready: "자동 연동", later: "연동 예정", none: "바로가기" } as const;

const Stars = ({ n }: { n: number }) => <span className="u-stars" title={`적합도 ${n}/5`}>{"★".repeat(n)}<i>{"★".repeat(5 - n)}</i></span>;
const href = (b: Bid) => `/bid/item?id=${b.id}`;

export default async function Page() {
  await requireBidPage();
  const today = todayKst();
  const [bids, watch, log] = await Promise.all([loadBids(), loadWatch(), loadFetchLog()]);
  const hasKey = !!process.env.DATA_GO_KR_KEY;
  const inbox = bids.filter((b) => b.stage === "새 공고").sort((a, b) => fitScore(b, today) - fitScore(a, today));
  const active = bids.filter((b) => b.stage !== "새 공고" && !DONE_STAGES.includes(b.stage));
  const year = today.slice(0, 4);
  const tried = bids.filter((b) => ["투찰 완료", "개찰", "낙찰", "계약", "탈락", "유찰"].includes(b.stage) && (b.bidAt || b.dates.bidClose || "").startsWith(year));
  const won_ = tried.filter((b) => ["낙찰", "계약"].includes(b.stage));
  const closeWeek = [...inbox, ...active].filter((b) => { const l = daysLeft(b.dates.bidClose, today); return l !== null && l >= 0 && l <= 7; });

  // 다가오는 마감 (30일 안, 진행 중·새 공고)
  const deadlines = [...active, ...inbox].flatMap((b) => DATE_KEYS.filter(([k]) => !["posted", "preSpec", "bidOpen", "result"].includes(k)).flatMap(([k]) => {
    const at = b.dates[k], left = daysLeft(at, today);
    return at && left !== null && left >= 0 && left <= 30 ? [{ b, k, at, left }] : [];
  })).sort((x, y) => x.at.localeCompare(y.at)).slice(0, 12);
  const urgent = deadlines[0];

  const kpis: KpiProps[] = [
    { label: "받은 공고 (검토 전)", n: inbox.length, unit: "건", sub: hasKey ? (log ? `마지막 불러오기 ${fullKst(log.at).slice(5, 16)}` : "아직 불러오지 않음") : "직접 등록 · 자동 연동 준비 중", icon: "mail", color: "#0c3994", warn: inbox.length > 0, href: "#inbox" },
    { label: "7일 안 투찰 마감", n: closeWeek.length, unit: "건", sub: closeWeek[0] ? `${closeWeek[0].name.slice(0, 16)} ${dLabel(daysLeft(closeWeek[0].dates.bidClose, today))}` : "없음", icon: "alert", color: "#e84340", warn: closeWeek.length > 0, href: "#due" },
    { label: "진행 중", n: active.length, unit: "건", sub: FLOW.map((s) => `${s} ${active.filter((b) => b.stage === s).length}`).slice(0, 3).join(" · "), icon: "list", color: "#0e7490", href: "#flow" },
    { label: `${year}년 낙찰률`, n: tried.length ? Math.round((won_.length / tried.length) * 100) : 0, unit: "%", sub: `투찰 ${tried.length}건 · 낙찰 ${won_.length}건`, icon: "medal", color: "#b45309", href: "#history" },
  ];

  return (
    <div className="ud">
      <header className="u-hello ar" style={{ ["--c" as string]: "#0e7490" }}>
        <span className="u-date"><Link href="/ga">총무</Link> › 10. 입찰관리</span>
        <h1>입찰관리 <mark>대시보드</mark></h1>
        <p>공고 찾기 → 검토 → 참여 결정 → 서류 준비 → 투찰 → 개찰 → 계약까지 한 화면에서. 윤정아 차장님과 함께 씁니다.</p>
        <span className="u-cover" aria-hidden>⚖️</span>
        {urgent
          ? <Link className="u-note" href={href(urgent.b)}><b>가장 급한 마감</b>{urgent.b.name}<small>{dateLabel(urgent.k)} {urgent.at} · {dLabel(urgent.left)}</small></Link>
          : <div className="u-note"><b>오늘의 한 줄</b>30일 안에 다가오는 마감이 없습니다.</div>}
      </header>
      <Kpis items={kpis} />
      <div className="u-grid">
        <Win en="BID SITES" ko="입찰 사이트 바로가기 · 투찰은 각 사이트에서" className="s12">
          <div className="u-sites">
            {BID_SITES.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" title={s.name}>
                <b>{s.short} <em className={s.api}>{API_TXT[s.api]}</em></b><small>{s.name}</small>
              </a>
            ))}
          </div>
        </Win>

        <Win en="INBOX" ko="받은 공고 · 적합도 순" className="s7" more={["직접 등록", "#new"]}>
          <span id="inbox" />
          {inbox.length ? (
            <ul className="u-inbox">{inbox.slice(0, 12).map((b) => {
              const s = summaryOf(b, today);
              return (
                <li key={b.id}>
                  <Link href={href(b)} className="t"><Stars n={fitScore(b, today)} /> <b>{b.name}</b><small>{s.line}</small>
                    {b.matched.length > 0 && <span className="kw">{b.matched.map((k) => <i key={k}>{k}</i>)}</span>}</Link>
                  <span className="act"><QuickStage id={b.id} label="검토하기" stage="검토 중" /><QuickStage id={b.id} label="불참" stage="불참" /></span>
                </li>
              );
            })}</ul>
          ) : <p className="fd-empty">검토할 새 공고가 없습니다. {hasKey ? "조건에 맞는 공고가 올라오면 여기에 쌓입니다." : "자동 연동 전에는 아래 '공고 직접 등록'으로 넣어 주세요."}</p>}
        </Win>

        <Win en="DEADLINES" ko="다가오는 마감 · 30일" className="s5">
          <span id="due" />
          {deadlines.length ? (
            <ul className="u-ev">{deadlines.map(({ b, k, at, left }, i) => (
              <li key={i}><Link href={href(b)}>
                <span className="dt">{+at.slice(5, 7)}/{+at.slice(8, 10)}</span>
                <span className="tt"><b>{b.name}</b><small>{at.slice(11) || "시각 없음"} · {b.demand || b.org}</small></span>
                <span className={`ar dk ${k}`}>{dateLabel(k).split(" (")[0]}</span>
                <span className={`dd${left <= 3 ? " hot" : ""}`}>{dLabel(left)}</span>
              </Link></li>
            ))}</ul>
          ) : <p className="fd-empty">30일 안에 다가오는 마감이 없습니다.</p>}
        </Win>

        <Win en="PIPELINE" ko="진행 단계 · 카드를 누르면 정리본·업무 절차" className="s12">
          <span id="flow" />
          <div className="u-kanban">
            {FLOW.map((st) => {
              const list = bids.filter((b) => b.stage === st);
              return (
                <div key={st}>
                  <h5>{st} <em>{list.length}</em></h5>
                  {list.map((b) => {
                    const nd = nextDeadline(b, today), prog = b.checklist.length ? `${b.checklist.filter((c) => c.done).length}/${b.checklist.length}` : "";
                    return (
                      <Link key={b.id} href={href(b)} className="card">
                        <b>{b.name}</b>
                        <small>{b.demand || b.org || siteOf(b.src)?.short || "직접 등록"}{b.owner ? ` · ${b.owner}` : ""}</small>
                        <span>{nd ? <i className={nd.left <= 3 ? "hot" : ""}>{nd.label.split(" (")[0]} {dLabel(nd.left)}</i> : null}{prog && <i>절차 {prog}</i>}</span>
                      </Link>
                    );
                  })}
                  {!list.length && <p className="none">없음</p>}
                </div>
              );
            })}
          </div>
        </Win>

        <Win en="AUTO" ko="공고 자동 불러오기" className="s6">
          <ul className="u-soon">
            <li>{hasKey ? "✅" : "⬜"} 공공데이터포털 인증키 {hasKey ? "연결됨" : "필요 — 아래 순서대로 받아 주세요"}</li>
            <li>{log ? (log.ok ? "✅" : "⚠️") : "⬜"} 마지막 불러오기: {log ? `${fullKst(log.at)} · ${log.message}` : "아직 없음"}</li>
          </ul>
          {!hasKey && (
            <ol className="u-steps">
              <li><a href="https://www.data.go.kr" target="_blank" rel="noopener noreferrer">data.go.kr</a> 회원가입 (회사 공용 계정 권장)</li>
              <li>「조달청_나라장터 입찰공고정보서비스」 활용신청 (보통 바로 승인)</li>
              <li>같은 방법으로 한국전력공사_전자입찰계약정보 · 한국수자원공사_전자조달 입찰공고 · LH 입찰공고정보도 신청</li>
              <li>마이페이지 → 인증키의 <b>일반 인증키(Decoding)</b>를 복사해서 알려 주시면 서버에 넣고 연결합니다</li>
            </ol>
          )}
          <FetchButton ready={hasKey} />
          <p className="fd-empty">나라장터는 한 번에 최근 7일 공고를 조건(키워드·구분·금액·지역·기관)으로 찾아 '받은 공고'에 넣고, 이미 있는 공고는 일정만 새로 고칩니다. 한수원·도로공사·국방(D2B)은 공개 API가 없어 바로가기와 직접 등록으로 관리합니다.</p>
        </Win>

        <Win en="FILTER" ko="알림 조건 · (주)에쓰엔 전동기·발전기 기준" className="s6"><WatchForm w={watch} /></Win>

        <Win en="NEW" ko="공고 직접 등록 · 사이트에서 본 공고 옮겨 적기" className="s12">
          <span id="new" />
          <details className="u-fold"><summary>＋ 공고 등록 칸 열기</summary><BidForm owners={OWNERS} /></details>
        </Win>

        <Win en="HISTORY" ko="(주)에쓰엔 입찰 이력 · 투찰한 공고" className="s12">
          <span id="history" />
          <HistoryTable bids={bids} />
          <p className="fd-empty">나라장터 개찰결과(우리 순위·투찰률)를 자동으로 붙이려면 회사 사업자등록번호와 「나라장터 낙찰정보서비스」 활용신청이 더 필요합니다. 지금은 결과를 공고마다 직접 적습니다.</p>
        </Win>
      </div>
    </div>
  );
}

function HistoryTable({ bids }: { bids: Bid[] }) {
  const rows = bids.filter((b) => ["투찰 완료", "개찰", "낙찰", "계약", "탈락", "유찰"].includes(b.stage) || b.bidAmount !== null)
    .sort((a, b) => (b.bidAt || b.dates.bidClose || "").localeCompare(a.bidAt || a.dates.bidClose || ""));
  if (!rows.length) return <p className="fd-empty">아직 투찰한 공고가 없습니다. 공고마다 '투찰·개찰 결과'를 적으면 여기에 쌓입니다.</p>;
  return (
    <table className="fd-nt u-nt u-hist"><tbody>
      <tr className="h"><td>투찰일</td><td>공고명</td><td>발주</td><td>추정가격</td><td>투찰금액</td><td>투찰률</td><td>순위</td><td>결과</td></tr>
      {rows.map((b) => (
        <tr key={b.id}>
          <td><Link href={href(b)}>{(b.bidAt || b.dates.bidClose || "").slice(0, 10) || "-"}</Link></td>
          <td><Link href={href(b)}><b>{b.name}</b></Link></td>
          <td><Link href={href(b)}>{b.demand || b.org || "-"}</Link></td>
          <td><Link href={href(b)}>{won(b.price)}</Link></td>
          <td><Link href={href(b)}>{b.bidAmount !== null ? `${b.bidAmount.toLocaleString("ko-KR")}원` : "-"}</Link></td>
          <td><Link href={href(b)}>{b.rate !== null ? `${b.rate}%` : "-"}</Link></td>
          <td><Link href={href(b)}>{b.rank || "-"}</Link></td>
          <td><Link href={href(b)}><span className={`fd-tag ${b.stage === "낙찰" || b.stage === "계약" ? "g" : b.stage === "탈락" || b.stage === "유찰" ? "r" : "b"}`}>{b.stage}</span></Link></td>
        </tr>
      ))}
    </tbody></table>
  );
}
