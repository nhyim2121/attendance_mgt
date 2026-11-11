"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { escapeHtml, parseAttValue, prefillFromLeaves, renderReportHtml, type ReportRow } from "@/lib/인사노무/daily";
import { isHoliday } from "@/lib/인사노무/analytics";
import { getHolidays, getRule, loadBase } from "@/lib/인사노무/data";
import { friendlyError, loadMailConfig, parseAddresses, sendMail } from "@/lib/mailer";
import * as store from "@/lib/store";
import { VACATION_TYPES } from "@/lib/인사노무/vacation";
import { addDays, dayLabel, isDateStr, todayKst } from "@/lib/time";

type Res = { ok?: string; error?: string };

const SECTIONS = new Set(["근태", "도제", "휴가일정", "휴일근무"]);

export async function saveReportAction(day: string, rows: ReportRow[]): Promise<Res> {
  const user = await requireUser();
  if (!isDateStr(day)) return { error: "보고 일자가 올바르지 않습니다." };
  const clean = rows.filter((r) => SECTIONS.has(r.section) && String(r.name).trim()).map((r) => ({
    section: r.section, ord: Number(r.ord) || 0, dept: String(r.dept ?? ""), rank: String(r.rank ?? ""),
    name: String(r.name).trim(), types: String(r.types ?? ""), title: String(r.title ?? ""), detail: String(r.detail ?? ""),
    value: String(r.value ?? ""), note: String(r.note ?? ""),
  }));
  await store.saveReport(day, clean, user.loginId);
  const spread = await spreadRanges(day, clean, user.loginId);
  const synced = await syncSchedule(day, clean, user.loginId);
  revalidatePath("/", "layout");
  const extra = [spread && `기간 근태를 다른 날 보고서 ${spread}곳에도 넣었습니다`, synced && `휴가일정 ${synced}건을 휴가 관리에 반영했습니다`].filter(Boolean);
  return { ok: `${dayLabel(day)} 근태현황을 저장했습니다 (${clean.length}행).${extra.length ? ` ${extra.join(" · ")}.` : ""}` };
}

export async function deleteReportAction(day: string): Promise<Res> {
  const user = await requireUser();
  const info = await store.reportInfo(day);
  if (!info) return { error: "저장된 보고서가 없습니다." };
  if (user.role !== "관리자" && info.author !== user.loginId) return { error: "작성자나 관리자만 지울 수 있습니다." };
  await store.deleteReport(day);
  revalidatePath("/", "layout");
  return { ok: `${dayLabel(day)} 보고서를 삭제했습니다.` };
}

/** 업로드된 근태현황(하이웍스) 파일에 이 날짜로 적힌 근태 */
export async function prefillAction(day: string): Promise<ReportRow[]> {
  await requireUser();
  // 근태현황 파일 + 휴가 관리에서 등록한 휴가
  const base = await loadBase();
  return prefillFromLeaves([...await store.loadLeaves(), ...base.leaves.filter((l) => l.sheet === "휴가관리")], day);
}

/** 가장 최근 보고서의 도제·휴가일정 표 */
export async function carryAction(day: string): Promise<ReportRow[]> {
  await requireUser();
  const prev = (await store.reportDays()).find((d) => d < day);
  if (!prev) return [];
  return (await store.loadReportRows(prev)).filter((r) => r.section === "도제" || r.section === "휴가일정")
    .map(({ day: _d, ...r }) => r);
}

