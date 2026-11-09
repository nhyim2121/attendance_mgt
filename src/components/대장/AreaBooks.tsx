/** 영역 홈에 붙는 대장 카드 묶음 + 다가오는 기한 */
import Link from "next/link";
import { type Area, bookHref, booksIn } from "@/lib/대장/books";
import { alertsOf, rowName } from "@/lib/대장/logic";
import { loadBooks } from "@/lib/대장/store";
import { dayLabel, todayKst } from "@/lib/time";

const dday = (n: number) => (n < 0 ? `${-n}일 지남` : n === 0 ? "오늘" : `D-${n}`);

export default async function AreaBooks({ area, title = "업무 대장" }: { area: Area; title?: string }) {
  const books = booksIn(area);
  const today = todayKst();
  const rows = await loadBooks(books.map((b) => b.key));
  const alerts = books.flatMap((b) => rows.filter((r) => r.book === b.key)
    .flatMap((r) => alertsOf(b, r.data, today).map((a) => ({ b, r, a })))).sort((x, y) => x.a.left - y.a.left);
  return (
    <>
      {alerts.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">다가오는 기한 <span className="muted" style={{ fontWeight: 400 }}>{alerts.length}건</span></div>
          <table className="tbl"><tbody>{alerts.map(({ b, r, a }) => (
            <tr key={`${r.id}${a.field}`}>
              <td className={a.level === "near" ? "orange" : "red"} style={{ fontWeight: 700, width: 90 }}>{dday(a.left)}</td>
              <td style={{ width: 110 }}>{dayLabel(a.day, true)}</td>
              <td><Link href={`${bookHref(b)}?edit=${r.id}#form`}><b>{rowName(b, r.data)}</b></Link> · {a.label} <span className="muted">({b.title})</span></td>
            </tr>
          ))}</tbody></table>
        </div>
      )}
      <h2 className="cert-cat" style={{ marginTop: 18 }}>{title}</h2>
      <div className="ga-home">
        {books.map((b) => {
          const n = rows.filter((r) => r.book === b.key).length;
          const due = alerts.filter((x) => x.b.key === b.key).length;
          return (
            <Link key={b.key} href={bookHref(b)} className="card cert-card" style={{ borderLeftColor: due ? "var(--orange)" : "#0e7490" }}>
              <b>{b.title}</b>
              <div>{b.desc}</div>
              <div className="muted" style={{ fontSize: ".82rem" }}>{n}건{due ? <span className="orange"> · 기한 {due}건</span> : ""}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
