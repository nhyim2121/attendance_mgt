/** 교육 실시 기록 (관리자): 연간 계획·법정교육에서 불러오기 → 참석자 체크(근태 연동) → 저장하면 대장·계획·교육일지·서명부 */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import { requireAdminPage } from "@/lib/auth";
import { bookOf } from "@/lib/대장/books";
import { loadBooks, loadRow } from "@/lib/대장/store";
import { dailyBoard, isHoliday } from "@/lib/인사노무/analytics";
import { getHolidays, getRule, loadBase, rosterDays } from "@/lib/인사노무/data";
import { courseOf, DEFAULT_OPTS, gradesOf, isOffice, LEGAL, type TrainOpts } from "@/lib/인사노무/training";
import { getSetting } from "@/lib/store";
import { addDays, todayKst } from "@/lib/time";
import RecordForm, { type Init } from "./RecordForm";

export const metadata = { title: "교육 실시 기록 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const ABSENT = new Set(["휴가", "출장·교육", "휴무", "기록 없음"]);

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const today = todayKst();
  const [base, rule, holidays, saved, rows] = await Promise.all([
    loadBase(), getRule(), getHolidays(), getSetting<Partial<TrainOpts>>("training", {}), loadBooks(["trainplan", "training"]),
  ]);
  const opts: TrainOpts = { ...DEFAULT_OPTS, ...saved };
  const emps = base.employees.filter((e) => (!e.leaveDate || e.leaveDate >= addDays(today, -400)) && !opts.exclude.includes(e.name));

  // 최근 45일 근무일별 출근하지 않은 사람 (그날 출근한 사람만 고르기)
  const from = addDays(today, -45);
  const { days } = await rosterDays(from, today);
  const absent: Record<string, Record<string, string>> = {};
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (isHoliday(d, rule, holidays) || !days.some((x) => x.day === d)) continue;
    const staff = emps.filter((e) => (!e.joinDate || e.joinDate <= d) && (!e.leaveDate || e.leaveDate >= d)).map((e): [string, string] => [e.name, e.dept]);
    const m: Record<string, string> = {};
    for (const b of dailyBoard(days, base.leaves, staff, d, rule)) if (ABSENT.has(b.group)) m[b.emp] = b.group === "기록 없음" ? "미출근" : b.group;
    absent[d] = m;
  }

  // 미리 채우기: ?id=(고치기) / ?plan= / ?t=법정교육 / ?who=
  const plans = rows.filter((r) => r.book === "trainplan" && (r.day ?? "") >= `${+today.slice(0, 4) - 1}-07-01` && !["실시 완료", "취소"].includes(r.data.status ?? ""))
    .sort((a, b) => (a.day ?? "").localeCompare(b.day ?? ""))
    .map((r) => ({ id: r.id, month: (r.day ?? "").slice(0, 7), name: r.data.name ?? "", kind: r.data.kind ?? "", target: r.data.target ?? "", status: r.data.status ?? "" }));
  let init: Init = { id: 0, plan: 0, day: today, name: "", kind: "", hours: "", time: "", place: "", by: "", cost: "", next: "", content: "", note: "", names: [], extra: "", until: "", target: [], cert: [], grades: {}, effect: "", effectHow: "", follow: "" };
  const id = Number(one(sp.id));
  if (id) {
    const r = await loadRow(id);
    if (r && r.book === "training") {
      const c = courseOf(r, base.employees);
      const names = c.done;
      const extra = (r.data.who ?? "").split(/[,\n]+/).map((x) => x.trim()).filter((x) => x && !names.includes(x) && !/전\s*직원/.test(x)).join(", ");
      const time = /시간 ([^·]+)/.exec(r.data.note ?? "")?.[1]?.trim() ?? "";
      init = { ...init, id, day: r.day ?? today, name: r.data.name ?? "", kind: r.data.kind ?? "", hours: r.data.hours ?? "", time, place: r.data.place ?? "",
        by: r.data.by ?? "", cost: r.data.cost ?? "", next: r.data.next ?? "", content: r.data.content ?? "", note: (r.data.note ?? "").replace(/^시간 [^·]+(· )?/, "").trim(), names, extra,
        until: r.data.until ?? "", target: r.data.target ? c.target : [], cert: c.cert,
        grades: gradesOf(r.data.grades), effect: r.data.effect ?? "", effectHow: r.data.effectHow ?? "", follow: r.data.follow ?? "" };
    }
  } else {
    const p = plans.find((x) => x.id === Number(one(sp.plan)));
    if (p) init = { ...init, plan: p.id, name: p.name, kind: p.kind };
    const def = LEGAL.find((d) => d.key === one(sp.t));
    if (def) init = { ...init, name: def.title, kind: def.kind, hours: def.reducible ? "" : def.key === "super" ? "16" : "1" };
    if (one(sp.t) === "hire") init = { ...init, name: "채용 시 안전보건교육", kind: "안전보건", hours: "8" };
    if (one(sp.t) === "change") init = { ...init, name: "작업내용 변경 시 안전보건교육", kind: "안전보건", hours: "2" };
    const who = one(sp.who);
    if (who) init = { ...init, names: who.split(",").filter(Boolean) };
  }

  const kinds = bookOf("training")!.fields.find((f) => f.k === "kind")!.options!;
  const people = emps.map((e) => ({ name: e.name, dept: e.dept || "(부서 없음)", join: e.joinDate ?? "", leave: e.leaveDate ?? "", office: isOffice(e, opts) }));

  return (
    <div className="home">
      <PageHead href="/hr/training/record" title={init.id ? "교육 실시 기록 고치기" : "교육 실시 기록"} emoji="🎓"
        desc="계획에서 불러와 참석자만 체크하면, 교육 실시 대장 기록 · 연간 계획 '실시 완료' · 교육결과 보고서가 한 번에 만들어집니다">
        <Link className="pill" href="/hr/b/training">교육 실시 대장 (전체 목록)</Link>
      </PageHead>
      <RecordForm init={init} plans={plans} kinds={kinds} people={people} absent={absent} today={today} />
    </div>
  );
}
