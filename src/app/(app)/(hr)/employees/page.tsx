/** 직원 관리: 숫자 카드 · 다가오는 인사 일정 · 직원 목록(검색·부서·재직/퇴사·정렬) + 줄을 누르면 상세 서랍. 출퇴근 집계는 이 명부 기준. */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import CsvButton from "@/components/CsvButton";
import { requireUser } from "@/lib/auth";
import { loadAvatars } from "@/lib/인사노무/avatar";
import { getLeavePolicy, loadBase } from "@/lib/인사노무/data";
import { statusLabel } from "@/lib/인사노무/employees";
import { hrEvents, tenure, tenureText } from "@/lib/인사노무/hrEvents";
import { leaveBook } from "@/lib/인사노무/leaveBook";
import { loadEmpFiles, loadPrivate } from "@/lib/인사노무/private";
import { fyOf } from "@/lib/인사노무/vacation";
import * as store from "@/lib/store";
import { todayKst } from "@/lib/time";
import EmployeeEditor, { type Extra } from "./EmployeeEditor";

export const metadata = { title: "직원 관리 · 통합관리시스템" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const admin = user.role === "관리자";
  const sp = await searchParams;
  const [base, spans, avatars, policy, adjusts] = await Promise.all([
    loadBase(), store.recordNameSpan(), admin ? loadAvatars() : Promise.resolve({} as Record<string, number>), getLeavePolicy(), store.loadAdjusts(),
  ]);
  const emps = base.employees;
  const today = todayKst();
  const depts = [...new Set([...emps.map((e) => e.dept).filter(Boolean), "생산팀", "품질팀", "관리팀", "영업팀", "연구소"])].sort();
  const spanOf = new Map(spans.map((s) => [s.name, [s.first_day, s.last_day] as [string, string]]));

  // 연차 (연차 현황과 같은 계산)
  const fy = fyOf(today, policy);
  const active = emps.filter((e) => (!e.leaveDate || e.leaveDate >= today) && (!e.joinDate || e.joinDate <= today));
  let bal = new Map<string, { total: number; used: number; remain: number }>();
  try {
    const b = leaveBook(active, base.leaves, adjusts, fy, policy, await store.loadLeaveStatus(fy))(today).bal;
    bal = new Map(b.map((x) => [x.name, { total: x.total, used: x.used, remain: x.remain }]));
  } catch { /* 연차 계산이 안 돼도 명부는 보인다 */ }

  // 관리자만: 생년월일·주민번호(가린 값)·급여, 첨부 파일
  const [priv, files] = admin ? await Promise.all([loadPrivate(), loadEmpFiles()]) : [{}, {}];
  const extra: Record<string, Extra> = Object.fromEntries(emps.map((e) => [e.name, {
    tenure: tenureText(tenure(e, today)), span: spanOf.get(e.capsName || e.name) ?? null, leave: bal.get(e.name) ?? null,
    ...(admin ? {
      priv: (priv as Record<string, Extra["priv"]>)[e.name],
      files: ((files as Record<string, { id: number; fileName: string; size: number; createdAt: string }[]>)[e.name] ?? [])
        .map((f) => ({ id: f.id, fileName: f.fileName, size: f.size, createdAt: f.createdAt })),
    } : {}),
  }]));
  const events = hrEvents(emps, today);
  const openNew = sp.new === "1";

  return (
    <div className="ep">
      <PageHead href="/employees" desc="직원 명부·입사일·연락처 · 여기 등록된 직원만 출퇴근 집계에 나옵니다 (퇴사일 = 마지막 근무일)">
          <Link href="/employees?new=1" className="ep-btn pri" scroll={false}>＋ 직원 추가</Link>
          <CsvButton name={`직원명부_${today}.csv`} label="엑셀"
            head={["이름", "상태", "부서", "직급", "직책", "입사일", "퇴사일", "근속", "휴대전화", "내선", "이메일", "캡스 이름", "사번", "비고"]}
            rows={emps.map((e) => [e.name, statusLabel(e, today), e.dept, e.rank, e.position, e.joinDate ?? "", e.leaveDate ?? "", extra[e.name].tenure,
              e.phone, e.ext, e.email, e.capsName, e.empId, e.note])} />
      </PageHead>
      <EmployeeEditor key={openNew ? "new" : "list"} emps={emps} depts={depts} today={today} extra={extra} avatars={avatars}
        admin={admin} openNew={openNew} events={events} fyLabel={`${fy}${policy.fyStartMonth === 1 ? "년" : "회계연도"}`} />
    </div>
  );
}
