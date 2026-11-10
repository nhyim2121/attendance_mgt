/** 통합 대시보드 (통합 디자인): 남색 배너·숫자 카드 · 시계 / 이번 주 할 일 / 빠른 추가 · 할 일 4칸 / 메모 / 바로가기
 *  · 전체 메뉴 · 부서별 인원·근로시간 그래프 · 이번 주 휴가 / 다가오는 일정 */
import Link from "next/link";
import { Clock, LinksCard, MemoCard, Todo4Card, TodoCard } from "@/components/대시/client";
import { nextOf, noteOf, schedOf, splitTodos, weekStrip } from "@/components/대시/common";
import { Bars, Card, Hello, HoursLine, type KpiProps, Kpis, Leaves, MenuLists, QuickAdd, Schedule, Win } from "@/components/대시/parts";
import { toViews } from "@/components/대시/views";
import { requireUser } from "@/lib/auth";
import { ddayText, hrSnap, todos, WEEK_WARN } from "@/lib/대시/data";
import { loadLinks } from "@/lib/대시/links";
import { MENU } from "@/lib/대시/menu";
import { loadMemos, loadTodo4 } from "@/lib/대시/notes";
import { todayKst } from "@/lib/time";

export const metadata = { title: "통합 대시보드 · 통합관리시스템" };

export default async function HubPage() {
  const user = await requireUser();
  const admin = user.role === "관리자";
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
  const quick: [string, string][] = admin
    ? [["/leave/register", "🏖️ 휴가 등록"], ["/ga/mail#form", "📨 받은 공문 등록"], ["/ga/b/fixtures#form", "📦 비품 추가"], ["/ga/b/drivelog#form", "🛣️ 차량 운행 기록"], ["/misc/b/tasks#form", "📝 진행 건 추가"]]
    : [["/leave/register", "🏖️ 휴가 등록"], ["/sheets?tab=edit", "🙋 근태 기입"], ["/employees", "🪪 직원 추가"]];
  const strip = weekStrip(today, (d) => hr.weekLeaves.filter((l) => l.day === d).length);

  return (
    <div className="ud">
      <Hello today={today} name={user.name} todo={week.length} note={noteOf(week)} />
      <Kpis items={kpis} />
      <div className="u-grid">
        <Clock strip={strip} stripLabel="이번 주 휴가·출장 (명)" bar={hr.ok ? { label: "오늘 출근", n: hr.present, of: hr.staff } : undefined} next={nextOf(week)} />
        <TodoCard items={toViews(week)} />
        <QuickAdd items={quick} className="s3" />
        <Todo4Card items={t4} />
        <MemoCard items={memos} />
        <LinksCard scope="all" links={links} />
        <Win en="MENU" ko="업무 영역 전체 메뉴" className="s12"><MenuLists areas={MENU.filter((a) => admin || !a.adminOnly)} /></Win>
        <Card en="TEAM" title="부서별 인원" more={["조직도", "/org"]} className="s5"><Bars data={hr.depts.map((d) => ({ label: d.dept, n: d.n }))} /></Card>
        <Card en="HOURS" title="월별 1인 평균 주 근로시간" more={["리포트", "/hours"]} className="s7"><HoursLine data={hr.monthly} /></Card>
        <Card en="LEAVE" title="이번 주 휴가·출장" more={["캘린더", "/leave/calendar"]} className="s4"><Leaves items={hr.weekLeaves} today={today} /></Card>
        <Card en="SCHEDULE" title="다가오는 일정 · 8~90일" className="s8"><Schedule items={schedOf(later, today)} /></Card>
      </div>
      {!hr.ok && <p className="fd-empty">캡스 기록이 아직 없습니다. <Link href="/upload">데이터 관리</Link>에서 올리면 근태 숫자가 채워집니다.</p>}
    </div>
  );
}
