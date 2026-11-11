/** 직무기술서 쓰기·고치기 */
import PageHead from "@/components/대시/PageHead";
import { requireAdminPage } from "@/lib/auth";
import { blankJob, JD_DEPTS, JD_EXCLUDE_PEOPLE } from "@/lib/인사노무/jobdesc";
import { loadJobs, loadUnits, personLabel, teamOf } from "@/lib/인사노무/jobdescData";
import JobEditor from "../JobEditor";

export const metadata = { title: "직무기술서 쓰기 · 인사노무 · 통합관리시스템" };

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireAdminPage();
  const { id } = await searchParams;
  const [{ jobs }, { units }] = await Promise.all([loadJobs(), loadUnits()]);
  const found = jobs.find((j) => j.id === id) ?? blankJob();
  const job = { ...found, ...teamOf(found, units) }; // 담당자를 따로 안 정했으면 조직도 사람으로 채워 보여 준다
  // 고를 수 있는 사람: 조직도 순서, 뺄 사람 제외
  const seen = new Set<string>();
  const staff = units.flatMap((u) => u.members.map((m) => ({ name: m.name, label: personLabel(m.name, units), unit: u.label })))
    .filter((x) => !JD_EXCLUDE_PEOPLE.includes(x.name) && !seen.has(x.name) && seen.add(x.name));
  const depts = [...new Set([...JD_DEPTS, ...jobs.map((j) => j.dept).filter(Boolean)])];
  return (
    <>
      <PageHead href="/jobs" title={job.name ? `직무기술서 고치기` : "새 직무기술서"} mark={job.name || undefined} />
      <JobEditor job={job} staff={staff} depts={depts} units={units.map((u) => ({ id: u.id, path: u.path, people: u.people }))} isNew={!jobs.some((j) => j.id === job.id)} />
    </>
  );
}
