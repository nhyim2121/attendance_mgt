"use server";
/** 데일리 체크 보드 저장 (사람마다 따로, 리마인더는 다 같이) */
import { revalidatePath } from "next/cache";
import { requirePerm, requireUser } from "@/lib/auth";
import { type Contact, type Cycle, type Day, type Handover, loadDaily, loadReminders, newId, type Project, type Reminder, type Routine, saveDaily, saveReminders } from "@/lib/기타/daily";
import { addDays, nowKst, weekday } from "@/lib/time";

const clean = (s: unknown, n = 200) => String(s ?? "").trim().slice(0, n);
const dayOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
async function edit(fn: (d: Awaited<ReturnType<typeof loadDaily>>) => void) {
  await requirePerm("update");
  const me = await requireUser();
  const d = await loadDaily(me.id);
  fn(d);
  await saveDaily(me.id, d);
  revalidatePath("/misc", "layout");
  revalidatePath("/");
}
const dayOf = (d: Awaited<ReturnType<typeof loadDaily>>, day: string): Day => (d.days[day] ??= { items: [], rdone: [] });

/** 체크 켜기·끄기: 반복 업무 id · 'sys:주소' · 오늘만 할 일 id */
export async function toggleCheck(day: string, id: string) {
  if (!dayOk(day)) return;
  await edit((d) => {
    const x = dayOf(d, day);
    const it = x.items.find((i) => i.id === id);
    if (it) it.done = !it.done;
    else x.rdone = x.rdone.includes(id) ? x.rdone.filter((r) => r !== id) : [...x.rdone, id];
  });
}
export async function addItem(day: string, text: string) {
  const t = clean(text);
  if (!dayOk(day) || !t) return;
  await edit((d) => { dayOf(d, day).items.push({ id: newId(), text: t, done: false }); });
}
export async function removeItem(day: string, id: string) {
  await edit((d) => { const x = dayOf(d, day); x.items = x.items.filter((i) => i.id !== id); });
}
export async function setMemo(day: string, memo: string) {
  if (!dayOk(day)) return;
  await edit((d) => { dayOf(d, day).memo = clean(memo, 500); });
}
/** 못 한 '오늘만 할 일'을 다음 근무일로 넘긴다 */
export async function carryOver(day: string) {
  if (!dayOk(day)) return;
  await edit((d) => {
    const x = dayOf(d, day);
    let next = addDays(day, 1);
    while (weekday(next) > 4) next = addDays(next, 1);
    const left = x.items.filter((i) => !i.done);
    x.items = x.items.filter((i) => i.done);
    dayOf(d, next).items.push(...left.map((i) => ({ ...i, id: newId() })));
  });
}
export async function saveRoutines(list: Routine[]) {
  await edit((d) => {
    d.routines = list.filter((r) => clean(r.text)).slice(0, 40).map((r) => ({
      id: r.id || newId(), text: clean(r.text), cycle: (["daily", "weekly", "monthly"].includes(r.cycle) ? r.cycle : "daily") as Cycle,
      ...(r.cycle === "weekly" ? { wd: Math.min(6, Math.max(0, +(r.wd ?? 0))) } : {}), ...(r.cycle === "monthly" ? { md: Math.min(31, Math.max(1, +(r.md ?? 1))) } : {}),
    }));
  });
}
export async function saveProject(p: Project) {
  const name = clean(p.name);
  if (!name) return;
  await edit((d) => {
    const v: Project = { id: p.id || newId(), name, from: clean(p.from, 10), to: clean(p.to, 10), status: (["시작 전", "진행 중", "완료"].includes(p.status) ? p.status : "시작 전"),
      pct: Math.min(100, Math.max(0, Math.round(+p.pct || 0))), area: clean(p.area, 40), cycle: clean(p.cycle, 20), star: Math.min(5, Math.max(0, Math.round(+p.star || 0))), memo: clean(p.memo, 300), next: clean(p.next, 200) };
    if (v.status === "완료") v.pct = 100;
    const i = d.projects.findIndex((x) => x.id === v.id);
    if (i >= 0) d.projects[i] = v; else d.projects.unshift(v);
  });
}
export async function deleteProject(id: string) {
  await edit((d) => { d.projects = d.projects.filter((p) => p.id !== id); });
}
export async function saveHandover(h: Handover) {
  await edit((d) => {
    d.handover = {
      taker: clean(h.taker, 40), date: clean(h.date, 10), areas: (h.areas ?? []).filter((a) => ["hr", "ga", "ehs", "it", "cert"].includes(a)),
      dutyMemo: Object.fromEntries(Object.entries(h.dutyMemo ?? {}).map(([k, v]) => [k.slice(0, 200), clean(v, 300)]).filter(([, v]) => v)),
      fileMemo: Object.fromEntries(Object.entries(h.fileMemo ?? {}).map(([k, v]) => [k.slice(0, 200), clean(v, 300)]).filter(([, v]) => v)),
      contacts: (h.contacts ?? []).filter((c) => clean(c.name)).slice(0, 60).map((c): Contact => ({ id: c.id || newId(), name: clean(c.name, 60), kind: c.kind === "외부" ? "외부" : "내부", tel: clean(c.tel, 80), note: clean(c.note, 300) })),
      tips: (h.tips ?? []).map((t) => clean(t, 300)).filter(Boolean).slice(0, 60),
      checks: (h.checks ?? []).map((t) => clean(t, 80)).slice(0, 40),
    };
  });
}

// ---------------------------------------------------------------- 리마인더 (다 같이)
export async function saveReminder(r: Reminder) {
  await requirePerm("update");
  const me = await requireUser();
  const title = clean(r.title);
  if (!title) return;
  const list = await loadReminders();
  const i = list.findIndex((x) => x.id === r.id);
  const v: Reminder = { id: r.id || newId(), title, kind: clean(r.kind, 20) || "참고", body: clean(r.body, 600), from: clean(r.from, 10), to: clean(r.to, 10), pin: !!r.pin,
    by: i >= 0 ? list[i].by : me.name, read: i >= 0 ? list[i].read : [], at: i >= 0 ? list[i].at : nowKst().slice(0, 16) };
  if (i >= 0) list[i] = v; else list.unshift(v);
  await saveReminders(list.slice(0, 200));
  revalidatePath("/misc", "layout");
}
export async function deleteReminder(id: string) {
  await requirePerm("delete");
  await saveReminders((await loadReminders()).filter((r) => r.id !== id));
  revalidatePath("/misc", "layout");
}
export async function toggleRead(id: string) {
  await requirePerm("update");
  const me = await requireUser();
  const list = await loadReminders();
  const r = list.find((x) => x.id === id);
  if (!r) return;
  r.read = r.read.includes(me.name) ? r.read.filter((n) => n !== me.name) : [...r.read, me.name];
  await saveReminders(list);
  revalidatePath("/misc", "layout");
}
