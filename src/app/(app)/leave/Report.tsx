/** 휴가 관리의 '신청서 증빙'·'현황 보고서' 탭. 둘 다 인쇄(A4 세로)·PDF 저장을 염두에 둔 문서 형태로 그린다. */
import Link from "next/link";
import { hrefWith } from "@/components/Filters";
import FileLink from "@/components/FileLink";
import type { SearchParams } from "@/lib/data";
import type { Employee } from "@/lib/employees";
import { attachmentsFor, type Trip } from "@/lib/evidence";
import type { Attachment } from "@/lib/store";
import { type DateStr, dayLabel } from "@/lib/time";
import type { LeaveBalance } from "@/lib/vacation";
import { leaveFg } from "@/lib/leaveColors";
import { AttachInline, DeleteEvidence } from "../evidence/forms";

// 일수는 반올림하지 않고 그대로 (0.0625처럼 반반차·외출 단위까지). 소수 계산 오차만 넷째 자리에서 정리.
const n2 = (x: number) => String(Math.round(x * 10000) / 10000);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const pct1 = (a: number, b: number) => (b ? (Math.round((a / b) * 1000) / 10).toFixed(1) : "0.0");
const isImage = (a: Attachment) => /^image\//.test(a.mime);
const period = (a: DateStr, b: DateStr) => (a === b ? dayLabel(a) : `${dayLabel(a)} ~ ${dayLabel(b)}`);

/** 문서 머리: 로고 · 제목 · 결재란 */
export function DocHead({ title, sub, sign = true }: { title: string; sub: React.ReactNode; sign?: boolean }) {
  return (
    <div className="doc-head">
      <img src="/logo.png" alt="주식회사 에쓰엔" className="doc-logo" />
      <div className="doc-title"><h2>{title}</h2><div className="doc-sub">{sub}</div></div>
      {sign ? (
        <table className="doc-sign"><tbody>
          <tr><th rowSpan={2}>결<br />재</th><td>담당</td><td>검토</td><td>승인</td></tr>
          <tr><td /><td /><td /></tr>
        </tbody></table>
      ) : <span />}
    </div>
  );
}

