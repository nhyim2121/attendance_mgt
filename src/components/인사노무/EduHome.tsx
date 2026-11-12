/** 교육훈련 홈 (/hr/g/edu, 관리자): 무재해 감면 · 법정의무교육 현황 · 연간 교육 달력 · 부서별 정기교육 시간 · 확인할 일 · 기준 설정 */
import Link from "next/link";
import { saveTrainOpts } from "@/app/(app)/(hr)/hr/training/actions";
import PageHead from "@/components/대시/PageHead";
import SiteLinks from "@/components/대시/SiteLinks";
import { Ico, Stat } from "@/components/인사노무/HomeKit";
import PrintButton from "@/components/PrintButton";
import { HR_SITES } from "@/lib/인사노무/sites";
import { DEFAULT_OPTS, LEGAL, SUPERVISOR_RE, trainingView } from "@/lib/인사노무/training";

const md = (d?: string | null) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "-");
const won = (n: number) => (n >= 10000 ? `${Math.round(n / 10000).toLocaleString()}만` : n.toLocaleString());

export default async function EduHome() {
  const v = await trainingView();
  const { year, today, opts, noAccident: na } = v;
  const legalDone = v.legal.filter((s) => s.state === "ok").length;
  const legalAll = v.legal.filter((s) => s.state !== "na").length;
  const half = today.slice(5) <= "06-30" ? "상반기" : "하반기";
  const dh = v.deptHours.reduce((a, d) => ({ got: a.got + d.got, need: a.need + d.need }), { got: 0, need: 0 });
  const fill = dh.need ? Math.round((dh.got / dh.need) * 100) : 0;
  const sups = v.staff.filter((e) => (opts.supervisors.length ? opts.supervisors.includes(e.name) : SUPERVISOR_RE.test(e.position || ""))).map((e) => e.name);
  const curM = +today.slice(5, 7);

  return (
    <div className="home">
      <PageHead href="/hr/g/edu" title="교육훈련 홈" mark={`${year}년`} emoji="🎓"
        desc="법정의무교육 기한, 연간 계획 대비 실시, 직원별 이수 현황을 한 화면에서">
        <Link className="pill" href="/hr/training/record">+ 교육 실시 기록</Link>
        <Link className="pill" href="/hr/training/matrix">직원별 이수 현황표</Link>
        <Link className="pill" href="/hr/training/status">수강현황</Link>
        <Link className="pill" href="/hr/training/plan">계획·실적표</Link>
        <Link className="pill" href="/hr/training/card">교육이력카드</Link>
        <PrintButton className="pill print" label="인쇄" />
      </PageHead>

      <section className={`card tr-na ${na.on ? "on" : ""}`}>
        <div className="tr-na-ico" aria-hidden="true">{na.on ? "−50%" : "100%"}</div>
        <div>
          <b>{na.on ? `무재해 사업장 — 올해 근로자 정기교육 시간 50% 감면 적용` : "근로자 정기교육 시간 100% 적용"}</b>
          <p>
            {na.auto
              ? <>산재 처리 대장에 {na.prevYear}년 재해 기록 <b>{na.injuries}건</b> → {na.on ? "전년도 무재해로 자동 적용" : "전년도에 재해가 있어 감면 없음"}.</>
              : <>기준 설정에서 직접 {na.on ? "감면 적용" : "감면 안 함"}으로 정했습니다.</>}
            {" "}반기 정기교육: 사무직 {na.on ? "3시간 (원래 6)" : "6시간"} · 그 밖의 근로자 {na.on ? "6시간 (원래 12)" : "12시간"}.
          </p>
          <small>근거: 산업안전보건법 제29조① · 시행규칙 제27조①(전년도 산업재해 미발생 사업장은 그다음 연도 근로자 정기교육 시간의 100분의 50 범위에서 면제) · 별표 4.
            관리감독자 교육(연 16시간)·채용 시 교육·특별교육은 감면 대상이 아닙니다. 근로기준법에는 교육시간 감면 규정이 없습니다.</small>
        </div>
      </section>

      <section className="card hstats">
        <Stat icon="clip" label="법정의무교육" value={`${legalDone}/${legalAll}`} unit="완료" sub={legalAll - legalDone ? `남은 ${legalAll - legalDone}개 · 연말 D-${v.legal[0].left}` : "모두 완료"} />
        <Stat icon="week" label={`${half} 정기교육`} value={fill} unit="%" sub={`1인 평균 ${+(dh.got / Math.max(1, v.deptHours.length)).toFixed(1)}h${na.on ? " · 50% 감면" : ""}`} />
        <Stat icon="flow" label="계획 대비 실시" value={`${v.planDone}/${v.planTotal}`} unit="건" sub={v.planLate ? `지연·연기 ${v.planLate}건` : "지연 없음"} />
        <Stat icon="chart" label="교육비 / 예산" value={won(v.cost)} unit={`/ ${won(v.budget)}원`} sub={v.refundTodo ? `환급 신청 예정 ${v.refundTodo}건` : `기록 ${v.rows.length}건`} />
        <Stat icon="alert" label="확인할 일" value={v.todos.length} unit="건" sub={v.todos[0]?.kind ?? "없음"} />
        <Stat icon="people" label="교육 대상" value={v.staff.length} unit="명" sub={`관리감독자 ${sups.length}명`} />
      </section>

      <section className="card home-row">
        <div className="card-title"><Ico name="clip" />법정의무교육 현황 <span className="muted" style={{ fontWeight: 400 }}>{year}년 · 교육 실시 대장의 참석자로 자동 계산</span>
          <span className="spacer" /><Link className="btn sm" href="/hr/training/matrix">직원별로 보기</Link></div>
        <div className="tbl-wrap">
          <table className="tbl tr-legal">
            <thead><tr><th>교육명</th><th>근거·주기</th><th>대상</th><th>최근 실시</th><th>이수</th><th>기한</th><th>상태</th><th /></tr></thead>
            <tbody>{v.legal.map((s) => (
              <tr key={s.def.key}>
                <td><b>{s.def.name}</b></td>
                <td className="muted" style={{ fontSize: ".8rem" }}>{s.def.law}{s.def.reducible && na.on ? " → 50% 감면" : ""}</td>
                <td>{s.def.target ? `관리감독자 ${s.need}명` : `${s.need}명`}</td>
                <td>{md(s.last)}</td>
                <td><div className="tr-mini"><span style={{ width: `${s.need ? (s.done / s.need) * 100 : 0}%` }} /></div>{s.done}/{s.need}명</td>
                <td>{md(s.due)}</td>
                <td><span className={`tr-st ${s.state}${s.state !== "ok" && s.left < 0 ? " late" : ""}`}>{s.label}</span></td>
                <td style={{ textAlign: "right" }}>{s.state !== "ok" && s.state !== "na" && <Link className="btn sm" href={`/hr/training/record?t=${s.def.key}`}>실시 기록</Link>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card home-row">
        <div className="card-title"><Ico name="cal" />연간 교육 달력 <span className="muted" style={{ fontWeight: 400 }}>연간 계획 + 실시 기록</span>
          <span className="spacer" /><span className="tr-lg done">● 실시</span><span className="tr-lg plan">○ 계획</span><span className="tr-lg late">◇ 연기·취소</span></div>
        <div className="tr-cal">
          {v.months.map((m) => (
            <div key={m.m} className={`tr-mon${m.m === curM ? " now" : ""}`}>
              <b>{m.m}월</b>
              {m.items.map((it, i) => <Link key={i} href={it.href} className={`tr-it ${it.st}`}>{it.st === "done" ? "●" : it.st === "plan" ? "○" : "◇"} {it.text}</Link>)}
              {!m.items.length && <span className="muted" style={{ fontSize: ".75rem" }}>-</span>}
            </div>
          ))}
        </div>
      </section>

      <div className="grid2 home-row">
        <section className="card">
          <div className="card-title"><Ico name="bars" />부서별 {half} 정기교육 <span className="muted" style={{ fontWeight: 400 }}>1인 평균 · 법정 시간 대비</span></div>
          {v.deptHours.length ? (
            <div className="sbars">
              {v.deptHours.map((d) => (
                <div key={d.dept} className="sbar">
                  <span className="sbar-l">{d.dept}</span>
                  <div className="sbar-track st"><span className="sbar-fill" style={{ width: `${d.need ? Math.min(100, (d.got / d.need) * 100) : 0}%`, backgroundColor: d.got >= d.need ? "#1f8a5b" : "#d9730d" }} /></div>
                  <span className="sbar-v">{d.got}/{d.need}h</span>
                </div>
              ))}
            </div>
          ) : <p className="muted">교육 대상 직원이 없습니다.</p>}
          <p className="muted" style={{ fontSize: ".78rem", margin: "8px 0 0" }}>사무직 부서: {opts.officeDepts.join(", ") || "없음"} (반기 {na.on ? 3 : 6}시간) · 그 밖 반기 {na.on ? 6 : 12}시간</p>
        </section>
        <section className="card">
          <div className="card-title"><Ico name="alert" />확인할 일 <span className="muted" style={{ fontWeight: 400 }}>{v.todos.length}건</span></div>
          {v.todos.length ? v.todos.slice(0, 10).map((t, i) => (
            <Link key={i} href={t.href} className="tr-todo">
              <span className={`tr-tag ${t.tone}`}>{t.kind}</span>
              <span><b>{t.title}</b><small>{t.sub}</small></span>
            </Link>
          )) : <p className="muted">확인할 일이 없습니다.</p>}
        </section>
      </div>

      <div className="grid2 home-row">
        <section className="card">
          <div className="card-title"><Ico name="org" />교육 기준 설정</div>
          <form action={saveTrainOpts} className="tr-opts">
            <label>무재해 감면 (근로자 정기교육 50%)
              <select name="noAccident" defaultValue={opts.noAccident}>
                <option value="auto">자동 — 산재 처리 대장에 전년도 기록이 없으면 적용</option>
                <option value="yes">적용 (전년도 무재해)</option>
                <option value="no">적용 안 함</option>
              </select>
            </label>
            <label>사무직 부서 (반기 6시간, 쉼표로)
              <input name="officeDepts" defaultValue={opts.officeDepts.join(", ")} placeholder={DEFAULT_OPTS.officeDepts.join(", ")} />
            </label>
            <label>관리감독자 (연 16시간, 비우면 직책에 팀장·반장·공장장 등)
              <input name="supervisors" defaultValue={opts.supervisors.join(", ")} placeholder={sups.join(", ") || "이름을 쉼표로"} />
            </label>
            <label>교육 대상에서 뺄 사람 (대표이사, 장기 휴직 등)
              <input name="exclude" defaultValue={opts.exclude.join(", ")} placeholder="이름을 쉼표로" />
            </label>
            <div><button className="btn primary sm">저장</button></div>
          </form>
        </section>
        <section className="card">
          <div className="card-title"><Ico name="clip" />관련 사이트</div>
          {(HR_SITES.edu ?? []).length ? <SiteLinks sites={HR_SITES.edu} big /> : <p className="muted">등록한 사이트가 없습니다.</p>}
          <p className="muted" style={{ fontSize: ".78rem", marginTop: 10 }}>법정교육 판정은 교육명에 들어간 말로 합니다: {LEGAL.map((d) => d.name.replace(/ \(.*\)/, "")).filter((x, i, a) => a.indexOf(x) === i).join(" · ")}. 안전보건 정기교육은 &apos;안전보건&apos;·&apos;산업안전&apos;·&apos;정기교육&apos;이 들어간 교육(관리감독자·채용 시·특별교육 제외)의 시간을 반기별로 더합니다.</p>
        </section>
      </div>
    </div>
  );
}
