"use server";
/** 직무기술서 저장·삭제·복사 (settings 'job_descs'). 처음 저장하면 예시 목록이 함께 저장된다. */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { cleanJob, JD_EXAMPLES, type JobDesc } from "@/lib/인사노무/jobdesc";
import { loadJobs, saveJobs } from "@/lib/인사노무/jobdescData";
import { todayKst } from "@/lib/time";

type R = { ok?: string; error?: string; id?: string };
const done = (ok: string, id?: string): R => { revalidatePath("/jobs", "layout"); return { ok, id }; };

export async function saveJob(j: JobDesc): Promise<R> {
  const u = await requireAdmin();
  const c = cleanJob(j);
  if (!c.name) return { error: "직무명을 적어 주세요." };
  if (!c.updated) c.updated = todayKst();
  if (!c.writer) c.writer = u.name;
  const { jobs } = await loadJobs();
  const i = jobs.findIndex((x) => x.id === c.id);
  await saveJobs(i < 0 ? [...jobs, c] : jobs.map((x, k) => (k === i ? c : x)));
  return done(`「${c.name}」 직무기술서를 저장했습니다.`, c.id);
}

export async function deleteJob(id: string): Promise<R> {
  await requireAdmin();
  const { jobs } = await loadJobs();
  await saveJobs(jobs.filter((x) => x.id !== id));
  return done("지웠습니다.");
}

export async function copyJob(id: string): Promise<R> {
  await requireAdmin();
  const { jobs } = await loadJobs();
  const j = jobs.find((x) => x.id === id);
  if (!j) return { error: "없는 직무기술서입니다." };
  const c: JobDesc = { ...j, id: `jd-${Date.now()}`, name: `${j.name} (복사)`, example: false, updated: "" };
  await saveJobs([...jobs, c]);
  return done("복사했습니다. 이름과 내용을 고쳐 쓰세요.", c.id);
}

/** 순서 바꾸기 */
export async function moveJob(id: string, dir: -1 | 1): Promise<R> {
  await requireAdmin();
  const { jobs } = await loadJobs();
  const i = jobs.findIndex((x) => x.id === id);
  let k = i + dir; // 같은 부서 안에서만 (목록이 부서별로 묶여 보인다)
  while (i >= 0 && k >= 0 && k < jobs.length && (jobs[k].dept ?? "") !== (jobs[i].dept ?? "")) k += dir;
  if (i < 0 || k < 0 || k >= jobs.length) return {};
  const out = [...jobs]; [out[i], out[k]] = [out[k], out[i]];
  await saveJobs(out);
  return done("");
}

/** 지운 예시를 다시 넣기 (이미 있는 것은 그대로) */
export async function restoreExamples(): Promise<R> {
  await requireAdmin();
  const { jobs } = await loadJobs();
  const add = JD_EXAMPLES.filter((e) => !jobs.some((x) => x.id === e.id));
  await saveJobs([...jobs, ...add]);
  return done(add.length ? `예시 ${add.length}개를 다시 넣었습니다.` : "예시가 모두 들어 있습니다.");
}
