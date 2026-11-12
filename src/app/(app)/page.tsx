/** 통합 대시보드 (통합 디자인): 남색 배너·숫자 카드 · 시계+할 일 4칸 / 이번 주 할 일 · 메모 / 바로가기 / 부서별 인원
 *  · 이번 주 휴가·출장(주간 달력) · 다가오는 일정 · 전체 메뉴. 빠른 추가·월별 근로시간 그래프는 뺐다 (2026-11-12) */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { Clock, LinksCard, MemoCard, Todo4Card, TodoCard } from "@/components/대시/client";
import { nextOf, noteOf, schedOf, splitTodos, weekStrip } from "@/components/대시/common";
import { Bars, Card, Hello, type KpiProps, Kpis, MenuLists, type SecItem, Security, Schedule, WeekLeaves, Win } from "@/components/대시/parts";
import { toViews } from "@/components/대시/views";
import { readableAreas, requireUser } from "@/lib/auth";
import { ddayText, hrSnap, todos, WEEK_WARN } from "@/lib/대시/data";
import { loadLinks } from "@/lib/대시/links";
import { menuFor } from "@/lib/대시/menu";
import { loadMemos, loadTodo4 } from "@/lib/대시/notes";
import { todayKst } from "@/lib/time";

export const metadata = { title: "통합 대시보드 · 통합관리시스템" };

export default async function HubPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const admin = user.role === "관리자";
  const areas = await readableAreas(user);
  const denied = (await searchParams).denied; // 권한 없는 영역에서 돌아온 경우 (proxy.ts)
  const today = todayKst();
  const [hr, list, links, t4, memos] = await Promise.all([hrSnap(), todos(admin), loadLinks("all"), loadTodo4(user.id), loadMemos(user.id)]);
  const { week, later } = splitTodos(list);
  const docs = list.filter((t) => t.cat === "문서");
  const nextDoc = docs.find((d) => d.left !== null);
  const due30 = list.filter((t) => t.cat === "만기·갱신" && t.left !== null && t.left <= 30);
  const lt = Object.entries(hr.leaveTypes).map(([k, n]) => `${k} ${n}`).join(" · ");

  const kpis: KpiProps[] = [
    { label: "오늘 출근", n: hr.present, unit: `/ ${hr.staff}명`, sub: `지각 ${hr.late} · 미출근 ${hr.absent}`, icon: "clock", color: "#0c3994", href: `/daily?day=${today}` },
    { label: "오늘 휴가", n: hr.leave, unit: "명", sub: lt || (hr.trip ? `출장·교육 ${hr.trip}명` : "없음"), icon: "umbrella", color: "#15803d", href: "/leave/calendar" },
    ...(admin ? [
      { label: "처리 중인 문서", n: docs.length, unit: "건", sub: nextDoc ? `가장 가까운 회신 기한 ${ddayText(nextDoc.left)}` : "문서 수발 대장", icon: "mail", color: "#0e7490", warn: docs.length > 0, href: "/ga/mail?open=1" },
      { label: "만기 임박", n: due30.length, unit: "건", sub: "30일 안 · 인증·차량·인증서 등", icon: "alert", color: "#e84340", warn: due30.length > 0, href: "/cert/home" },
    ] : [
      { label: `주 ${WEEK_WARN}시간 이상`, n: hr.near.length, unit: "명", sub: "이번 주", icon: "gauge", color: "#b45309", warn: hr.near.length > 0, href: "/week52" },
      { label: "연차 사용률", n: hr.usedRate, unit: "%", sub: `잔여 ${hr.remain}일`, icon: "pie", color: "#0e7490", href: "/leave/status" },
    ]),
  ];
  const strip = weekStrip(today, (d) => hr.weekLeaves.filter((l) => l.day === d).length);

  // PC 보안점검 결과 (PC를 켤 때 자동실행/security-check.mjs가 남김, 관리자만 보임)
  let sec: { at: string; items: SecItem[] } | null = null;
  if (admin) {
    try { sec = JSON.parse(readFileSync(join(process.cwd(), "데이터", "logs", "security-latest.json"), "utf8")); } catch { sec = null; }
  }

  return (
    <div className="ud">
      {denied && <div className="msg warn">이 계정은 그 업무 영역을 볼 권한이 없습니다. 필요하면 관리자에게 권한을 요청하세요.</div>}
      <Hello today={today} name={user.name} todo={week.length} note={noteOf(week)} />
      <Kpis items={kpis} />
      {/* 배치 (2026-11-12): 왼쪽 시계 + 할 일 4칸, 오른쪽 할 일 목록 / 메모·링크·부서별 인원 / 이번 주 휴가·출장 주간 달력 / 일정 / 전체 메뉴 */}
      <div className="u-grid">
        <div className="s6 u-col">
          <Clock strip={strip} stripLabel="이번 주 휴가·출장 (명)" bar={hr.ok ? { label: "오늘 출근", n: hr.present, of: hr.staff } : undefined} next={nextOf(week)} />
          <Todo4Card items={t4} />
        </div>
        <TodoCard items={toViews(week)} />
        <MemoCard items={memos} />
        <LinksCard scope="all" links={links} />
        <Card en="TEAM" title="부서별 인원" more={["조직도", "/org"]} className="s6"><Bars data={hr.depts.map((d) => ({ label: d.dept, n: d.n }))} /></Card>
        {sec && <Card en="SECURITY" title="PC 보안점검 (PC를 켤 때 자동)" more={["점검 기록", "/it/b/seccheck"]} className="s12"><Security at={sec.at} items={sec.items} /></Card>}
        <Card en="LEAVE" title="이번 주 휴가·출장" more={["캘린더", "/leave/calendar"]} className="s12"><WeekLeaves items={hr.weekLeaves} today={today} /></Card>
        <Card en="SCHEDULE" title="다가오는 일정 · 8~90일" className="s12"><Schedule items={schedOf(later, today)} /></Card>
        <Win en="MENU" ko="업무 영역 전체 메뉴" className="s12"><MenuLists areas={menuFor(admin, areas)} /></Win>
      </div>
      {!hr.ok && <p className="fd-empty">캡스 기록이 아직 없습니다. <Link href="/upload">데이터 관리</Link>에서 올리면 근태 숫자가 채워집니다.</p>}
    </div>
  );
}
