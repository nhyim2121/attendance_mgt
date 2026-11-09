/** 통합 대시보드 (F안): 남색 배너 · 숫자 카드 4개 · 빠른 추가 / 다가오는 할 일 / 바로가기 모음 · 부서별 인원·근로시간 그래프 · 이번 주 휴가 · 업무 영역 */
import Link from "next/link";
import { LinksCard, TodoCard } from "@/components/대시/client";
import { AreaTiles, Bars, Card, Hello, HoursLine, type KpiProps, Kpis, QuickAdd, Tag } from "@/components/대시/parts";
import { toViews } from "@/components/대시/views";
import { requireUser } from "@/lib/auth";
import { ddayText, hrSnap, todos, WEEK_WARN } from "@/lib/대시/data";
import { loadLinks } from "@/lib/대시/links";
import { MENU } from "@/lib/대시/menu";
import { todayKst, weekdayKr } from "@/lib/time";

export const metadata = { title: "통합 대시보드 · 통합관리시스템" };

export default async function HubPage() {
  const user = await requireUser();
  const admin = user.role === "관리자";
  const today = todayKst();
  const [hr, list, links] = await Promise.all([hrSnap(), todos(admin), loadLinks("all")]);
  const docs = list.filter((t) => t.cat === "문서");
  const nextDoc = docs.find((d) => d.left !== null);
  const due30 =list.filter((t) => t.cat === "만기·갱신" && t.left !== null && t.left <= 30);
  const lt = Object.entries(hr.leaveTypes).map(([k, n]) => `${k} ${n}`).join(" · ");

  const kpis: KpiProps[] = [
    { label: "오늘 출근", n: hr.present, unit: `/ ${hr.staff}명`, sub: `지각 ${hr.late} · 미출근 ${hr.absent}`, icon: "clock", color: "#0c3994", href: `/daily?day=${today}` },
    { label: "오늘 휴가", n: hr.leave, unit: "명", sub: lt || (hr.trip ? `출장·교육 ${hr.trip}명` : "없음"), icon: "umbrella", color: "#15803d", href: "/leave/calendar" },
    ...(admin ? [
      { label: "처리 중인 문서", n: docs.length, unit: "건", sub: nextDoc ? `가장 가까운 회신 기한 ${ddayText(nextDoc.left)}` : "문서 수발 대장", icon: "mail", color: "#0e7490", warn: docs.length > 0, href: "/ga/mail?open=1" },
      { label: "만기 임박", n: due30.length, unit: "건", sub: "30일 안 · 인증·차량·인증서 등", icon: "gauge", color: "#e84340", warn: due30.length > 0, href: "/cert/home" },
    ] : [
      { label: `주 ${WEEK_WARN}시간 이상`, n: hr.near.length, unit: "명", sub: "이번 주", icon: "gauge", color: "#b45309", warn: hr.near.length > 0, href: "/week52" },
      { label: "연차 사용률", n: hr.usedRate, unit: "%", sub: `잔여 ${hr.remain}일`, icon: "pie", color: "#0e7490", href: "/leave/status" },
    ]),
  ];
  const quick: [string, string][] = admin
    ? [["/leave/register", "휴가 등록"], ["/ga/mail#form", "받은 공문 등록"], ["/ga/b/fixtures#form", "비품 추가"], ["/ga/b/drivelog#form", "차량 운행 기록"], ["/misc/b/tasks#form", "할 일 추가"]]
    : [["/leave/register", "휴가 등록"], ["/sheets?tab=edit", "근태 기입"], ["/employees", "직원 추가"]];

  return (
    <div className="fd">
      <Hello today={today} name={user.name} todo={list.filter((t) => t.left === null || t.left <= 7).length} />
      <Kpis items={kpis} />
      <div className="fd-row3">
        <QuickAdd items={quick} />
        <TodoCard items={toViews(list)} note="기한 순 · 누르면 이동" />
        <LinksCard scope="all" links={links} />
      </div>
      <div className="fd-tri">
        <Card title="부서별 인원" more={["조직도", "/org"]}><Bars data={hr.depts.map((d) => ({ label: d.dept, n: d.n }))} /></Card>
        <Card title="월별 1인 평균 주 근로시간" more={["리포트", "/hours"]}><HoursLine data={hr.monthly} /></Card>
      </div>
      <div className="fd-duo">
        <Card title="이번 주 휴가·출장" more={["캘린더", "/leave/calendar"]}>
          {hr.weekLeaves.length ? (
            <ul className="fd-leaves">{hr.weekLeaves.map((l, i) => (
              <li key={i} className={l.day < today ? "past" : ""}><span>{weekdayKr(l.day)} {+l.day.slice(8)}일 · {l.name}</span>
                <Tag tone={l.type.includes("반") ? "b" : ["출장", "교육", "외근"].includes(l.type) ? "v" : l.type === "외출" ? "o" : "g"}>{l.type}</Tag></li>
            ))}</ul>
          ) : <p className="fd-empty">이번 주 휴가·출장이 없습니다.</p>}
        </Card>
        <Card title="업무 영역"><AreaTiles areas={MENU.filter((a) => admin || !a.adminOnly)} /></Card>
      </div>
      {!hr.ok && <p className="fd-empty">캡스 기록이 아직 없습니다. <Link href="/upload">데이터 관리</Link>에서 올리면 근태 숫자가 채워집니다.</p>}
    </div>
  );
}