/** 이미지 신청서를 문서 뒤에 붙인다 (인쇄용). PDF 등은 이름만 적는다. */
function Appendix({ files, label }: { files: Attachment[]; label: (a: Attachment) => string }) {
  if (!files.length) return null;
  const imgs = files.filter(isImage), others = files.filter((a) => !isImage(a));
  return (
    <div className="doc-appendix">
      {imgs.map((a) => (
        <figure key={a.id} className="doc-fig">
          <figcaption>첨부 · {label(a)} · {a.fileName}</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/attachment/${a.id}`} alt={a.fileName} />
        </figure>
      ))}
      {others.length > 0 && (
        <p className="caption">이미지가 아닌 첨부(PDF 등)는 파일을 열어 따로 인쇄해 주세요: {others.map((a) => `${label(a)} ${a.fileName}`).join(", ")}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 신청서 증빙
export function EvidenceTab({ sp, rows, emps, fyText, today }: {
  sp: SearchParams; rows: { t: Trip; files: Attachment[]; days: number }[]; emps: Employee[]; fyText: string; today: DateStr;
}) {
  const only = sp.missing === "1";
  const emp = String(sp.emp ?? "");
  const shown = only ? rows.filter((r) => !r.files.length) : rows;
  const done = rows.filter((r) => r.files.length).length;
  const deptOf = new Map(emps.map((e) => [e.name, e.dept]));
  const allFiles = [...new Map(shown.flatMap((r) => r.files).map((a) => [a.id, a])).values()];
  return (
    <div className="doc-page">
      <div className="print-only">
        <DocHead title="휴가 신청서 증빙 목록" sub={<>{fyText}{emp && ` · ${emp}`} · 출력일 {today}</>} />
      </div>
      <div className="metrics">
        <div className="metric"><div className="l">휴가 건수</div><div className="v">{rows.length}건</div></div>
        <div className="metric"><div className="l">신청서 첨부</div><div className="v">{done}건</div></div>
        <div className="metric"><div className="l">신청서 없음</div><div className={`v${rows.length - done ? " red" : ""}`}>{rows.length - done}건</div></div>
        <div className="metric"><div className="l">첨부율</div><div className="v">{pct(done, rows.length)}%</div></div>
      </div>
      <div className="card">
        <div className="row noprint" style={{ marginBottom: 10 }}>
          <Link className="btn sm" href={hrefWith(sp, "/leave/evidence", { missing: only ? null : "1" })} scroll={false}>
            {only ? "✓ 신청서 없는 것만" : "신청서 없는 것만 보기"}</Link>
          <span className="caption" style={{ margin: 0 }}>하이웍스 전자결재 휴가신청서를 PDF로 저장하거나 캡처 이미지로 올리세요. 이미지로 올리면 인쇄할 때 목록 뒤에 함께 찍힙니다.</span>
        </div>
        <div className="tbl-wrap"><table className="tbl doc-tbl">
          <thead><tr><th>기간</th><th>직원</th><th>부서</th><th>유형</th><th className="num">차감</th><th>사유</th><th>신청서</th><th className="noprint" /></tr></thead>
          <tbody>
            {shown.map(({ t, files, days }) => (
              <tr key={`${t.name}|${t.type}|${t.from}`} className={files.length ? "" : "nofile"}>
                <td>{period(t.from, t.to)}{t.days.length > 1 && <span className="muted"> ({t.days.length}일)</span>}</td>
                <td>{t.name}</td><td>{deptOf.get(t.name) ?? t.dept}</td>
                <td><span className={`tag t-${t.type}`}>{t.type}</span></td>
                <td className="num">{days ? `${n2(days)}일` : ""}</td>
                <td style={{ whiteSpace: "normal", minWidth: 160 }}>{t.title}{t.detail && <span className="muted"> {t.detail}</span>}</td>
                <td style={{ whiteSpace: "normal" }}>
                  {files.length ? files.map((a) => (
                    <div key={a.id} className="row" style={{ gap: 4 }}><FileLink a={a} /><span className="noprint"><DeleteEvidence id={a.id} /></span></div>
                  )) : <span className="red">없음</span>}
                </td>
                <td className="noprint"><AttachInline name={t.name} type={t.type} from={t.from} to={t.to} title={`${t.type} 신청서 ${t.title}`.trim()} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {!shown.length && <p className="muted">{only ? "신청서가 빠진 휴가가 없습니다." : "이 회계연도의 휴가가 없습니다."}</p>}
      </div>
      <Appendix files={allFiles} label={(a) => `${a.name} ${a.type} ${period(a.dayFrom, a.dayTo)}`} />
    </div>
  );
}

// ---------------------------------------------------------------- 연차 사용 촉진 (요약 보고서와 따로)
export function PromoteReport({ bal, fyText, range, asOf, today, min = 5 }: {
  bal: LeaveBalance[]; fyText: string; range: [DateStr, DateStr]; asOf: DateStr; today: DateStr; min?: number;
}) {
  const promote = bal.filter((b) => b.remain >= min).sort((a, b) => b.remain - a.remain);
  const remain = promote.reduce((t, b) => t + b.remain, 0);
  return (
    <div className="doc-page">
      <DocHead title="연차 사용 촉진 대상"
        sub={<>{fyText} ({range[0]} ~ {range[1]}) · 기준일 {asOf} · 작성일 {today}</>} />
      <div className="doc-kpis">
        {([["대상 인원", `${promote.length}명`], ["잔여 합계", `${n2(remain)}일`], ["기준", `잔여 ${min}일 이상`]] as const)
          .map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}
      </div>
      {promote.length ? (
        <table className="doc-tbl full"><thead><tr><th>부서</th><th>성명</th><th>직급</th><th>입사일</th><th className="num">총 부여</th>
          <th className="num">사용</th><th className="num">예정</th><th className="num">잔여</th><th style={{ width: "22%" }}>사용률</th></tr></thead>
          <tbody>{promote.map((b) => (
            <tr key={b.name}><td>{b.dept}</td><td><b>{b.name}</b></td><td>{b.rank}</td><td>{b.joinDate ?? "-"}</td>
              <td className="num">{n2(b.total)}</td><td className="num">{n2(b.used)}</td><td className="num">{b.planned ? n2(b.planned) : ""}</td>
              <td className="num"><b>{n2(b.remain)}</b></td><td><Meter v={pct(b.used, b.total)} /></td></tr>
          ))}</tbody></table>
      ) : <p className="muted">잔여 {min}일 이상인 직원이 없습니다.</p>}
      <p className="caption doc-foot">잔여 = 총 부여 − 사용 − 예정. 잔여가 많은 순. 근태관리통합시스템 · 주식회사 에쓰엔</p>
    </div>
  );
}

// ---------------------------------------------------------------- 현황 보고서
const TYPES = ["연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가"];

export function SummaryReport({ bal, asOf, deptOrder, trend = [] }: {
  bal: LeaveBalance[]; atts: Attachment[]; fyText: string; range: [DateStr, DateStr]; asOf: DateStr; today: DateStr;
  deptOrder: string[]; trend?: { label: string; asOf: string; total: number; used: number }[];
}) {
  const sum = (f: (b: LeaveBalance) => number, xs = bal) => xs.reduce((t, b) => t + f(b), 0);
  const total = sum((b) => b.total), used = sum((b) => b.used), planned = sum((b) => b.planned);
  const types = TYPES.filter((t) => bal.some((b) => b.counts[t]));
  const pos = (d: string) => (deptOrder.includes(d) ? deptOrder.indexOf(d) : deptOrder.length);
  const depts = [...new Set(bal.map((b) => b.dept))].sort((a, b) => pos(a) - pos(b) || (a < b ? -1 : a > b ? 1 : 0));
  const sorted = [...bal].sort((a, b) => ((a.joinDate ?? "9999") < (b.joinDate ?? "9999") ? -1 : (a.joinDate ?? "9999") > (b.joinDate ?? "9999") ? 1 : 0));
  return (
    <div className="doc-page">
      <DocHead title="연차·휴가 사용 현황 보고서" sub={<>기준일 {asOf}</>} />
      <div className="doc-kpis">
        {([["대상 인원", `${bal.length}명`], ["총 부여", `${n2(total)}일`], ["사용", `${n2(used)}일`], ["예정", `${n2(planned)}일`],
          ["잔여", `${n2(sum((b) => b.remain))}일`], ["평균 사용률", `${pct(used, total)}%`]] as const)
          .map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}
      </div>

      {/* 1·2는 나란히 (가로 인쇄 때 높이를 줄여 3. 직원별 현황을 크게) */}
      <div className={trend.length ? "doc-two" : undefined}>
      {trend.length > 0 && (
        <div>
          <h3 className="doc-h">1. 월별 연차 사용률 <span className="muted">(매달 말일 기준 누적)</span></h3>
          <table className="doc-tbl full"><tbody>
            <tr><th>월</th>{trend.map((t) => <th key={t.label} className="num">{t.label}</th>)}</tr>
            <tr><th>당해연차</th>{trend.map((t) => <td key={t.label} className="num">{n2(t.total)}</td>)}</tr>
            <tr><th>사용일수</th>{trend.map((t) => <td key={t.label} className="num">{n2(t.used)}</td>)}</tr>
            <tr><th>사용률</th>{trend.map((t) => <td key={t.label} className="num"><b>{pct1(t.used, t.total)}%</b></td>)}</tr>
          </tbody></table>
        </div>
      )}

      <div>
      <h3 className="doc-h">{trend.length ? 2 : 1}. 부서별 요약</h3>
      <table className="doc-tbl full"><thead><tr>
        <th>부서</th><th className="num">인원</th><th className="num">총 부여</th><th className="num">사용</th><th className="num">예정</th>
        <th className="num">잔여</th><th style={{ width: trend.length ? "24%" : "28%" }}>사용률</th>
      </tr></thead><tbody>
        {depts.map((d) => {
          const g = bal.filter((b) => b.dept === d), t = sum((b) => b.total, g), u = sum((b) => b.used, g);
          return (
            <tr key={d}><td>{d || "(부서 없음)"}</td><td className="num">{g.length}</td><td className="num">{n2(t)}</td>
              <td className="num">{n2(u)}</td><td className="num">{n2(sum((b) => b.planned, g))}</td>
              <td className="num">{n2(sum((b) => b.remain, g))}</td>
              <td><Meter v={pct(u, t)} /></td></tr>
          );
        })}
      </tbody></table>
      </div>
      </div>

      <h3 className="doc-h">{trend.length ? 3 : 2}. 직원별 현황</h3>
      <table className="doc-tbl full doc-staff"><thead><tr>
        <th>부서</th><th>성명</th><th>직급</th><th>입사일</th><th className="num" title="전년 초과사용·이월, 포상 등 연차 조정">이월·조정</th>
        <th className="num">총 부여</th><th className="num">사용</th>
        <th className="num">예정</th><th className="num">잔여</th><th style={{ width: "12%" }}>사용률</th>
        {types.map((t) => <th key={t} className="num">{t}(일)</th>)}
      </tr></thead><tbody>
        {sorted.map((b) => {
          return (
            <tr key={b.name}>
              <td>{b.dept}</td><td><b>{b.name}</b></td><td>{b.rank}</td><td>{b.joinDate ?? "-"}</td>
              <td className={`num${b.adjust < 0 ? " red" : ""}`}>{b.adjust ? n2(b.adjust) : ""}</td>
              <td className="num">{n2(b.total)}</td><td className="num">{n2(b.used)}</td><td className="num">{b.planned ? n2(b.planned) : ""}</td>
              <td className={`num${b.remain < 0 ? " red" : ""}`}><b>{n2(b.remain)}</b></td>
              <td><Meter v={pct(b.used, b.total)} /></td>
              {types.map((t) => <td key={t} className="num" title={t === "외출" && b.outingHours ? `${n2(b.outingHours)}시간` : undefined}>{b.counts[t] && b.typeDays[t] ? n2(b.typeDays[t]) : ""}</td>)}
            </tr>
          );
        })}
      </tbody></table>

    </div>
  );
}

function Meter({ v }: { v: number }) {
  return (
    <div className="doc-meter"><div className="bar"><div style={{ width: `${Math.min(100, v)}%`, background: v > 100 ? "var(--red)" : v >= 80 ? "var(--blue)" : v >= 40 ? "#5c7cc4" : "#e9a23b" }} /></div>
      <span style={v > 100 ? { color: "var(--red)", fontWeight: 700 } : undefined}>{v}%</span></div>
  );
}

/** 그래프에 쓰는 휴가 하루 무게: 차감 일수, 차감 없는 공가·경조휴가·병가는 1일 (외출은 차감할 때만) */
const weight = (it: LeaveBalance["items"][number]) => (it.days > 0 ? it.days : it.type === "외출" ? 0 : 1);

/** 직원 한 명의 휴가 사용 현황 (그래프 중심, 사람마다 새 쪽). all = 같은 기준의 전체 직원 (비중·순위용) */
export function PersonReport({ b, all, range, asOf }: {
  b: LeaveBalance; all: LeaveBalance[]; fyText: string; range: [DateStr, DateStr]; asOf: DateStr; today: DateStr;
}) {
  const items = b.items.filter((it) => TYPES.includes(it.type));
  const done = items.filter((it) => !it.planned);
  // 전체 직원 대비
  const allUsed = all.reduce((t, x) => t + x.used, 0);
  const share = allUsed ? (b.used / allUsed) * 100 : 0;
  const rank = [...all].sort((x, y) => y.used - x.used).findIndex((x) => x.name === b.name) + 1;
  const avgUsed = all.length ? allUsed / all.length : 0;
  const avgRate = all.length ? all.reduce((t, x) => t + (x.total ? x.used / x.total : 0), 0) / all.length * 100 : 0;
  const rate = b.total ? (b.used / b.total) * 100 : 0;
  // 유형별
  const byType = TYPES.map((t) => {
    const xs = items.filter((it) => it.type === t);
    return { t, n: xs.length, w: xs.reduce((s, it) => s + weight(it), 0) };
  }).filter((x) => x.n).sort((x, y) => y.w - x.w || y.n - x.n);
  const totalW = byType.reduce((s, x) => s + x.w, 0);
  const top = byType[0];
  // 월별 (회계연도 12달)
  const months = Array.from({ length: 12 }, (_, i) => {
    const y = +range[0].slice(0, 4), m0 = +range[0].slice(5, 7) - 1 + i;
    return `${y + Math.floor(m0 / 12)}-${String((m0 % 12) + 1).padStart(2, "0")}`;
  });
  const monthW = months.map((m) => TYPES.map((t) => items.filter((it) => it.day.startsWith(m) && it.type === t).reduce((s, it) => s + weight(it), 0)));
  const maxM = Math.max(1, ...monthW.map((xs) => xs.reduce((s, x) => s + x, 0)));
  const busiest = months[monthW.map((xs) => xs.reduce((s, x) => s + x, 0)).reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0)];
  const dayMap = new Map<string, (typeof items)[number][]>();
  for (const it of items) dayMap.set(it.day, [...(dayMap.get(it.day) ?? []), it]);

  return (
    <div className="doc-page person">
      <DocHead title="개인별 휴가 사용 현황" sub={<>기준일 {asOf}</>} sign={false} />
      <table className="doc-tbl full info"><tbody>
        <tr><th>부서</th><td>{b.dept}</td><th>성명</th><td><b>{b.name}</b></td><th>직급</th><td>{b.rank}</td></tr>
        <tr><th>입사일</th><td>{b.joinDate ?? "-"}</td><th>근속</th><td>{b.years !== null ? `${b.years}년` : "-"}</td>
          <th>사용 건수</th><td>{done.length}건{items.length > done.length ? ` (+ 예정 ${items.length - done.length}건)` : ""}</td></tr>
      </tbody></table>

      <div className="pr-top">
        <figure className="pr-card">
          <figcaption>내 연차 사용률</figcaption>
          <Donut v={rate} color="var(--blue)" label={`${pct1(b.used, b.total)}%`} sub={`${n2(b.used)} / ${n2(b.total)}일`} />
          <div className="pr-note">전체 평균 {avgRate.toFixed(1)}% · 잔여 <b>{n2(b.remain)}일</b>{b.planned ? ` · 예정 ${n2(b.planned)}일` : ""}</div>
        </figure>
        <figure className="pr-card">
          <figcaption>전체 직원 사용량 중 내 비중</figcaption>
          <Donut v={share} color="#e9a23b" label={`${share.toFixed(1)}%`} sub={`전체 ${n2(allUsed)}일 중 ${n2(b.used)}일`} />
          <div className="pr-note">{all.length}명 중 사용 <b>{rank}위</b> · 1인 평균 {n2(avgUsed)}일</div>
        </figure>
        <figure className="pr-card">
          <figcaption>가장 많이 쓴 휴가</figcaption>
          {top ? (
            <div className="pr-top1">
              <span className="pr-big" style={{ color: leaveFg(top.t) }}>{top.t}</span>
              <span>{n2(top.w)}일 · {top.n}건 · {totalW ? Math.round((top.w / totalW) * 100) : 0}%</span>
              <span className="muted">가장 많이 쓴 달: {+busiest.slice(5)}월</span>
            </div>
          ) : <p className="muted">사용한 휴가가 없습니다.</p>}
        </figure>
      </div>

      <h3 className="doc-h">유형별 사용 <span className="muted">(일수 · 비율)</span></h3>
      {byType.length ? (
        <div className="pr-hbars">{byType.map((x) => (
          <div key={x.t} className="pr-hbar">
            <span className="pr-hl">{x.t}</span>
            <div className="pr-track"><div style={{ width: `${totalW ? (x.w / totalW) * 100 : 0}%`, background: leaveFg(x.t) }} /></div>
            <span className="pr-hv"><b>{n2(x.w)}일</b> {x.n}건 · {totalW ? Math.round((x.w / totalW) * 100) : 0}%</span>
          </div>
        ))}</div>
      ) : <p className="muted">이 회계연도에 사용한 휴가가 없습니다.</p>}

      <h3 className="doc-h">월별 사용 <span className="muted">(일수)</span></h3>
      <svg className="pr-months" viewBox="0 0 720 170" role="img" aria-label="월별 휴가 사용 일수">
        {[0, 0.5, 1].map((f) => <line key={f} x1="30" x2="715" y1={140 - f * 120} y2={140 - f * 120} stroke="#e5e9f2" />)}
        <text x="24" y="24" fontSize="10" textAnchor="end" fill="#8a94a8">{n2(maxM)}</text>
        {months.map((m, i) => {
          let y = 140;
          const x = 38 + i * 56.5;
          return (
            <g key={m}>
              {TYPES.map((t, k) => {
                const v = monthW[i][k];
                if (!v) return null;
                const h = (v / maxM) * 120;
                y -= h;
                return <rect key={t} x={x} y={y} width="38" height={h} fill={leaveFg(t)} rx="2"><title>{`${+m.slice(5)}월 ${t} ${n2(v)}일`}</title></rect>;
              })}
              {(() => { const s = monthW[i].reduce((a, v) => a + v, 0); return s ? <text x={x + 19} y={y - 4} fontSize="11" textAnchor="middle" fontWeight="700" fill="#1d2b4f">{n2(s)}</text> : null; })()}
              <text x={x + 19} y="158" fontSize="11" textAnchor="middle" fill={m > asOf.slice(0, 7) ? "#b0b8c8" : "#4b5563"}>{+m.slice(5)}월</text>
            </g>
          );
        })}
      </svg>

      <h3 className="doc-h">사용한 날 <span className="muted">(칸 = 하루, 흐린 칸은 예정)</span></h3>
      <div className="pr-cal">
        {months.map((m) => {
          const n = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate();
          return (
            <div key={m} className="pr-cal-row">
              <span className="pr-cal-m">{+m.slice(5)}월</span>
              {Array.from({ length: 31 }, (_, i) => {
                const d = `${m}-${String(i + 1).padStart(2, "0")}`;
                const its = i < n ? dayMap.get(d) : undefined;
                const it = its?.[0];
                return (
                  <span key={i} className={`pr-cell${i >= n ? " off" : ""}${it?.planned ? " planned" : ""}`}
                    style={it ? { background: leaveFg(it.type) } : undefined}
                    title={its ? `${dayLabel(d)} ${its.map((x) => x.type).join("·")}${its[0].content ? ` · ${its[0].content.split("\n")[0]}` : ""}` : undefined}>
                    {it ? i + 1 : ""}
                  </span>
                );
              })}
            </div>
          );
        })}
        <div className="pr-legend">{byType.map((x) => <span key={x.t}><i style={{ background: leaveFg(x.t) }} />{x.t}</span>)}</div>
      </div>
    </div>
  );
}

/** 도넛 그래프 (0~100) */
function Donut({ v, color, label, sub }: { v: number; color: string; label: string; sub: string }) {
  const r = 42, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, v)) / 100;
  return (
    <div className="pr-donut">
      <svg viewBox="0 0 110 110" width="118" height="118">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#e8edf6" strokeWidth="14" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="14" strokeDasharray={`${c * f} ${c}`}
          transform="rotate(-90 55 55)" strokeLinecap={f > 0 && f < 1 ? "round" : "butt"} />
        <text x="55" y="60" textAnchor="middle" fontSize="18" fontWeight="800" fill="#1d2b4f">{label}</text>
      </svg>
      <span className="muted">{sub}</span>
    </div>
  );
}
