/** 한 달 달력 (월요일 시작). 휴가 캘린더·근태 캘린더 공용. */
import { daysInMonth, type DateStr, makeDate, weekday } from "@/lib/time";

export interface CalEntry {
  day: DateStr;
  type: string; // 색 (t-<유형>)
  text: React.ReactNode;
  title?: string; // 마우스를 올리면 보이는 설명
  color?: string; // 직접 정한 색 (없으면 유형 색)
}

export default function MonthCalendar({ month, today, entries, holidays }: {
  month: string; today: DateStr; entries: CalEntry[]; holidays: Record<DateStr, string | true>; // true = 주말 등 이름 없는 휴일
}) {
  const first = `${month}-01`, n = daysInMonth(month);
  const cells: (DateStr | null)[] = [...Array(weekday(first)).fill(null),
    ...Array.from({ length: n }, (_, i) => makeDate(+month.slice(0, 4), +month.slice(5), i + 1)!)];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="cal">
      {["월", "화", "수", "목", "금", "토", "일"].map((w) => <div key={w} className="cal-h">{w}</div>)}
      {cells.map((d, i) => {
        if (!d) return <div key={i} className="cal-d off" />;
        const hol = holidays[d];
        return (
          <div key={i} className={`cal-d${hol ? " hol" : ""}${d === today ? " today" : ""}`}>
            <div className="cal-n">{+d.slice(8)}{typeof hol === "string" && <small> {hol}</small>}</div>
            {entries.filter((e) => e.day === d).map((e, j) => (
              <div key={j} className={`cal-i t-${e.type}`} title={e.title}
                style={e.color ? { color: e.color, background: `${e.color}1a` } : undefined}>{e.text}</div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
