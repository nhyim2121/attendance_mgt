/** 지원사업 관리 (관리자만): 위 바로가기 · 왼쪽 폴더(X 드라이브와 같은 7개) · 오른쪽 숫자 카드·목록 · 오른쪽 서랍 등록 */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import { LinksCard } from "@/components/대시/client";
import { Win } from "@/components/대시/win";
import { requireAdminPage } from "@/lib/auth";
import { alertsOf } from "@/lib/대장/logic";
import { bookOf } from "@/lib/대장/books";
import * as store from "@/lib/대장/store";
import { loadLinks } from "@/lib/대시/links";
import { loadEmployees } from "@/lib/store";
import { loadFiles } from "@/lib/총무/mail";
import { currentStage, GRANT_DONE, GRANT_FIELDS, GRANT_FOLDER_COLOR, GRANT_FOLDERS, stageOf, stagePercent } from "@/lib/총무/grants";
import { dayLabel, todayKst } from "@/lib/time";
import GrantDrawer from "./GrantDrawer";

export const metadata = { title: "지원사업 관리 · 총무 · 통합관리시스템" };
type Sp = { folder?: string; year?: string; field?: string; q?: string; edit?: string; new?: string; back?: string };

const won = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(n % 1e8 ? 1 : 0)}억` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}만` : n.toLocaleString()) + "원";

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const book = bookOf("grants")!;
  const today = todayKst();
  const [all, files, links, emps] = await Promise.all([store.loadRows("grants"), loadFiles("lg:"), loadLinks("grants"), loadEmployees()]);
  const folder = GRANT_FOLDERS.includes(sp.folder as never) ? sp.folder! : "";
  const year = sp.year ?? "", field = sp.field ?? "", q = (sp.q ?? "").trim();

  // 주소 만들기 (거르기 유지)
  const href = (p: Partial<Sp>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ folder, year, field, q, ...p })) if (v) u.set(k, v);
    const s = u.toString();
    return `/ga/grants${s ? `?${s}` : ""}`;
  };
  const close = href({ edit: undefined, new: undefined });

  const inFolder = (f: string) => all.filter((r) => (r.data.folder || "7. 기타") === f);
  const years = [...new Set(all.map((r) => r.data.year).filter(Boolean))].sort().reverse();
  const rows = all
    .filter((r) => !folder || (r.data.folder || "7. 기타") === folder)
    .filter((r) => !year || r.data.year === year)
    .filter((r) => !field || r.data.field === field)
    .filter((r) => !q || Object.values(r.data).some((v) => v.includes(q)))
    .sort((a, b) => (b.data.year ?? "").localeCompare(a.data.year ?? "") || (b.day ?? "").localeCompare(a.day ?? "") || b.id - a.id);

  const live = all.filter((r) => !GRANT_DONE.includes(r.data.folder ?? ""));
  const due = live.flatMap((r) => alertsOf(book, r.data, today).map((a) => ({ r, a }))).sort((x, y) => x.a.left - y.a.left);
  const thisYear = today.slice(0, 4);
  const won1 = all.filter((r) => ["2. 선정·진행", "3. 완료"].includes(r.data.folder ?? "") && r.data.year === thisYear).reduce((t, r) => t + (+r.data.amount || 0), 0);

  const editId = Number(sp.edit) || 0;
  const editing = editId ? all.find((r) => r.id === editId) : undefined;
  const open = !!sp.new || !!editing;

  return (
    <div className="ud">
      <PageHead href="/ga/grants" desc="X 드라이브 「12. 지원사업 관리」와 같은 폴더로 나눠 신청부터 완료까지 관리합니다. 사업 종료 30일 전·다음 할 일 14일 전에 알려 줍니다.">
        <Link className="btn primary" href={href({ new: "1" })} scroll={false}>+ 지원사업 등록</Link>
        <a className="btn" href="/api/ledger/grants">엑셀</a>
      </PageHead>

      <div className="u-grid">
        <LinksCard scope="grants" links={links} className="s12 gr-links" />
      </div>

      <div className="gr-wrap">
        <nav className="gr-side" aria-label="지원사업 폴더">
          <Link href={href({ folder: "" })} className={!folder ? "on" : ""}><span>📁 전체</span><b>{all.length}</b></Link>
          {GRANT_FOLDERS.map((f) => (
            <Link key={f} href={href({ folder: f })} className={folder === f ? "on" : ""} style={{ ["--c" as string]: GRANT_FOLDER_COLOR[f] }}>
              <span><i />{f}</span><b>{inFolder(f).length}</b>
            </Link>
          ))}
          {years.length > 0 && <>
            <div className="gr-side-h">연도</div>
            <div className="gr-years">
              <Link href={href({ year: "" })} className={!year ? "on" : ""}>전체</Link>
              {years.map((y) => <Link key={y} href={href({ year: y })} className={year === y ? "on" : ""}>{y}</Link>)}
            </div>
          </>}
          <Link href={href({ new: "1" })} className="gr-add" scroll={false}>+ 지원사업 등록</Link>
        </nav>

        <div className="gr-main">
          <div className="gr-cards">
            {(["1. 신청중", "2. 선정·진행", "3. 완료", "4. 미선정"] as const).map((f) => {
              const n = inFolder(f).length;
              const y = inFolder(f).filter((r) => r.data.year === thisYear).length;
              return (
                <Link key={f} href={href({ folder: f })} className="gr-card" style={{ ["--c" as string]: GRANT_FOLDER_COLOR[f] }}>
                  <span>{f.slice(3)}</span><b>{n}</b><small>올해 {y}건</small>
                </Link>
              );
            })}
            <div className="gr-card" style={{ ["--c" as string]: "#b45309" }}>
              <span>{thisYear}년 지원금</span><b style={{ fontSize: "1.4rem" }}>{won(won1)}</b><small>선정·진행 + 완료</small>
            </div>
          </div>

          {due.length > 0 && (
            <Win en="DUE" ko="다가오는 기한" className="gr-due">
              <ul>{due.slice(0, 6).map(({ r, a }) => (
                <li key={`${r.id}${a.field}`}>
                  <Link href={`/ga/grants/item?id=${r.id}`}><b>{r.data.name}</b> · {a.label}</Link>
                  <span className={`fd-tag ${a.left <= 7 ? "r" : "o"}`}>{a.left < 0 ? `${-a.left}일 지남` : a.left === 0 ? "오늘" : `D-${a.left}`} ({dayLabel(a.day)})</span>
                </li>
              ))}</ul>
            </Win>
          )}

          <Win en="LIST" ko={`${folder || "전체"}${year ? ` · ${year}년` : ""} · ${rows.length}건`}>
            <form className="gr-filter" action="/ga/grants">
              {folder && <input type="hidden" name="folder" value={folder} />}
              {year && <input type="hidden" name="year" value={year} />}
              <select name="field" defaultValue={field}>
                <option value="">분야 전체</option>{GRANT_FIELDS.map((x) => <option key={x}>{x}</option>)}
              </select>
              <input name="q" defaultValue={q} placeholder="사업명·기관·메모 찾기" />
              <button className="btn sm">찾기</button>
              {(q || field) && <Link href={href({ q: "", field: "" })} className="btn sm">지우기</Link>}
            </form>
            <div className="tbl-wrap">
              <table className="tbl gr-tbl">
                <thead><tr><th>연도</th>{!folder && <th>폴더</th>}<th>사업명</th><th>주관기관</th><th>분야</th><th>진행</th><th>사업 기간</th><th>지원금</th><th>다음 할 일</th><th>📎</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const d = r.data, fl = files.get(store.rowRef(r.id)) ?? [];
                    const al = alertsOf(book, d, today);
                    return (
                      <tr key={r.id} className={editId === r.id ? "editing" : ""}>
                        <td>{d.year}</td>
                        {!folder && <td><span className="gr-chip" style={{ ["--c" as string]: GRANT_FOLDER_COLOR[d.folder ?? ""] ?? "#6b7280" }}>{(d.folder ?? "7. 기타").slice(3)}</span></td>}
                        <td className="gr-name"><Link href={`/ga/grants/item?id=${r.id}`}>{d.name}</Link>{d.result && <small> · {d.result}</small>}</td>
                        <td>{d.agency}</td>
                        <td className="fd-sub">{d.field}</td>
                        <td className="gr-prog" title={stageOf(currentStage(d))?.label}>
                          <span>{stageOf(currentStage(d))?.emoji} {stageOf(currentStage(d))?.label}</span>
                          <i><b style={{ width: `${stagePercent(currentStage(d))}%`, background: GRANT_FOLDER_COLOR[d.folder ?? ""] ?? "#6b7280" }} /></i>
                        </td>
                        <td>{d.from || d.to ? `${d.from ? dayLabel(d.from) : ""} ~ ${d.to ? dayLabel(d.to) : ""}` : ""}</td>
                        <td style={{ textAlign: "right" }}>{d.amount ? won(+d.amount) : ""}</td>
                        <td>{d.next}{d.nextAt && <span className={`fd-tag ${al.some((a) => a.field === "nextAt" && a.left <= 7) ? "r" : ""}`} style={{ marginLeft: 4 }}>{dayLabel(d.nextAt)}</span>}</td>
                        <td>{(fl.length + [...files.entries()].filter(([k]) => k.startsWith(`${store.rowRef(r.id)}/`)).reduce((t, [, l]) => t + l.length, 0)) || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!rows.length && <p className="fd-empty">{all.length ? "조건에 맞는 지원사업이 없습니다." : "아직 등록한 지원사업이 없습니다. [+ 지원사업 등록]으로 시작하세요."}</p>}
          </Win>
        </div>
      </div>

      {open && (
        <GrantDrawer key={editing?.id ?? "new"} id={editing?.id ?? 0} v={editing?.data ?? {}} close={sp.back === "item" && editing ? `/ga/grants/item?id=${editing.id}` : close}
          emps={emps.filter((e) => !e.leaveDate).map((e) => e.name)}
          files={(editing ? files.get(store.rowRef(editing.id)) ?? [] : []).map((a) => ({ id: a.id, fileName: a.fileName, size: a.size }))} />
      )}
    </div>
  );
}
