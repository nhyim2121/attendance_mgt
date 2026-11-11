"use server";
import { requirePerm } from "@/lib/auth";
/** 기타(내 업무) 저장: 주간업무일지 · 업무협조 · 개인일정. 관리팀 계정(관리자·담당자) 모두 쓴다. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { newId } from "@/lib/대시/notes";
import { nowKst, todayKst } from "@/lib/time";
import { type Coop, COOP_DIR, COOP_STATUS, type CoopStatus, DEPTS, isOpen, type Plan, PLAN_KINDS, REPEATS, type WeekLog, type WRow } from "@/lib/기타/work";
import { deleteCoop, deleteLog, loadCoop, loadPlans, saveCoop, saveLog, savePlans } from "@/lib/기타/workStore";

type Res = { ok?: string; error?: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isHM = (s: string) => /^\d{2}:\d{2}$/.test(s);
const pick = <T extends string>(v: string, list: readonly T[], fb: T): T => ((list as readonly string[]).includes(v) ? (v as T) : fb);
const done = () => revalidatePath("/", "layout");

// ---------------------------------------------------------------- 주간업무일지
export async function saveWeek(monday: string, rows: WRow[], issue: string, request: string): Promise<Res> {
  await requirePerm("update");
  const me = await requireUser();
  if (!isDay(monday)) return { error: "주를 알 수 없습니다." };
  const clean: WRow[] = (Array.isArray(rows) ? rows : []).slice(0, 60).map((r) => ({
    id: String(r.id || newId()).slice(0, 20), cat: String(r.cat ?? "").slice(0, 20), task: String(r.task ?? "").slice(0, 200),
    prev: String(r.prev ?? "").slice(0, 2000), done: String(r.done ?? "").slice(0, 4000), pct: Math.max(0, Math.min(100, Math.round(Number(r.pct) || 0))),
    next: String(r.next ?? "").slice(0, 4000), note: String(r.note ?? "").slice(0, 1000),
  })).filter((r) => r.task || r.done || r.next || r.prev);
  const log: WeekLog = { name: me.name, rows: clean, issue: String(issue ?? "").slice(0, 4000), request: String(request ?? "").slice(0, 4000), updatedAt: nowKst() };
  await saveLog(me.id, monday, log);
  done();
  return { ok: `저장했습니다 (${log.updatedAt.slice(11, 16)}).` };
}
export async function removeWeek(monday: string): Promise<void> {
  await requirePerm("delete");
  const me = await requireUser();
  if (isDay(monday)) await deleteLog(me.id, monday);
  done();
}

// ---------------------------------------------------------------- 업무협조
export async function saveCoopForm(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  const me = await requireUser();
  const id = str(f, "id");
  const old = id ? await loadCoop(id) : null;
  const title = str(f, "title");
  if (!title) return { error: "협조 내용(제목)을 적어 주세요." };
  const due = str(f, "due"), asked = str(f, "asked") || todayKst();
  const status = pick<CoopStatus>(str(f, "status"), COOP_STATUS, old?.status ?? "접수");
  const c: Coop = {
    id: old?.id ?? newId(), dir: pick(str(f, "dir"), COOP_DIR, "받은 요청"), dept: pick(str(f, "dept"), DEPTS, "기타"),
    title: title.slice(0, 200), detail: str(f, "detail").slice(0, 4000), partner: str(f, "partner").slice(0, 60), owner: str(f, "owner").slice(0, 60) || me.name,
    asked: isDay(asked) ? asked : todayKst(), due: isDay(due) ? due : "", status, prio: str(f, "prio") === "긴급" ? "긴급" : "보통",
    doneAt: status === "완료" ? (old?.doneAt || todayKst()) : "", result: str(f, "result").slice(0, 4000),
    log: old?.log ?? [], by: old?.by ?? me.name, at: old?.at ?? nowKst(),
  };
  if (old && old.status !== c.status) c.log = [...c.log, { at: nowKst(), by: me.name, text: `상태: ${old.status} → ${c.status}` }];
  if (!old) c.log = [{ at: nowKst(), by: me.name, text: `${c.dir} 등록` }];
  await saveCoop(c);
  done();
  if (!old) redirect(`/misc/coop?id=${c.id}`);
  return { ok: "저장했습니다." };
}
export async function setCoopStatus(id: string, status: string): Promise<void> {
  await requirePerm("update");
  const me = await requireUser();
  const c = await loadCoop(id);
  if (!c || !(COOP_STATUS as readonly string[]).includes(status) || c.status === status) return;
  const s = status as CoopStatus;
  await saveCoop({ ...c, status: s, doneAt: s === "완료" ? todayKst() : isOpen({ ...c, status: s }) ? "" : c.doneAt,
    log: [...(c.log ?? []), { at: nowKst(), by: me.name, text: `상태: ${c.status} → ${s}` }] });
  done();
}
export async function addCoopLog(id: string, text: string): Promise<void> {
  await requirePerm("create");
  const me = await requireUser();
  const c = await loadCoop(id);
  const t = String(text ?? "").trim().slice(0, 2000);
  if (!c || !t) return;
  await saveCoop({ ...c, log: [...(c.log ?? []), { at: nowKst(), by: me.name, text: t }] });
  done();
}
export async function removeCoop(id: string): Promise<void> {
  await requirePerm("delete");
  await requireUser();
  await deleteCoop(id);
  done();
  redirect("/misc/coop");
}

// ---------------------------------------------------------------- 개인일정
export async function savePlanForm(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("update");
  const me = await requireUser();
  const id = str(f, "id");
  const title = str(f, "title"), day = str(f, "day");
  if (!title) return { error: "일정 제목을 적어 주세요." };
  if (!isDay(day)) return { error: "날짜를 골라 주세요." };
  const end = str(f, "end"), from = str(f, "from"), to = str(f, "to"), until = str(f, "until");
  const list = await loadPlans(me.id);
  const old = list.find((p) => p.id === id);
  const p: Plan = {
    id: old?.id ?? newId(), day, end: isDay(end) && end > day ? end : "", from: f.get("allday") === "on" || !isHM(from) ? "" : from,
    to: f.get("allday") === "on" || !isHM(to) ? "" : to, title: title.slice(0, 200), kind: pick(str(f, "kind"), PLAN_KINDS, "기타"),
    place: str(f, "place").slice(0, 100), memo: str(f, "memo").slice(0, 2000), repeat: pick(str(f, "repeat"), REPEATS, "안 함"),
    until: isDay(until) ? until : "", done: old?.done ?? [],
  };
  await savePlans(me.id, old ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]);
  done();
  if (old) redirect(`/misc/plan?d=${p.day}`);
  return { ok: `${p.day.slice(5).replace("-", "/")} '${p.title}' 일정을 넣었습니다.` };
}
/** 일정 끝냄 표시 (반복 일정은 그 회차만) */
export async function togglePlanDone(id: string, start: string): Promise<void> {
  await requirePerm("update");
  const me = await requireUser();
  const list = await loadPlans(me.id);
  await savePlans(me.id, list.map((p) => (p.id !== id ? p : { ...p, done: p.done.includes(start) ? p.done.filter((d) => d !== start) : [...p.done, start].slice(-400) })));
  done();
}
export async function removePlan(id: string): Promise<void> {
  await requirePerm("delete");
  const me = await requireUser();
  await savePlans(me.id, (await loadPlans(me.id)).filter((p) => p.id !== id));
  done();
}
