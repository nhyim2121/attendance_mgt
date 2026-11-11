/** 지원사업 한 건: 단계 그림(어디까지 왔나) · 진행률 도넛 · 단계별 서류 준비 그래프·표 · 단계 탭(서류 체크·첨부) */
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHead from "@/components/대시/PageHead";
import { Win } from "@/components/대시/win";
import { requireAdminPage } from "@/lib/auth";
import * as store from "@/lib/대장/store";
import { loadFiles } from "@/lib/총무/mail";
import {
  currentStage, docRef, docsOfStage, GRANT_ENDS, GRANT_FOLDER_COLOR, GRANT_STAGES, type GrantStage, readDocs, stageOf, stagePercent,
} from "@/lib/총무/grants";
import { dayLabel } from "@/lib/time";
import StagePanel, { type DocView } from "../StagePanel";
import RequestPanel, { type ReqView } from "../RequestPanel";
import { daysTo } from "@/lib/대장/logic";
import { GEN_LABEL, genKindOf, readReqs, reqRef } from "@/lib/총무/grants";
import { todayKst } from "@/lib/time";

export const metadata = { title: "지원사업 · 총무 · 통합관리시스템" };
const won = (n: number) => `${n.toLocaleString()}원`;

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; tab?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const id = Number(sp.id) || 0;
  const row = id ? await store.loadRow(id) : null;
  if (!row || row.book !== "grants") notFound();
  const d = row.data;
  const [stageFiles, ownFiles] = await Promise.all([loadFiles(`${store.rowRef(id)}/`), loadFiles(store.rowRef(id))]);
  const own = ownFiles.get(store.rowRef(id)) ?? [];
  const docs = readDocs(d);
  const cur = currentStage(d);
  const ended = GRANT_ENDS.find((s) => s.key === cur);
  // 보이는 단계: 정상 7단계 + (끝났으면) 미선정·협약 해지
  const stages: GrantStage[] = [...GRANT_STAGES, ...(ended ? [ended] : [])];
  const tab = stages.find((s) => s.key === sp.tab) ? sp.tab! : cur;
  const curIdx = GRANT_STAGES.findIndex((s) => s.key === cur);

  const viewOf = (st: GrantStage): DocView[] => docsOfStage(st, docs).map((name) => {
    const files = (stageFiles.get(docRef(id, st.key, name)) ?? []).map((a) => ({ id: a.id, fileName: a.fileName, size: a.size, createdAt: a.createdAt }));
    return { name, extra: !st.docs.includes(name), done: (docs[st.key]?.done ?? []).includes(name) || files.length > 0, files };
  });
  const views = new Map(stages.map((s) => [s.key, viewOf(s)]));
  const fileCount = [...stageFiles.values()].reduce((t, l) => t + l.length, 0) + own.length;
  const pct = stagePercent(cur);
  const allDocs = [...views.values()].flat();
  const docPct = allDocs.length ? Math.round((allDocs.filter((x) => x.done).length / allDocs.length) * 100) : 0;
  const color = GRANT_FOLDER_COLOR[d.folder ?? ""] ?? "#0c3994";
  const R = 52, C = 2 * Math.PI * R;
  const tabNext = (k: string) => { const i = GRANT_STAGES.findIndex((s) => s.key === k); return i >= 0 && i < GRANT_STAGES.length - 1 ? GRANT_STAGES[i + 1] : undefined; };
  const st = stageOf(tab)!;
  const today = todayKst();
  const reqs: ReqView[] = readReqs(d).map((rq) => ({
    id: rq.id, title: rq.title, from: rq.from, due: rq.due, left: rq.due ? daysTo(today, rq.due) : null,
    items: rq.items.map((it) => {
      const g = genKindOf(it.name);
      return { name: it.name, note: it.note ?? "", na: !!it.na, done: !!it.done, gen: g ? GEN_LABEL[g] : null,
        files: (stageFiles.get(reqRef(id, rq.id, it.name)) ?? []).map((a) => ({ id: a.id, fileName: a.fileName, size: a.size })) };
    }),
  }));

  return (
    <div className="ud">
      <PageHead href="/ga/grants" title={d.name} mark={d.folder}
        desc={[d.year && `${d.year}년`, d.agency, d.field].filter(Boolean).join(" · ") || "지원사업"}>
        <Link className="btn" href={`/ga/grants?edit=${id}&back=item`} scroll={false}>✏️ 고치기</Link>
        <Link className="btn" href={`/ga/grants${d.folder ? `?folder=${encodeURIComponent(d.folder)}` : ""}`}>← 목록</Link>
      </PageHead>

      <div className="u-grid">
        {/* 그림: 단계 흐름 */}
        <Win en="PROGRESS" ko="어디까지 왔나" className="s12">
          <ol className="gp-steps">
            {GRANT_STAGES.map((s, i) => {
              // 끝난 사업: 미선정은 신청·평가까지, 협약 해지는 사업 수행까지 지나온 것으로 본다
              const reached = ended ? (ended.key === "fail" ? 2 : 4) : curIdx;
              const state = ended ? (i <= reached ? "done" : "todo") : i < curIdx ? "done" : i === curIdx ? "now" : "todo";
              const v = views.get(s.key)!;
              return (
                <li key={s.key} className={`${state}${tab === s.key ? " sel" : ""}`}>
                  <Link href={`/ga/grants/item?id=${id}&tab=${s.key}`} scroll={false}>
                    <span className="dot">{state === "done" ? "✓" : s.emoji}</span>
                    <b>{s.label}</b>
                    <small>서류 {v.filter((x) => x.done).length}/{v.length}</small>
                  </Link>
                </li>
              );
            })}
            {ended && (
              <li className={`end${tab === ended.key ? " sel" : ""}`}>
                <Link href={`/ga/grants/item?id=${id}&tab=${ended.key}`} scroll={false}><span className="dot">{ended.emoji}</span><b>{ended.label}</b><small>종료</small></Link>
              </li>
            )}
          </ol>
        </Win>

        {/* 차트: 진행률 도넛 */}
        <Win en="CHART" ko="진행률" className="s4">
          <div className="gp-donut">
            <svg viewBox="0 0 130 130" width="150" height="150" role="img" aria-label={`단계 진행률 ${pct}%`}>
              <circle cx="65" cy="65" r={R} fill="none" stroke="#e5e7eb" strokeWidth="14" />
              <circle cx="65" cy="65" r={R} fill="none" stroke={ended ? "#9ca3af" : color} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 65 65)" />
              <text x="65" y="62" textAnchor="middle" fontSize="26" fontWeight="800" fill="#1f2937">{pct}%</text>
              <text x="65" y="84" textAnchor="middle" fontSize="11" fill="#6b7280">{stageOf(cur)!.label}</text>
            </svg>
            <ul>
              <li><span>단계</span><b>{ended ? ended.label : `${curIdx + 1} / ${GRANT_STAGES.length}`}</b></li>
              <li><span>서류 준비</span><b>{docPct}%</b></li>
              <li><span>첨부 파일</span><b>{fileCount}개</b></li>
            </ul>
          </div>
        </Win>

        {/* 그래프 + 표: 단계별 서류 준비 */}
        <Win en="DOCS" ko="단계별 서류 준비" className="s4">
          <table className="gp-bars">
            <tbody>
              {stages.map((s) => {
                const v = views.get(s.key)!, n = v.filter((x) => x.done).length;
                return (
                  <tr key={s.key} className={s.key === cur ? "now" : ""}>
                    <th><Link href={`/ga/grants/item?id=${id}&tab=${s.key}`} scroll={false}>{s.label}</Link></th>
                    <td><span className="gp-bar"><i style={{ width: `${v.length ? (n / v.length) * 100 : 0}%`, background: n === v.length && v.length ? "#15803d" : color }} /></span></td>
                    <td className="n">{n}/{v.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Win>

        {/* 표: 사업 정보 */}
        <Win en="INFO" ko="사업 정보" className="s4">
          <dl className="gp-info">
            <dt>폴더</dt><dd><span className="gr-chip" style={{ ["--c" as string]: color }}>{d.folder}</span></dd>
            <dt>신청일</dt><dd>{d.applied ? dayLabel(d.applied) : "-"}</dd>
            <dt>사업 기간</dt><dd>{d.from || d.to ? `${d.from ? dayLabel(d.from) : ""} ~ ${d.to ? dayLabel(d.to) : ""}` : "-"}</dd>
            <dt>지원금</dt><dd>{d.amount ? won(+d.amount) : "-"}{d.self ? ` (자부담 ${won(+d.self)})` : ""}</dd>
            <dt>담당</dt><dd>{d.owner || "-"}</dd>
            <dt>다음 할 일</dt><dd>{d.next ? `${d.next}${d.nextAt ? ` (${dayLabel(d.nextAt)})` : ""}` : "-"}</dd>
            {d.result && <><dt>결과</dt><dd>{d.result}</dd></>}
            {d.path && <><dt>X 드라이브</dt><dd className="fd-sub">{d.path}</dd></>}
          </dl>
          {d.support && <p className="gp-note">{d.support}</p>}
          {d.note && <p className="gp-note">📝 {d.note}</p>}
          {own.length > 0 && <div className="gs-files">{own.map((a) => <a key={a.id} className="gs-file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📄 {a.fileName}</a>)}</div>}
        </Win>

        {/* 자료 요청 목록 (예: 컨설팅 기관 기초자료 요청 메일) */}
        <Win en="REQUESTS" ko={`자료 요청 목록${reqs.length ? ` · ${reqs.length}건` : ""}`} className="s12">
          <RequestPanel id={id} reqs={reqs} />
        </Win>

        {/* 단계 탭 */}
        <Win en="STAGES" ko="단계별 준비 서류·첨부" className="s12">
          <nav className="gp-tabs">
            {stages.map((s) => {
              const v = views.get(s.key)!;
              return (
                <Link key={s.key} href={`/ga/grants/item?id=${id}&tab=${s.key}`} scroll={false} className={`${tab === s.key ? "on" : ""}${s.key === cur ? " cur" : ""}`}>
                  {s.emoji} {s.label} <small>{v.filter((x) => x.done).length}/{v.length}</small>{s.key === cur && <em>현재</em>}
                </Link>
              );
            })}
          </nav>
          <StagePanel key={tab} id={id} stage={tab} label={st.label} docs={views.get(tab)!} current={tab === cur}
            next={tab === cur && !ended ? tabNext(tab) : undefined} isEnd={!!ended || GRANT_ENDS.some((s) => s.key === tab)} />
        </Win>
      </div>
    </div>
  );
}
