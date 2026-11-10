/** 타부서 업무협조: 품질·생산·영업·구매·연구소와 주고받는 요청. 받은 요청·보낸 요청, 기한, 상태, 진행 기록.
 *  ?id= 이면 한 건 자세히 (상태 단추·진행 기록·고치기). 관리팀 계정이 같이 본다. */
import Link from "next/link";
import { Bars, type KpiProps, Kpis, Win } from "@/components/대시/parts";
import { requireUser } from "@/lib/auth";
import { todayKst } from "@/lib/time";
import { coopLeft, DEPT_COLOR, DEPT_EMOJI, DEPTS, isOpen, statusTone } from "@/lib/기타/work";
import { loadCoop, loadCoops, people } from "@/lib/기타/workStore";
import { CoopForm, CoopList, CoopLogBox, CoopStatusBar, DeleteCoop } from "../forms";

export const metadata = { title: "업무협조 · 통합관리시스템" };
const md = (d: string) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "-");

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = todayKst();
  const [list, team] = await Promise.all([loadCoops(), people()]);
  const owners = team.map((p) => p.name);

  if (sp.id) {
    const c = await loadCoop(sp.id);
    if (!c) return <div className="ud"><p className="muted">없는 업무협조입니다. <Link href="/misc/coop">목록으로</Link></p></div>;
    const left = coopLeft(c, today);
    return (
      <div className="ud">
        <header className="u-hello ar" style={{ ["--c" as string]: DEPT_COLOR[c.dept] }}>
          <span className="u-date"><Link href="/misc">기타</Link> › <Link href="/misc/coop">업무협조</Link> › {c.dept}</span>
          <h1>{c.prio === "긴급" && "🔥 "}{c.title}</h1>
          <p>{c.dir === "받은 요청" ? `📥 ${c.dept} ${c.partner || ""} → 우리(${c.owner})` : `📤 우리(${c.owner}) → ${c.dept} ${c.partner || ""}`} · 요청 {md(c.asked)}{c.due ? ` · 기한 ${md(c.due)}` : ""}</p>
          <span className="u-cover" aria-hidden>{DEPT_EMOJI[c.dept]}</span>
          <div className="u-note"><b>지금 상태</b><span className={`fd-tag ${statusTone(c.status)}`}>{c.status}</span>
            <small>{c.status === "완료" ? `${md(c.doneAt)} 완료` : left === null ? "기한 없음" : left < 0 ? `기한 ${-left}일 지남` : left === 0 ? "오늘 기한" : `D-${left}`}</small></div>
        </header>
        <div className="u-grid">
          <Win en="STATUS" ko="상태 바꾸기 · 바꾸면 진행 기록에 남음" className="s12"><CoopStatusBar id={c.id} status={c.status} /></Win>
          <Win en="DETAIL" ko="내용·결과" className="s6">
            <dl className="cp-dl">
              <dt>방향</dt><dd>{c.dir}</dd><dt>부서</dt><dd>{DEPT_EMOJI[c.dept]} {c.dept}</dd>
              <dt>상대 담당자</dt><dd>{c.partner || "-"}</dd><dt>우리 담당</dt><dd>{c.owner}</dd>
              <dt>요청일</dt><dd>{c.asked}</dd><dt>기한</dt><dd>{c.due || "없음"}</dd>
              <dt>자세한 내용</dt><dd className="pre">{c.detail || "-"}</dd>
              <dt>처리 결과</dt><dd className="pre">{c.result || "-"}</dd>
              <dt>등록</dt><dd>{c.by} · {c.at.slice(0, 16)}</dd>
            </dl>
          </Win>
          <Win en="LOG" ko="진행 기록 · 통화·메일·회신 내용을 한 줄씩" className="s6"><CoopLogBox id={c.id} log={c.log} /></Win>
          <Win en="EDIT" ko="고치기" className="s12">
            <CoopForm c={c} owners={owners} me={me.name} />
            <div className="fd-btns" style={{ marginTop: 10 }}><Link className="fd-btn" href="/misc/coop">‹ 목록</Link><DeleteCoop id={c.id} /></div>
          </Win>
        </div>
      </div>
    );
  }

  const open = list.filter(isOpen);
  const late = open.filter((c) => { const l = coopLeft(c, today); return l !== null && l < 0; });
  const month = today.slice(0, 7);
  const doneMonth = list.filter((c) => c.status === "완료" && c.doneAt.startsWith(month));
  const recv = open.filter((c) => c.dir === "받은 요청"), sent = open.filter((c) => c.dir === "보낸 요청");
  const kpis: KpiProps[] = [
    { label: "받은 요청 (처리할 일)", n: recv.length, unit: "건", sub: recv[0] ? `${recv[0].dept} ${recv[0].title.slice(0, 14)}` : "없음", icon: "mail", color: "#0c3994", href: "#list" },
    { label: "보낸 요청 (회신 기다림)", n: sent.length, unit: "건", sub: sent.filter((c) => c.status === "회신 대기").length ? `회신 대기 ${sent.filter((c) => c.status === "회신 대기").length}건` : "-", icon: "list", color: "#0e7490", href: "#list" },
    { label: "기한 지남", n: late.length, unit: "건", sub: late[0] ? `${late[0].dept} ${late[0].title.slice(0, 14)}` : "없음", icon: "alert", color: "#e84340", warn: late.length > 0, href: "#list" },
    { label: `${+month.slice(5)}월 완료`, n: doneMonth.length, unit: "건", sub: `전체 ${list.length}건`, icon: "calendarCheck", color: "#15803d", href: "#list" },
  ];
  return (
    <div className="ud">
      <header className="u-hello ar" style={{ ["--c" as string]: "#be185d" }}>
        <span className="u-date"><Link href="/misc">기타</Link> › 타부서 업무협조</span>
        <h1>타부서 <mark>업무협조</mark></h1>
        <p>품질·생산·영업·구매·연구소와 주고받는 요청을 한곳에. 받은 요청은 처리, 보낸 요청은 회신까지 챙깁니다.</p>
        <span className="u-cover" aria-hidden>🤝</span>
        {late[0]
          ? <Link className="u-note" href={`/misc/coop?id=${late[0].id}`}><b>기한 지난 협조</b>{late[0].dept} · {late[0].title}<small>기한 {md(late[0].due)}</small></Link>
          : <div className="u-note"><b>오늘의 한 줄</b>기한 지난 업무협조가 없습니다. 👍</div>}
      </header>
      <Kpis items={kpis} />
      <div className="u-grid">
        <Win en="DEPARTMENTS" ko="부서별 진행 중" className="s12">
          <div className="cp-depts">
            {DEPTS.map((d) => {
              const mine = open.filter((c) => c.dept === d);
              return (
                <a key={d} href={`#list`} className="cp-dept" style={{ ["--c" as string]: DEPT_COLOR[d] }}>
                  <span className="em">{DEPT_EMOJI[d]}</span><b>{d}</b>
                  <strong>{mine.length}<small>건</small></strong>
                  <small>받음 {mine.filter((c) => c.dir === "받은 요청").length} · 보냄 {mine.filter((c) => c.dir === "보낸 요청").length}</small>
                </a>
              );
            })}
          </div>
        </Win>
        <Win en="REQUESTS" ko="업무협조 목록 · 부서·상태로 거르기" className="s8">
          <span id="list" />
          <CoopList items={list.map((c) => ({ c, left: coopLeft(c, today) }))} dept0={sp.dept ?? ""} />
        </Win>
        <Win en="BY DEPT" ko="부서별 올해 협조 건수" className="s4">
          <Bars data={DEPTS.map((d) => ({ label: d, n: list.filter((c) => c.dept === d && c.asked.startsWith(today.slice(0, 4))).length }))} unit="건" />
        </Win>
        <Win en="NEW" ko="업무협조 등록" className="s12">
          <span id="form" />
          <CoopForm owners={owners} me={me.name} dept0={sp.dept} />
        </Win>
      </div>
    </div>
  );
}
