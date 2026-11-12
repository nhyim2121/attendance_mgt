/** 데일리 체크 보드 (2026-11-12, 노션 '데일리 체크 보드'·'업무 인수인계' 참고, 사이트 디자인)
 *  ?tab=today  ① 오늘 할 일 + 주간·월간 체크 + 반복 업무
 *  ?tab=work   ② 업무(프로젝트) + 리마인더 보드
 *  ?tab=handover ③ 업무 인수인계서 (업무분장·프로젝트·대장 폴더·관련 사이트로 자동 작성) */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import { requireUser } from "@/lib/auth";
import { todos } from "@/lib/대시/data";
import { DUTIES, type DutyArea } from "@/lib/대시/duties";
import { loadLinks } from "@/lib/대시/links";
import { BOOKS } from "@/lib/대장/books";
import { loadDaily, loadReminders, routinesOn, stateOf } from "@/lib/기타/daily";
import { loadBase } from "@/lib/인사노무/data";
import { addDays, todayKst, weekday } from "@/lib/time";
import { HandoverDoc, ProjectsBoard, RemindersBoard, TodayBoard, type WeekDay } from "./BoardClient";

export const metadata = { title: "데일리 체크 보드 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const AREA_LABEL: Record<DutyArea, string> = { hr: "인사노무", ga: "총무", ehs: "환경안전보건", it: "보안전산", cert: "인증" };

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  const me = await requireUser();
  const admin = me.role === "관리자";
  const sp = await searchParams;
  const tab = ["work", "handover"].includes(one(sp.tab)) ? one(sp.tab) : "today";
  const today = todayKst();
  const [data, reminders] = await Promise.all([loadDaily(me.id), loadReminders()]);

  const tabs = (
    <nav className="tabs" aria-label="데일리 체크 보드">
      <Link href="/misc/board" className={tab === "today" ? "on" : ""}>① 오늘 할 일 · 주간</Link>
      <Link href="/misc/board?tab=work" className={tab === "work" ? "on" : ""}>② 업무 · 리마인더</Link>
      <Link href="/misc/board?tab=handover" className={tab === "handover" ? "on" : ""}>③ 업무 인수인계서</Link>
    </nav>
  );

  if (tab === "work") {
    return (
      <div className="home">
        <PageHead href="/misc/board" title="데일리 체크 보드" mark="업무 · 리마인더" desc="며칠짜리 업무는 기간·진행을, 공지·바뀐 규정·참고 자료는 리마인더로 붙여 두고 읽으면 '확인 완료'" />
        {tabs}
        <ProjectsBoard projects={data.projects} today={today} />
        <RemindersBoard list={reminders} me={me.name} today={today} />
      </div>
    );
  }

  if (tab === "handover") {
    const areas = (data.handover.areas.length ? data.handover.areas : ["hr"]) as DutyArea[];
    const duties = areas.flatMap((a) => DUTIES[a].flatMap((g) => g.duties.map((d) => ({
      key: `${a}:${g.no}:${d.task}`, area: AREA_LABEL[a], group: `${g.no}. ${g.name}`, task: d.task, cycle: d.cycle, note: d.note ?? "",
      file: BOOKS.find((b) => g.books.includes(b.key))?.folder ?? "",
    }))));
    const folders = [...new Set(BOOKS.filter((b) => areas.includes(b.area as DutyArea) && b.folder).map((b) => b.folder!.split("\\").slice(0, 2).join("\\")))];
    const links = (await Promise.all(areas.map((a) => loadLinks(a)))).flat();
    const base = await loadBase();
    const emp = base.employees.find((e) => e.name === me.name);
    const files = [
      { key: "site", name: "통합관리시스템", path: "http://192.168.1.58:8501", how: "관리자에게 계정·권한 요청 (사용자·권한 설정)" },
      ...folders.map((f) => ({ key: `f:${f}`, name: `공유 폴더 ${f.split("\\")[0]}`, path: `X:\\관리팀\\${f}`, how: "전산 담당에게 폴더 권한 요청" })),
      ...links.slice(0, 12).map((l) => ({ key: `l:${l.url}`, name: l.name, path: l.url, how: l.group })),
    ];
    return (
      <div className="home">
        <div className="noprint">
          <PageHead href="/misc/board" title="데일리 체크 보드" mark="업무 인수인계서" desc="업무분장·진행 중 업무·대장 폴더·관련 사이트로 자동으로 채우고, 관계자·꼭 알아야 할 것만 직접 적습니다" />
          {tabs}
        </div>
        <HandoverDoc me={{ name: me.name, dept: emp?.dept ?? "", rank: [emp?.rank, emp?.position].filter(Boolean).join(" · ") }} h={data.handover} areaOpts={AREA_LABEL}
          duties={duties} projects={data.projects.filter((p) => p.status !== "완료")} files={files} today={today} people={base.employees.filter((e) => !e.leaveDate || e.leaveDate >= today).map((e) => e.name)} />
      </div>
    );
  }

  // ① 오늘 · 주간 · 월간
  const view = one(sp.view) === "month" ? "month" : "week";
  const wOff = Number(one(sp.w)) || 0;
  const mon = addDays(addDays(today, -weekday(today)), wOff * 7);
  const sys = (await todos(admin)).filter((t) => t.left !== null && t.left <= 7).slice(0, 8)
    .map((t) => ({ id: `sys:${t.href}`, text: t.title, sub: t.sub, href: t.href, left: t.left! }));
  const dayInfo = (day: string, withSys: boolean): WeekDay => {
    const d = data.days[day] ?? { items: [], rdone: [] };
    const rs = routinesOn(data.routines, day);
    const sysDay = withSys ? sys : [];
    const all = rs.length + d.items.length + sysDay.length;
    const done = rs.filter((r) => d.rdone.includes(r.id)).length + d.items.filter((i) => i.done).length + sysDay.filter((s) => d.rdone.includes(s.id)).length;
    return { day, routines: rs.map((r) => ({ id: r.id, text: r.text, done: d.rdone.includes(r.id) })), items: d.items, sys: sysDay.map((s) => ({ ...s, done: d.rdone.includes(s.id) })),
      memo: d.memo ?? "", done, all, state: stateOf(done, all) };
  };
  const week = Array.from({ length: 5 }, (_, i) => dayInfo(addDays(mon, i), addDays(mon, i) === today));
  const month = one(sp.m) && /^\d{4}-\d{2}$/.test(one(sp.m)) ? one(sp.m) : today.slice(0, 7);
  const first = `${month}-01`, start = addDays(first, -weekday(first));
  const monthDays = Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
    const x = dayInfo(d, d === today);
    return { day: d, inMonth: d.startsWith(month), done: x.done, all: x.all, state: x.state };
  });

  return (
    <div className="home">
      <PageHead href="/misc/board" title="데일리 체크 보드" mark="오늘 할 일 · 주간"
        desc="매일 하는 일은 '반복 업무'로 한 번만 정해 두면 날마다 자동으로 생기고, 대장 기한·결재 알림도 오늘 칸에 같이 들어옵니다" />
      {tabs}
      <TodayBoard today={today} todayInfo={dayInfo(today, true)} week={week} wOff={wOff} view={view} month={month} monthDays={monthDays} routines={data.routines} />
    </div>
  );
}
