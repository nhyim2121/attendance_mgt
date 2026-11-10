/** 업무 대장 공통 화면: 적기·고치기·복사, 거르기·찾기, 만기 알림, 첨부, 엑셀 내려받기·가져오기 */
import PageHead from "@/components/대시/PageHead";
import SiteLinks from "@/components/대시/SiteLinks";
import { hrSlugOf } from "@/lib/대시/menu";
import { HR_SITES } from "@/lib/인사노무/sites";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hrefWith } from "@/components/Filters";
import { ParamSelect } from "@/components/ParamControls";
import { Metric } from "@/components/ui";
import { requireAdminPage, requireBidPage } from "@/lib/auth";
import { type Area, bookHref, bookOf, type Field } from "@/lib/대장/books";
import { GUIDE } from "@/lib/대장/guide";
import { alertsOf, filterRows, isClosed, rowName, type Sp } from "@/lib/대장/logic";
import * as store from "@/lib/대장/store";
import { loadFiles } from "@/lib/총무/mail";
import { loadEmployees } from "@/lib/store";
import { dayLabel, todayKst } from "@/lib/time";
import { DeleteFile } from "@/app/(app)/(ga)/ga/mail/forms";
import { AttachRow, DeleteRow, ImportForm, LedgerForm, UndoImport } from "./forms";

export type { Sp };
const one = (v: Sp[string]) => (typeof v === "string" ? v : "");
const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const dday = (n: number) => (n < 0 ? `${-n}일 지남` : n === 0 ? "오늘" : `D-${n}`);

export function show(f: Field, v: string | undefined): React.ReactNode {
  if (!v) return "";
  if (f.type === "date") return dayLabel(v, true);
  if (f.type === "money") return won(+v);
  if (f.type === "number") return (+v).toLocaleString("ko-KR");
  return v;
}

