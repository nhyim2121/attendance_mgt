/** 일일 근태현황 보고서: 등록·수정·삭제 → 미리보기 → 이미지 저장 → 하이웍스 메일 발송. */
import { Suspense } from "react";
import { ParamDate } from "@/components/ParamControls";
import { Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { rankMap, summaryText, weekendBefore } from "@/lib/daily";
import { getHolidays, getRecords, loadBase, type SearchParams } from "@/lib/data";
import { loadMailConfig } from "@/lib/mailer";
import * as store from "@/lib/store";
import { addDays, dayLabel, isDateStr, shortKst, todayKst } from "@/lib/time";
import ReportEditor from "./ReportEditor";

export const metadata = { title: "일일 근태현황 · 근태관리통합시스템" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const day = isDateStr(sp.day) ? sp.day : todayKst();
  const [user, base, holidays, info, saved, written, fileLeaves, allRows, log, mailTo, mailCc] = await Promise.all([
    currentUser(), loadBase(), getHolidays(), store.reportInfo(day), store.loadReportRows(day), store.reportDays(),
    store.loadLeaves(), store.loadReportRows(), store.loadMailLog(10),
    store.getSetting("mail_to", ""), store.getSetting("mail_cc", ""),
  ]);

  // 성명 목록: 명단 + 최근 120일 출입자
  const names = base.roster.map((r) => r.name);
  const last = base.months.length ? base.months[base.months.length - 1].last_day : day;
  if (base.months.length) {
    for (const r of await getRecords(addDays(last, -120), last)) if (r.name && !names.includes(r.name)) names.push(r.name);
  }
  const holidayDates = [...new Set([...weekendBefore(day),
    ...Object.keys(holidays).filter((d) => d >= addDays(day, -7) && d < day)])].sort();
  const cfg = loadMailConfig();

  return (
    <>
      <h1>일일 근태현황</h1>
      <p className="caption">매일 엑셀로 작성해 캡처하던 근태현황을 여기서 작성합니다. 저장하면 근태 판정(지각·조퇴 제외, 휴가 집계)에도 바로 반영되고, 이미지로 저장하거나 하이웍스 메일로 보낼 수 있습니다.</p>
      <div className="filters">
        <Suspense><ParamDate name="day" label="보고 일자" value={day} /></Suspense>
        <div style={{ paddingBottom: 8 }}>
          {info
            ? <><b>저장됨</b> · {info.author} {shortKst(info.updated_at)}{info.sent_at ? ` · 메일 발송 ${shortKst(info.sent_at)} (${info.sent_by})` : " · 메일 미발송"}</>
            : <><b>새 보고서</b> (아직 저장 안 됨)</>}
        </div>
        <div className="spacer" />
        {written.length > 0 && <span className="caption" style={{ margin: 0, paddingBottom: 8 }}>최근 작성: {written.slice(0, 7).map((d) => dayLabel(d)).join(", ")}</span>}
      </div>

      <ReportEditor key={`${day}|${info?.updated_at ?? ""}`} day={day} saved={saved.map(({ day: _d, ...r }) => r)}
        isSaved={!!info} canDelete={user?.role === "관리자" || info?.author === user?.loginId}
        hasPrev={written.some((d) => d < day)} names={names}
        deptOf={Object.fromEntries(base.roster.map((r) => [r.name, r.dept]))} ranks={rankMap(fileLeaves, allRows)}
        holidayDates={holidayDates}
        mail={{
          configured: !!cfg, sender: cfg ? `${cfg.senderName} <${cfg.user}> · ${cfg.host}:${cfg.port}` : "",
          to: mailTo, cc: mailCc, subject: `[근태현황] ${dayLabel(day)} - ${summaryText(saved)}`,
          greeting: `안녕하세요. 관리팀입니다.\n${dayLabel(day, true)} 근태현황 공유드립니다.`,
        }} />

      {log.length > 0 && (
        <details className="fold" style={{ marginTop: 16 }}>
          <summary>발송 이력</summary>
          <Table head={["일자", "제목", "받는사람", "참조", "결과", "사용자", "일시"]}
            rows={log.map((l) => [l.day, l.subject, l.to_addr, l.cc_addr, l.result, l.user_id, shortKst(l.created_at)])} />
        </details>
      )}
    </>
  );
}