/** 저장된 보고서를 하이웍스 메일로 보낸다. */
export async function sendReportMail(day: string, toText: string, ccText: string, subject: string,
  greeting: string): Promise<Res> {
  const user = await requireUser();
  const cfg = loadMailConfig();
  if (!cfg) return { error: "메일 발송 설정이 없습니다." };
  const [to, badTo] = parseAddresses(toText);
  const [cc, badCc] = parseAddresses(ccText);
  if (badTo.length || badCc.length) return { error: `메일 주소 형식이 맞지 않습니다: ${[...badTo, ...badCc].join(", ")}` };
  if (!to.length) return { error: "받는 사람을 입력해 주세요." };
  if (!(await store.reportInfo(day))) return { error: "저장된 보고서만 보낼 수 있습니다. 먼저 저장해 주세요." };

  const saved = await store.loadReportRows(day);
  const html = greeting.split("\n").map((line) =>
    `<p style="font-family:Malgun Gothic,sans-serif;font-size:14px;margin:0 0 4px">${escapeHtml(line)}</p>`).join("")
    + '<div style="height:12px"></div>' + renderReportHtml(day, saved);
  const text = `${greeting}\n\n${saved.map((r) =>
    `- ${r.name}(${r.dept}) ${r.types || r.section} ${r.title} ${r.detail}`.trimEnd()).join("\n")}`;
  try {
    await sendMail(cfg, subject, html, text, to, cc);
  } catch (exc) {
    await store.logMail(day, subject, to.join(", "), cc.join(", "), `실패: ${(exc as Error).message}`.slice(0, 300), user.loginId);
    return { error: friendlyError(exc) };
  }
  await store.logMail(day, subject, to.join(", "), cc.join(", "), "성공", user.loginId);
  await store.setSetting("mail_to", to.join(", "));
  await store.setSetting("mail_cc", cc.join(", "));
  revalidatePath("/daily");
  return { ok: `메일을 보냈습니다: ${to.join(", ")}` };
}

// ---------------------------------------------------------------- 기간 근태·휴가일정 반영
const RANGE = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/;
const SCHEDULE_MARK = "일일 근태 보고서 휴가일정"; // 휴가 관리(vacations)에서 보고서가 만든 휴가 표시
type Row = Omit<ReportRow, "day">;

/** 근태현황 줄에 기간(value = 'YYYY-MM-DD~YYYY-MM-DD')이 있으면 기간 안의 다른 근무일 보고서에도 같은 줄을 넣는다. */
async function spreadRanges(day: string, rows: Row[], user: string): Promise<number> {
  const rangeOf = (v: string) => { const x = parseAttValue(v); return x.from && x.to ? `${x.from}~${x.to}` : ""; };
  const ranged = rows.filter((r) => r.section === "근태" && RANGE.test(rangeOf(r.value)));
  if (!ranged.length) return 0;
  const [rule, holidays] = await Promise.all([getRule(), getHolidays()]);
  const targets = new Map<string, Row[]>();
  for (const r of ranged) {
    const [, a, b] = RANGE.exec(rangeOf(r.value))!;
    for (let d = a; d <= b; d = addDays(d, 1)) {
      if (d === day || isHoliday(d, rule, holidays)) continue;
      if (!targets.has(d)) targets.set(d, []);
      targets.get(d)!.push(r);
    }
  }
  for (const [d, add] of targets) {
    const cur = (await store.loadReportRows(d)).map(({ day: _x, ...r }) => r as Row);
    // 같은 사람·근태·근무지 줄은 새 내용으로 바꾼다
    const same = (x: Row, y: Row) => x.section === "근태" && x.name === y.name && x.types === y.types && x.title === y.title;
    const keep = cur.filter((x) => !add.some((y) => same(x, y)));
    const ord = keep.filter((x) => x.section === "근태").length;
    await store.saveReport(d, [...keep, ...add.map((r, i) => ({ ...r, ord: ord + i + 1 }))], user);
  }
  return targets.size;
}

/** 휴가일정(구조형: title = 휴가 종류, types = 날짜들, detail = 시간)을 휴가 관리에 휴가로 등록한다.
 * 오늘 이후 보고서만 반영하고, 보고서가 만든 휴가(표시)는 보고일 이후 것을 지우고 다시 넣는다. */
async function syncSchedule(day: string, rows: Row[], user: string): Promise<number> {
  if (day < todayKst()) return 0;
  const sched = rows.filter((r) => r.section === "휴가일정" && VACATION_TYPES.includes(r.title) && r.types);
  // 이 보고서 휴가일정에 있는 사람만 정리하고 다시 넣는다 (휴가일정을 아직 안 가져온 보고서가 다른 사람 휴가를 지우지 않게)
  for (const name of new Set(sched.map((r) => r.name))) await store.deleteMarkedVacations(SCHEDULE_MARK, name, day);
  let n = 0;
  for (const r of sched) {
    const [st, et] = (/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/.exec(r.detail) ?? []).slice(1);
    for (const d of r.types.split(",").map((x) => x.trim()).filter((x) => isDateStr(x) && x >= day)) {
      await store.addVacation({
        name: r.name, type: r.title, startDay: d, endDay: d, startTime: st ?? "", endTime: et ?? "",
        reason: r.note, note: SCHEDULE_MARK, createdBy: user,
      });
      n++;
    }
  }
  return n;
}
