/** 개인별 교육이력카드 (관리자): 인적 사항 · 자격증·선임 · 올해 법정교육 이수 · 연도별 교육시간 · 교육 이력 전체 (A4 인쇄)
 *  ?name= 없으면 직원 목록에서 고른다. */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import PrintButton from "@/components/PrintButton";
import DocHead, { SdH } from "@/components/인사노무/DocHead";
import { requireAdminPage } from "@/lib/auth";
import { attendeesOf, historyOf, LEGAL, trainingView } from "@/lib/인사노무/training";
import { daysBetween, todayKst } from "@/lib/time";

export const metadata = { title: "개인별 교육이력카드 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const dot = (s?: string | null) => (s ? s.replaceAll("-", ".") : "");

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const name = typeof sp.name === "string" ? sp.name : "";
  const today = todayKst();
  const tv = await trainingView();

  if (!name) {
    const depts = [...new Set(tv.people.map((p) => p.emp.dept || "(부서 없음)"))];
    return (
      <div className="home">
        <PageHead href="/hr/training/card" title="개인별 교육이력카드" emoji="🎓" desc="직원을 고르면 교육 이력·이수 현황·자격증을 한 장으로 봅니다" />
        {depts.map((d) => (
          <section key={d} className="card home-row">
            <div className="card-title">{d}</div>
            <div className="tr-cards">
              {tv.people.filter((p) => (p.emp.dept || "(부서 없음)") === d).map((p) => {
                const hrs = tv.rows.filter((r) => attendeesOf(r.data, r.day!, tv.staff).includes(p.emp.name)).reduce((s, r) => s + (+r.data.hours || 0), 0);
                const rate = p.need ? Math.round((p.done / p.need) * 100) : 100;
                return (
                  <Link key={p.emp.name} href={`?name=${encodeURIComponent(p.emp.name)}`} className="tr-pc">
                    <b>{p.emp.name}</b><small>{p.emp.position || p.emp.rank}</small>
                    <span className={rate >= 100 ? "tr-ok" : rate >= 60 ? "orange" : "red"}>법정 {rate}%</span>
                    <small>올해 {hrs}시간</small>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }

  const h = await historyOf(name);
  const SAFE = LEGAL.find((d) => d.key === "safe1")!;
  const e = h.emp;
  const me = tv.people.find((p) => p.emp.name === name);
  const list = tv.people.map((p) => p.emp.name);
  const at = list.indexOf(name);
  const years = [...new Set(h.items.map((i) => i.row.day!.slice(0, 4)))].sort().reverse();
  const byYear = years.map((y) => {
    const it = h.items.filter((i) => i.row.day!.startsWith(y));
    return { y, n: it.filter((i) => i.st === "수료").length, hours: it.reduce((s, i) => s + i.hours, 0), legal: it.filter((i) => i.legal.length && i.st === "수료").reduce((s, i) => s + i.hours, 0) };
  });
  const tenure = e?.joinDate ? (() => { const d = daysBetween(e.joinDate, today); return `${Math.floor(d / 365)}년 ${Math.floor((d % 365) / 30)}개월`; })() : "";

  return (
    <div className="home">
      <div className="noprint">
        <PageHead href="/hr/training/card" title="개인별 교육이력카드" mark={name} emoji="🎓" desc="교육 실시 대장(참석·수강 대상자)·자격증·선임 관리에서 모읍니다">
          {at > 0 && <Link className="pill" href={`?name=${encodeURIComponent(list[at - 1])}`}>← {list[at - 1]}</Link>}
          {at >= 0 && at < list.length - 1 && <Link className="pill" href={`?name=${encodeURIComponent(list[at + 1])}`}>{list[at + 1]} →</Link>}
          <Link className="pill" href="/hr/training/card">직원 목록</Link>
          <Link className="pill" href={`/hr/training/record?who=${encodeURIComponent(name)}`}>+ 교육 기록</Link>
          <PrintButton className="pill print" label="인쇄 / PDF" />
        </PageHead>
      </div>

      <div className="doc-page sd-doc">
        <DocHead eyebrow="3-7 교육훈련 · 개인별 교육이력카드" title={`개인별 교육이력카드 · ${name}`}
          chips={[[e?.dept, e?.rank, e?.position].filter(Boolean).join(" "), e?.joinDate && `입사 ${dot(e.joinDate)} (${tenure})`, `교육 ${h.items.length}건 · 수료 ${h.items.filter((i) => i.st === "수료").length}건`,
            me && me.need ? [`${tv.year}년 법정 ${Math.round((me.done / me.need) * 100)}%`, me.done >= me.need ? "ok" : "warn"] : null, `출력 ${dot(today)}`]} />

        <SdH>인적 사항</SdH>
        <dl className="sd-info">
          <div><dt>성명</dt><dd className="b">{name}</dd></div>
          <div><dt>부서</dt><dd>{e?.dept || "-"}</dd></div>
          <div><dt>직급·직책</dt><dd>{[e?.rank, e?.position].filter(Boolean).join(" · ") || "-"}</dd></div>
          <div><dt>사번</dt><dd>{e?.empId || "-"}</dd></div>
          <div><dt>입사일</dt><dd>{dot(e?.joinDate) || "-"}</dd></div>
          <div><dt>근속</dt><dd>{tenure || "-"}</dd></div>
          <div className="full"><dt>안전보건교육 기준</dt><dd>
            {me ? (SAFE.hours!(me.emp, h.opts) === 6 ? "사무직" : "현장직 등") : "-"} · 반기 {me ? (tv.noAccident.on ? SAFE.hours!(me.emp, h.opts) / 2 : SAFE.hours!(me.emp, h.opts)) : "-"}시간
            {tv.noAccident.on ? " (무재해 50% 감면)" : ""}{me && me.cells.super.st !== "na" ? " · 관리감독자 연 16시간" : ""}</dd></div>
        </dl>

        <SdH>{tv.year}년 법정의무교육 이수</SdH>
        <div className="sd-legal">
          {LEGAL.map((d) => {
            const c = me?.cells[d.key];
            const st = c?.st ?? "na";
            return <div key={d.key} className={st}><small>{d.short.replace("\n", " ")}</small><b>{st === "ok" ? "수료" : st === "na" ? "대상 아님" : st === "part" ? "시간 부족" : "미이수"}</b><span>{st === "ok" ? c?.text : st === "part" ? c?.text : ""}</span></div>;
          })}
        </div>

        <div className="sd-two">
          <div>
            <SdH>연도별 교육 시간</SdH>
            <table className="doc-tbl full sd-tbl"><thead><tr><th>연도</th><th>수료 과정</th><th>총 시간</th><th>법정교육</th></tr></thead>
              <tbody>{byYear.map((b) => <tr key={b.y}><td className="b">{b.y}</td><td>{b.n}</td><td className="b">{b.hours}h</td><td>{b.legal}h</td></tr>)}
                {!byYear.length && <tr><td colSpan={4} className="muted">기록 없음</td></tr>}</tbody>
            </table>
          </div>
          <div>
            <SdH>자격증 · 선임</SdH>
            <table className="doc-tbl full sd-tbl"><thead><tr><th className="l">자격증</th><th>취득일</th><th>선임</th><th>보수교육·갱신</th></tr></thead>
              <tbody>{h.licenses.map((l) => (
                <tr key={l.id}><td className="l b">{l.data.name}{l.data.grade ? ` (${l.data.grade})` : ""}</td><td>{dot(l.data.got)}</td>
                  <td>{l.data.role && l.data.role !== "선임 아님" ? l.data.role : "-"}</td>
                  <td className={l.data.renew && l.data.renew < today ? "red b" : ""}>{dot(l.data.renew)}</td></tr>
              ))}{!h.licenses.length && <tr><td colSpan={4} className="muted">등록된 자격증 없음</td></tr>}</tbody>
            </table>
          </div>
        </div>

        <SdH>교육 이력</SdH>
        <table className="doc-tbl full sd-tbl"><thead><tr><th style={{ width: 36 }}>No</th><th>교육일</th><th className="l">교육명</th><th>구분</th><th>시간</th><th>교육기관·강사</th><th>결과</th><th>평가</th><th>수료증</th></tr></thead>
          <tbody>{h.items.map((i, n) => (
            <tr key={i.row.id}><td>{n + 1}</td><td>{dot(i.row.day)}</td>
              <td className="l b"><Link href={`/hr/training/sheet?id=${i.row.id}`}>{i.row.data.name}</Link>{i.legal.length ? <span className="sd-tag">법정</span> : null}</td>
              <td>{i.row.data.kind}</td><td>{i.row.data.hours ? `${i.row.data.hours}h` : ""}</td><td>{i.row.data.by}</td>
              <td><span className={`sd-pill ${i.st === "수료" ? "ok" : "bad"}`}>{i.st}</span></td><td className={`g ${i.grade}`}>{i.grade}</td><td>{i.cert ? <span className="sd-pill ok">제출</span> : ""}</td></tr>
          ))}{!h.items.length && <tr><td colSpan={9} className="muted">교육 기록이 없습니다.</td></tr>}</tbody>
        </table>
        <p className="sd-foot">교육 실시 대장의 참석자·수강 대상자 기준 · 미수료: 수강 대상이었으나 수료하지 않은 과정 · 통합관리시스템</p>
      </div>    </div>
  );
}
