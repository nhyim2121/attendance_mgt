/** 월별 캘린더 (기타 대시보드·월별 캘린더 화면): 월~일 7칸 + 오른쪽 '그 주 업무일지' 칸.
 *  날짜를 누르면 그날 개인일정, 주 칸을 누르면 그 주 일지로 간다. 서버 컴포넌트. */
import Link from "next/link";
import type { MonthCal as Data } from "@/lib/기타/calendar";
import { logAvg, shiftMonth, weekTitle } from "@/lib/기타/work";
import { addDays } from "@/lib/time";

const KIND_MARK = { plan: "", coop: "🤝", coopDone: "✅", due: "📌", bid: "⚖️" } as const;

export default function MonthCal({ month, cal, today, base, holidays, max = 4, logCol = true }: {
  month: string; cal: Data; today: string; base: string; holidays: Record<string, string>; max?: number; logCol?: boolean;
}) {
  const byDay = new Map<string, Data["items"]>();
  for (const it of cal.items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);
  const nav = (m: string) => `${base}${base.includes("?") ? "&" : "?"}m=${m}`;
  return (
    <div className="mc">
      <div className="mc-nav">
        <Link href={nav(shiftMonth(month, -1))} className="fd-btn">‹</Link>
        <b>{month.slice(0, 4)}년 {+month.slice(5, 7)}월</b>
        <Link href={nav(shiftMonth(month, 1))} className="fd-btn">›</Link>
        {month !== today.slice(0, 7) && <Link href={nav(today.slice(0, 7))} className="fd-btn sm">이번 달</Link>}
        <span className="mc-leg">
          <i style={{ background: "#0c3994" }} />일정 <span>🤝</span>협조 기한 <span>✅</span>협조 완료 <span>📌</span>할 일 <span>⚖️</span>투찰 마감
        </span>
      </div>
      <div className={`mc-g${logCol ? " log" : ""}`}>
        {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => <div key={d} className={`mc-h${i > 4 ? " we" : ""}`}>{d}</div>)}
        {logCol && <div className="mc-h wk">주간업무일지</div>}
        {cal.weeks.map((mon) => {
          const log = cal.logs[mon];
          return [
            ...Array.from({ length: 7 }, (_, i) => {
              const d = addDays(mon, i);
              const list = byDay.get(d) ?? [];
              const hol = holidays[d];
              const cls = ["mc-d", d.slice(0, 7) !== month && "out", i > 4 && "we", hol && "hol", d === today && "today"].filter(Boolean).join(" ");
              return (
                <div key={d} className={cls}>
                  <Link className="mc-n" href={`/misc/plan?d=${d}`} title="이날 일정 보기·넣기">{+d.slice(8, 10)}{hol && <small>{hol}</small>}</Link>
                  {list.slice(0, max).map((it, k) => (
                    <Link key={k} href={it.href} className={`mc-i ${it.kind}${it.done ? " done" : ""}`} style={{ ["--c" as string]: it.color }} title={`${it.time ? `${it.time} ` : ""}${it.title}`}>
                      {KIND_MARK[it.kind]}{it.time && it.time !== "종일" ? <em>{it.time.slice(0, 5)}</em> : null}{it.title}
                    </Link>
                  ))}
                  {list.length > max && <Link className="mc-more" href={`/misc/plan?d=${d}`}>+{list.length - max}건 더</Link>}
                </div>
              );
            }),
            logCol && (
              <Link key={`w${mon}`} href={`/misc/weekly?w=${mon}`} className={`mc-w${log ? " has" : ""}`}>
                <b>{weekTitle(mon)}</b>
                {log && log.rows.length ? (
                  <>
                    <span className="bar"><i style={{ width: `${logAvg(log)}%` }} /></span>
                    <small>{log.rows.length}건 · {logAvg(log)}%</small>
                    <ul>{log.rows.filter((r) => r.task).slice(0, 3).map((r) => <li key={r.id}>{r.task}</li>)}</ul>
                  </>
                ) : <small className="none">{mon <= today ? "✏️ 작성하기" : "—"}</small>}
              </Link>
            ),
          ];
        })}
      </div>
    </div>
  );
}
