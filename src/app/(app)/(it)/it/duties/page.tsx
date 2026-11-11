/** 보안전산 업무분장·업무 목록: IT-1~IT-7 묶음마다 하는 일·주기·관련 대장(기록 수·기한) */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import { Win } from "@/components/대시/win";
import { requireAdminPage } from "@/lib/auth";
import { bookHref, bookOf } from "@/lib/대장/books";
import { bookStats } from "@/lib/대시/data";
import { emojiOf } from "@/lib/대시/menu";
import { IT_DUTIES, IT_ROUTINE_BOOK } from "@/lib/보안전산/duties";

export const metadata = { title: "업무분장 · 보안전산 · 통합관리시스템" };

const CYCLE_TONE: Record<string, string> = { 매일: "#be123c", 매주: "#c2410c", 매월: "#b45309", 분기: "#0e7490", 반기: "#0c3994", 매년: "#4338ca" };

export default async function Page() {
  await requireAdminPage();
  const stats = await bookStats("it");
  const st = (k: string) => stats.find((s) => s.key === k);
  const routine = bookOf(IT_ROUTINE_BOOK)!;
  return (
    <div className="ud">
      <PageHead href="/it/duties"
        desc={<>보안전산(IT) 업무를 7개 묶음으로 나눴습니다. 묶음마다 하는 일·주기와 기록할 대장이 있습니다. 반복 업무는 <Link href={bookHref(routine)}>정기 업무 대장</Link>에 다음 예정일을 적어 두면 대시보드에 기한으로 뜹니다.</>} />
      <div className="u-grid">
        {IT_DUTIES.map((g) => (
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
            <div className="it-books">
              {g.books.map((k) => {
                const b = bookOf(k)!, s = st(k);
                return (
                  <Link key={k} href={bookHref(b)} className="it-book">
                    <span>{emojiOf(k)} {b.title}</span>
                    <small>{s ? `기록 ${s.total}건${s.alerts ? ` · 기한 ${s.alerts}건` : ""}` : ""}</small>
                  </Link>
                );
              })}
            </div>
          </Win>
        ))}
      </div>
      <p><Link href="/it">← 보안전산 대시보드</Link></p>
    </div>
  );
}
