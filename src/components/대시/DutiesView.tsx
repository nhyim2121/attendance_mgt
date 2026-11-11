/** 영역별 업무분장·업무 목록 화면: 묶음마다 하는 일·주기, 관련 대장(기록 수·기한)·화면 바로가기 (설정: src/lib/대시/duties.ts) */
import Link from "next/link";
import PageHead from "./PageHead";
import { Win } from "./win";
import { type Area, bookHref, bookOf } from "@/lib/대장/books";
import { bookStats } from "@/lib/대시/data";
import { DUTIES, DUTY_HREF, type DutyArea, ROUTINE_BOOK } from "@/lib/대시/duties";
import { emojiOf, menuOf } from "@/lib/대시/menu";

const CYCLE_TONE: Record<string, string> = { 매일: "#be123c", 매주: "#c2410c", 매월: "#b45309", 분기: "#0e7490", 반기: "#0c3994", 매년: "#4338ca" };

export default async function DutiesView({ area }: { area: DutyArea }) {
  const m = menuOf(area);
  const groups = DUTIES[area];
  // 묶음이 가리키는 대장은 다른 영역 것일 수 있다 (예: 총무 3번 → 보안전산)
  const areas = [...new Set(groups.flatMap((g) => g.books).map((k) => bookOf(k)!.area))] as Area[];
  const stats = (await Promise.all(areas.map((a) => bookStats(a)))).flat();
  const st = (k: string) => stats.find((s) => s.key === k);
  const routine = bookOf(ROUTINE_BOOK[area])!;
  return (
    <div className="ud">
      <PageHead href={DUTY_HREF[area]}
        desc={<>{m.label} 업무를 {groups.length}개 묶음으로 나눴습니다. 묶음마다 하는 일·주기와 기록할 대장이 있습니다. 반복 업무는 <Link href={bookHref(routine)}>{routine.title}</Link> 대장에 다음 예정일을 적어 두면 대시보드에 기한으로 뜹니다.</>} />
      <div className="u-grid">
        {groups.map((g) => (
          <Win key={g.no} en={g.no} ko={`${g.emoji} ${g.name}`} className="s6">
            <span id={g.no} />
            <p className="fd-sub" style={{ margin: "0 0 8px" }}>{g.desc}</p>
            <table className="tbl it-duty">
              <thead><tr><th>하는 일</th><th>주기</th></tr></thead>
              <tbody>
                {g.duties.map((d) => (
                  <tr key={d.task}>
                    <td style={{ whiteSpace: "normal" }}>{d.task}{d.note && <div className="fd-sub">{d.note}</div>}</td>
                    <td style={{ color: CYCLE_TONE[d.cycle] ?? "#6b7280", fontWeight: 700, whiteSpace: "nowrap" }}>{d.cycle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(g.books.length > 0 || (g.links?.length ?? 0) > 0) && (
              <div className="it-books">
                {(g.links ?? []).map(([label, href]) => (
                  <Link key={href} href={href} className="it-book"><span>{emojiOf(href)} {label}</span><small>화면</small></Link>
                ))}
                {g.books.map((k) => {
                  const b = bookOf(k)!, s = st(k);
                  return (
                    <Link key={k} href={bookHref(b)} className="it-book">
                      <span>{emojiOf(k)} {b.title}</span>
                      <small>{s ? `기록 ${s.total}건${s.alerts ? ` · 기한 ${s.alerts}건` : ""}` : "대장"}</small>
                    </Link>
                  );
                })}
              </div>
            )}
          </Win>
        ))}
      </div>
      <p><Link href={m.dash}>← {m.label} 대시보드</Link></p>
    </div>
  );
}