export default async function LedgerView({ area, bookKey, sp }: { area: Area; bookKey: string; sp: Sp }) {
  await (bookKey === "bids" ? requireBidPage() : requireAdminPage());
  const book = bookOf(bookKey);
  if (!book || book.area !== area) notFound();
  const today = todayKst();
  const path = bookHref(book);
  const [all, files, emps, batches] = await Promise.all([store.loadRows(book.key), loadFiles("lg:"), loadEmployees(), store.batchesOf(book.key)]);
  const rows = filterRows(book, all, sp);
  const editId = Number(sp.edit) || 0, copyId = Number(sp.copy) || 0;
  const editing = editId ? all.find((r) => r.id === editId) : undefined;
  const copying = !editing && copyId ? all.find((r) => r.id === copyId) : undefined;
  const back = hrefWith(sp, path, { edit: null, copy: null });
  const cols = book.fields.filter((f) => !f.hide);
  const moneys = book.fields.filter((f) => f.type === "money");
  const alerts = all.flatMap((r) => alertsOf(book, r.data, today).map((a) => ({ r, a }))).sort((x, y) => x.a.left - y.a.left);
  const years = [...new Set(all.map((r) => (r.day ?? "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const closedN = book.closed ? all.filter((r) => isClosed(book, r.data)).length : 0;

  // 입력 추천: 직원 명부, suggest 칸 옵션 + 예전에 적은 값, 짧은 글 칸은 예전 값
  const lists: Record<string, string[]> = {};
  for (const f of book.fields) {
    if (f.type !== "text" && f.type !== "suggest") continue;
    const seen = [...new Set([...(f.options ?? []), ...all.map((r) => r.data[f.k]).filter(Boolean)])];
    if (seen.length && seen.length <= 300) lists[f.k] = seen;
  }
  const empNames = emps.filter((e) => !e.leaveDate || e.leaveDate >= today).map((e) => e.name);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "edit" && k !== "copy") as [string, string][]).toString();
  const fromV = editing?.data ?? (copying ? Object.fromEntries(Object.entries(copying.data).filter(([k]) => k !== book.day)) : {});

  return (
    <>
      <PageHead href={bookHref(book)} title={book.title} desc={book.desc} />
      <div className="u-guide">
        <b>📘 업무 설명</b>
        <p>{GUIDE[book.key] ?? book.desc}</p>
        {(book.fields.some((f) => f.alert) || book.closed) && (
          <ul>
            {book.fields.filter((f) => f.alert).map((f) => <li key={f.k}>⏰ <b>{f.label}</b>이(가) {f.alert}일 안으로 다가오면 위쪽과 대시보드 &lsquo;할 일&rsquo;에 알림</li>)}
            {book.closed && <li>✅ {book.fields.find((f) => f.k === book.closed!.k)?.label ?? "상태"}가 &lsquo;{book.closed.values.join("·")}&rsquo;이면 끝난 일로 보고 알림을 멈춤</li>}
          </ul>
        )}
      </div>
      {area === "hr" && <SiteLinks sites={HR_SITES[hrSlugOf(path) ?? ""] ?? []} />}

      {alerts.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">다가오는 기한 <span className="muted" style={{ fontWeight: 400 }}>{alerts.length}건</span></div>
          <table className="tbl"><tbody>{alerts.map(({ r, a }) => (
            <tr key={`${r.id}${a.field}`}>
              <td className={a.level === "near" ? "orange" : "red"} style={{ fontWeight: 700, width: 90 }}>{dday(a.left)}</td>
              <td style={{ width: 110 }}>{dayLabel(a.day, true)}</td>
              <td><Link href={`${hrefWith(sp, path, { edit: String(r.id), copy: null })}#form`}><b>{rowName(book, r.data)}</b></Link> · {a.label}</td>
            </tr>
          ))}</tbody></table>
        </div>
      )}

      <div className="card" id="form">
        <div className="card-title">{editing ? `「${rowName(book, editing.data)}」 고치기` : copying ? `「${rowName(book, copying.data)}」처럼 새로 적기` : "새로 적기"}</div>
        <LedgerForm key={editing?.id ?? (copying ? `c${copying.id}` : "new")} book={book.key} fields={book.fields} id={editing?.id} back={back}
          v={editing || copying ? fromV : { [book.day]: book.fields.find((f) => f.k === book.day)?.type === "date" ? today : "" }} emps={empNames} lists={lists} />
      </div>

      <div className="metrics" style={{ marginTop: 16 }}>
        <Metric label="보이는 줄" value={`${rows.length}건`} />
        {moneys.map((f) => <Metric key={f.k} label={`${f.label} 합계`} value={won(rows.reduce((t, r) => t + (+r.data[f.k] || 0), 0))} />)}
      </div>

      <div className="filters">
        {years.length > 0 && <Suspense><ParamSelect name="y" label="연도" value={one(sp.y)} options={[["", "전체"], ...years.map((v) => [v, `${v}년`] as [string, string])]} /></Suspense>}
        {(book.filters ?? []).map((k) => {
          const f = book.fields.find((x) => x.k === k)!;
          const opts = [...new Set([...(f.options ?? []), ...all.map((r) => r.data[k]).filter(Boolean)])];
          return <Suspense key={k}><ParamSelect name={`fl_${k}`} label={f.label} value={one(sp[`fl_${k}`])} options={[["", "전체"], ...opts.map((o) => [o, o] as [string, string])]} /></Suspense>;
        })}
        <form className="field" action={path}>
          찾기
          {Object.entries(sp).filter(([k, v]) => typeof v === "string" && !["q", "edit", "copy"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}
          <input type="search" name="q" defaultValue={one(sp.q)} placeholder="아무 칸이나" />
        </form>
        {book.closed && (
          <label className="check">
            <Link href={hrefWith(sp, path, { closed: one(sp.closed) === "1" ? null : "1" })} scroll={false}>
              <input type="checkbox" readOnly checked={one(sp.closed) === "1"} /> {book.closed.values.join("·")}도 보기 ({closedN})
            </Link>
          </label>
        )}
        <a className="btn" href={`/api/ledger/${book.key}${qs ? `?${qs}` : ""}`} style={{ marginLeft: "auto" }}>⬇ 엑셀로 내려받기</a>
      </div>

      <div className="card">
        <div className="tbl-wrap"><table className="tbl ga-mail">
          <thead><tr>{cols.map((f) => <th key={f.k}>{f.label}</th>)}<th>첨부</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const fl = files.get(store.rowRef(r.id)) ?? [];
              const al = new Map(alertsOf(book, r.data, today).map((a) => [a.field, a]));
              return (
                <tr key={r.id} className={`${editId === r.id ? "editing" : ""}${isClosed(book, r.data) ? " inactive" : ""}`}>
                  {cols.map((f) => {
                    const a = al.get(f.k);
                    return (
                      <td key={f.k} style={f.type === "textarea" || f.wide ? { whiteSpace: "pre-line", minWidth: 160 } : f.type === "money" || f.type === "number" ? { textAlign: "right" } : undefined}>
                        {f.k === book.title1 ? (book.detail ? <Link href={`${book.detail}?id=${r.id}`}><b>{show(f, r.data[f.k])}</b> 📄</Link> : <b>{show(f, r.data[f.k])}</b>) : show(f, r.data[f.k])}
                        {a && <div className={a.level === "near" ? "orange" : "red"} style={{ fontSize: ".78rem" }}>{dday(a.left)}</div>}
                      </td>
                    );
                  })}
                  <td style={{ whiteSpace: "normal" }}>
                    {fl.map((a) => (
                      <div key={a.id} className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                        <a className="file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName} <small>{kb(a.size)}</small></a>
                        <DeleteFile id={a.id} name={a.fileName} />
                      </div>
                    ))}
                    <AttachRow id={r.id} />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <Link className="btn sm" href={`${hrefWith(sp, path, { edit: String(r.id), copy: null })}#form`}>고치기</Link>
                      <Link className="btn sm" title="비슷하게 새로 적기" href={`${hrefWith(sp, path, { copy: String(r.id), edit: null })}#form`}>복사</Link>
                      <DeleteRow id={r.id} name={rowName(book, r.data)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        {!rows.length && <p className="muted">{all.length ? "조건에 맞는 줄이 없습니다." : "아직 적은 내용이 없습니다. 위에서 처음 한 줄을 적거나, 아래에서 예전 엑셀 대장을 가져오세요."}</p>}
        {book.fields.some((f) => f.hide) && <p className="caption" style={{ marginBottom: 0 }}>표에는 줄였지만 {book.fields.filter((f) => f.hide).map((f) => f.label).join("·")} 칸도 있습니다 (고치기·엑셀에서 보임).</p>}
      </div>

      <details className="fold" style={{ marginTop: 16 }}>
        <summary>예전 엑셀 대장 가져오기</summary>
        <div style={{ marginTop: 10 }}>
          <p className="caption">지금까지 쓰던 엑셀을 그대로 올리면 첫 줄 머리글({book.fields.slice(0, 6).map((f) => f.label).join(", ")} …)을 보고 칸을 맞춰 넣습니다. 잘못 들어오면 아래에서 통째로 되돌릴 수 있습니다.</p>
          <ImportForm book={book.key} />
          {batches.length > 0 && (
            <table className="tbl" style={{ marginTop: 12 }}><thead><tr><th>가져온 파일</th><th /></tr></thead>
              <tbody>{batches.map((b) => <tr key={b.batch}><td>{b.batch}</td><td><UndoImport book={book.key} batch={b.batch} n={b.n} /></td></tr>)}</tbody></table>
          )}
        </div>
      </details>
    </>
  );
}
