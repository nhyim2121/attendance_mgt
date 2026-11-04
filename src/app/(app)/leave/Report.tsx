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
import { AttachInline, DeleteEvidence } from "../evidence/forms";

const n2 = (x: number) => String(Math.round(x * 100) / 100);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const pct1 = (a: number, b: number) => (b ? (Math.round((a / b) * 1000) / 10).toFixed(1) : "0.0");
const isImage = (a: Attachment) => /^image\//.test(a.mime);
const period = (a: DateStr, b: DateStr) => (a === b ? dayLabel(a) : `${dayLabel(a)} ~ ${dayLabel(b)}`);
const SRC: Record<string, string> = { 사이트: "일일 근태 보고서", 휴가관리: "휴가 등록" };

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

// ---------------------------------------------------------------- 현황 보고서
const TYPES = ["연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가"];

export function SummaryReport({ bal, atts, fyText, range, asOf, today, deptOrder, trend = [] }: {
  bal: LeaveBalance[]; atts: Attachment[]; fyText: string; range: [DateStr, DateStr]; asOf: DateStr; today: DateStr;
  deptOrder: string[]; trend?: { label: string; asOf: string; total: number; used: number }[];
}) {
  const sum = (f: (b: LeaveBalance) => number, xs = bal) => xs.reduce((t, b) => t + f(b), 0);
  const total = sum((b) => b.total), used = sum((b) => b.used), planned = sum((b) => b.planned);
  const types = TYPES.filter((t) => bal.some((b) => b.counts[t]));
  const pos = (d: string) => (deptOrder.includes(d) ? deptOrder.indexOf(d) : deptOrder.length);
  const depts = [...new Set(bal.map((b) => b.dept))].sort((a, b) => pos(a) - pos(b) || (a < b ? -1 : a > b ? 1 : 0));
  const sorted = [...bal].sort((a, b) => ((a.joinDate ?? "9999") < (b.joinDate ?? "9999") ? -1 : (a.joinDate ?? "9999") > (b.joinDate ?? "9999") ? 1 : 0));
  const promote = [...bal].filter((b) => b.remain >= 5).sort((a, b) => b.remain - a.remain);
  return (
    <div className="doc-page">
      <DocHead title="연차·휴가 사용 현황 보고서"
        sub={<>{fyText} ({range[0]} ~ {range[1]}) · 기준일 {asOf} · 작성일 {today}</>} />
      <div className="doc-kpis">
        {([["대상 인원", `${bal.length}명`], ["총 부여", `${n2(total)}일`], ["사용", `${n2(used)}일`], ["예정", `${n2(planned)}일`],
          ["잔여", `${n2(total - used - planned)}일`], ["평균 사용률", `${pct(used, total)}%`]] as const)
          .map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}
      </div>

      {trend.length > 0 && (
        <>
          <h3 className="doc-h">1. 월별 연차 사용률 <span className="muted">(매달 말일 기준 누적)</span></h3>
          <table className="doc-tbl full"><tbody>
            <tr><th>월</th>{trend.map((t) => <th key={t.label} className="num">{t.label}</th>)}</tr>
            <tr><th>당해연차</th>{trend.map((t) => <td key={t.label} className="num">{n2(t.total)}</td>)}</tr>
            <tr><th>사용일수</th>{trend.map((t) => <td key={t.label} className="num">{n2(t.used)}</td>)}</tr>
            <tr><th>사용률</th>{trend.map((t) => <td key={t.label} className="num"><b>{pct1(t.used, t.total)}%</b></td>)}</tr>
          </tbody></table>
        </>
      )}

      <h3 className="doc-h">{trend.length ? 2 : 1}. 부서별 요약</h3>
      <table className="doc-tbl full"><thead><tr>
        <th>부서</th><th className="num">인원</th><th className="num">총 부여</th><th className="num">사용</th><th className="num">예정</th>
        <th className="num">잔여</th><th style={{ width: "28%" }}>사용률</th>
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

      <h3 className="doc-h">{trend.length ? 3 : 2}. 직원별 현황</h3>
      <table className="doc-tbl full"><thead><tr>
        <th>부서</th><th>성명</th><th>직급</th><th>입사일</th><th className="num" title="전년 초과사용·이월, 포상 등 연차 조정">이월·조정</th>
        <th className="num">총 부여</th><th className="num">사용</th>
        <th className="num">예정</th><th className="num">잔여</th><th style={{ width: "16%" }}>사용률</th>
        {types.map((t) => <th key={t} className="num">{t}</th>)}
      </tr></thead><tbody>
        {sorted.map((b) => {
          return (
            <tr key={b.name}>
              <td>{b.dept}</td><td><b>{b.name}</b></td><td>{b.rank}</td><td>{b.joinDate ?? "-"}</td>
              <td className={`num${b.adjust < 0 ? " red" : ""}`}>{b.adjust ? n2(b.adjust) : ""}</td>
              <td className="num">{n2(b.total)}</td><td className="num">{n2(b.used)}</td><td className="num">{b.planned ? n2(b.planned) : ""}</td>
              <td className={`num${b.remain < 0 ? " red" : ""}`}><b>{n2(b.remain)}</b></td>
              <td><Meter v={pct(b.used, b.total)} /></td>
              {types.map((t) => <td key={t} className="num">{b.counts[t] ?? ""}</td>)}
            </tr>
          );
        })}
      </tbody></table>

      <h3 className="doc-h">{trend.length ? 4 : 3}. 연차 사용 촉진 참고 <span className="muted">(잔여 5일 이상)</span></h3>
      {promote.length ? (
        <table className="doc-tbl full"><thead><tr><th>부서</th><th>성명</th><th className="num">총 부여</th><th className="num">사용</th>
          <th className="num">잔여</th><th className="num">사용률</th></tr></thead>
          <tbody>{promote.map((b) => (
            <tr key={b.name}><td>{b.dept}</td><td>{b.name} <span className="muted">{b.rank}</span></td><td className="num">{n2(b.total)}</td>
              <td className="num">{n2(b.used)}</td><td className="num"><b>{n2(b.remain)}</b></td><td className="num">{pct(b.used, b.total)}%</td></tr>
          ))}</tbody></table>
      ) : <p className="muted">해당 직원이 없습니다.</p>}
      <p className="caption doc-foot">연차·월차 1일, 반차 0.5일, 반반차 0.25일 차감. 입사 1년이 되기 전에 쓴 휴가는 월차, 그 뒤는 연차로 셉니다. 직원별 현황은 입사일 순.
        근태관리통합시스템 · 주식회사 에쓰엔</p>
    </div>
  );
}

