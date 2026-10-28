"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { escapeHtml, prefillFromLeaves, renderReportHtml, type ReportRow } from "@/lib/daily";
import { friendlyError, loadMailConfig, parseAddresses, sendMail } from "@/lib/mailer";
import * as store from "@/lib/store";
import { dayLabel, isDateStr } from "@/lib/time";

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
  revalidatePath("/", "layout");
  return { ok: `${dayLabel(day)} 근태현황을 저장했습니다 (${clean.length}행).` };
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
  return prefillFromLeaves(await store.loadLeaves(), day);
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
  revalidatePath("/report");
  return { ok: `메일을 보냈습니다: ${to.join(", ")}` };
}
