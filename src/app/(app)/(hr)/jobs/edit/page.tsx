/** 직무기술서 쓰기·고치기 */
import PageHead from "@/components/대시/PageHead";
import { requireAdminPage } from "@/lib/auth";
import { blankJob } from "@/lib/인사노무/jobdesc";
import { loadJobs, loadUnits } from "@/lib/인사노무/jobdescData";
import JobEditor from "../JobEditor";

export const metadata = { title: "직무기술서 쓰기 · 인사노무 · 통합관리시스템" };

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireAdminPage();
  const { id } = await searchParams;
  const [{ jobs }, { units }] = await Promise.all([loadJobs(), loadUnits()]);
  const job = jobs.find((j) => j.id === id) ?? blankJob();
  return (
    <>
      <PageHead href="/jobs" title={job.name ? `직무기술서 고치기` : "새 직무기술서"} mark={job.name || undefined} />
      <JobEditor job={job} units={units.map((u) => ({ id: u.id, path: u.path, people: u.people }))} isNew={!jobs.some((j) => j.id === job.id)} />
    </>
  );
}