function Meter({ v }: { v: number }) {
  return (
    <div className="doc-meter"><div className="bar"><div style={{ width: `${Math.min(100, v)}%`, background: v >= 80 ? "var(--blue)" : v >= 40 ? "#5c7cc4" : "var(--red)" }} /></div>
      <span>{v}%</span></div>
  );
}

/** 직원 한 명의 휴가 사용 내역서 (사람마다 새 쪽) */
export function PersonReport({ b, atts, fyText, range, asOf, today }: {
  b: LeaveBalance; atts: Attachment[]; fyText: string; range: [DateStr, DateStr]; asOf: DateStr; today: DateStr;
}) {
  const items = b.items.filter((it) => TYPES.includes(it.type));
  const mine = atts.filter((a) => a.name === b.name);
  const files = [...new Map(items.flatMap((it) => attachmentsFor(mine, b.name, it.day, it.day)).map((a) => [a.id, a])).values()];
  return (
    <div className="doc-page person">
      <DocHead title="개인별 휴가 사용 내역서" sub={<>{fyText} ({range[0]} ~ {range[1]}) · 기준일 {asOf}</>} />
      <table className="doc-tbl full info"><tbody>
        <tr><th>부서</th><td>{b.dept}</td><th>성명</th><td><b>{b.name}</b></td><th>직급</th><td>{b.rank}</td></tr>
        <tr><th>입사일</th><td>{b.joinDate ?? "-"}</td><th>근속</th><td>{b.years !== null ? `${b.years}년` : "-"}</td><th>출력일</th><td>{today}</td></tr>
      </tbody></table>
      <div className="doc-kpis">
        {([["연차", n2(b.annual)], ["월차", n2(b.monthly)], ["조정", n2(b.adjust)], ["총 부여", n2(b.total)], ["사용", n2(b.used)],
          ["예정", n2(b.planned)], ["잔여", n2(b.remain)]] as const).map(([l, v]) => <div key={l}><span>{l}</span><b>{v}일</b></div>)}
      </div>
      <h3 className="doc-h">사용 내역 <span className="muted">({items.length}건)</span></h3>
      <table className="doc-tbl full"><thead><tr><th className="num">No</th><th>일자</th><th>유형</th><th className="num">차감</th><th>사유·내용</th><th>출처</th></tr></thead>
        <tbody>{items.map((it, i) => {
          return (
            <tr key={i} className={it.planned ? "planned" : ""}>
              <td className="num">{i + 1}</td><td>{dayLabel(it.day)}{it.planned && <span className="muted"> (예정)</span>}</td>
              <td>{it.type}{it.applied && it.applied !== it.type && <span className="muted"> ({it.applied} 신청)</span>}</td><td className="num">{it.days ? n2(it.days) : ""}</td>
              <td style={{ whiteSpace: "normal" }}>{it.content.split("\n")[0]}</td>
              <td className="muted">{SRC[it.src] ?? "근태현황 파일"}</td>
            </tr>
          );
        })}</tbody></table>
      {!items.length && <p className="muted">이 회계연도에 사용한 휴가가 없습니다.</p>}
      <p className="doc-confirm">위 내용이 사실과 같음을 확인합니다. &nbsp; 본인 확인: <span className="doc-line" /> (서명)</p>
      <Appendix files={files} label={(a) => `${a.type} ${period(a.dayFrom, a.dayTo)}`} />
    </div>
  );
}
