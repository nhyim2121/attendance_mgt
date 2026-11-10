/** 지원자 상세 (지원자 관리 대장의 한 줄): 정리본(요약) · 진행 단계 · 이력서 미리보기·첨부 · 면접 평가 · 같은 공고 지원자.
 *  사람인 기업회원 화면은 로그인이 필요해 자동으로 가져올 수 없으므로, 이력서 PDF를 내려받아 첨부하고 칸을 채워 쓴다. */
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHead from "@/components/대시/PageHead";
import { MiniTable, Tag, Win } from "@/components/대시/parts";
import PrintButton from "@/components/PrintButton";
import { DeleteFile } from "@/app/(app)/(ga)/ga/mail/forms";
import { AttachRow } from "@/components/대장/forms";
import { requireAdminPage } from "@/lib/auth";
import { bookOf } from "@/lib/대장/books";
import { alertsOf } from "@/lib/대장/logic";
import * as store from "@/lib/대장/store";
import { loadFiles } from "@/lib/총무/mail";
import { dayLabel, todayKst } from "@/lib/time";
import { setApplicantStage } from "./actions";

export const metadata = { title: "지원자 · 통합관리시스템" };

const STEPS = ["서류 검토", "서류 합격", "면접 예정", "면접 완료", "최종 합격", "입사 확정"];
const OUT = ["불합격", "지원 취소·포기"];
const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const dday = (n: number) => (n < 0 ? `${-n}일 지남` : n === 0 ? "오늘" : `D-${n}`);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const id = Number((await searchParams).id);
  const row = id ? await store.loadRow(id) : null;
  if (!row || row.book !== "applicants") notFound();
  const book = bookOf("applicants")!;
  const d = row.data, today = todayKst();
  const [all, files] = await Promise.all([store.loadRows("applicants"), loadFiles("lg:")]);
  const fl = files.get(store.rowRef(id)) ?? [];
  const pdf = fl.find((f) => /\.pdf$/i.test(f.fileName));
  const img = !pdf ? fl.find((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.fileName)) : undefined;
  const stage = d.stage || "서류 검토";
  const out = OUT.includes(stage);
  const at = STEPS.indexOf(stage);
  const same = all.filter((r) => (r.data.posting || "") === (d.posting || "")).sort((a, b) => (+(b.data.score || 0)) - (+(a.data.score || 0)) || (a.day ?? "").localeCompare(b.day ?? ""));
  const idx = same.findIndex((r) => r.id === id);
  const prev = same[idx - 1], next = same[idx + 1];
  const alerts = alertsOf(book, d, today);
  const oneLine = [d.birth, d.edu, d.years ? `경력 ${d.years}년` : "신입", d.certs].filter(Boolean).join(" · ");
  const fact = (k: string, v?: string) => <tr key={k}><th style={{ width: 110 }}>{k}</th><td>{v || <span className="muted">-</span>}</td></tr>;
  const lines = (v?: string) => (v ? <ul className="u-soon">{v.split(/\n+/).filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="fd-empty">적은 내용이 없습니다.</p>);
  const edit = `/hr/b/applicants?edit=${id}#form`;

  return (
    <div className="ud">
      <PageHead href="/hr/b/applicants" title={d.name || "(이름 없음)"} mark={stage} emoji="📇"
        desc={<>{d.posting || "공고 미지정"} · {d.route || "경로 미상"} · 접수 {row.day ? dayLabel(row.day, true) : "-"}{oneLine && <> · {oneLine}</>}</>}>
        <Link className="pill" href={edit}>✏️ 칸 고치기</Link>
        <a className="pill" href={d.link || "https://www.saramin.co.kr/zf_user/"} target="_blank" rel="noreferrer">사람인에서 보기 ↗</a>
        <Link className="pill" href="/hr/g/hire">채용 대시보드</Link>
        <Link className="pill" href="/hr/b/applicants">지원자 목록</Link>
        <PrintButton className="pill" label="정리본 인쇄" />
      </PageHead>

      {alerts.map((a) => <div key={a.field} className={`msg ${a.level === "near" ? "warn" : "err"} noprint`}>{a.label} {dayLabel(a.day, true)} ({dday(a.left)})</div>)}
      {out && !d.purge && <div className="msg warn noprint">불합격·포기 지원자는 채용절차법에 따라 정한 기간이 지나면 서류를 반환·파기해야 합니다. 「서류 반환·파기 기한」을 적어 두세요.</div>}

      <div className="u-steps noprint">
        {STEPS.map((s, i) => <span key={s} className={out ? "" : i < at ? "done" : i === at ? "on" : ""}>{i + 1}. {s}</span>)}
        {out && <span className="out">✕ {stage}</span>}
      </div>

      <div className="u-grid">
        <Win en="SUMMARY" ko="지원자 정리본" className="s7" tape="y">
          <p className="u-one">{oneLine || "학력·경력·자격을 적으면 여기 한 줄 요약이 나옵니다."}</p>
          <table className="tbl"><tbody>
            {fact("지원 공고", d.posting)}{fact("생년(나이)", d.birth)}{fact("거주지", d.address)}{fact("최종 학력", d.edu)}
            {fact("경력", d.years ? `${d.years}년` : "신입")}{fact("자격증·면허", d.certs)}{fact("희망 연봉", d.salary)}{fact("입사 가능일", d.start)}
            {fact("연락처", d.phone)}{fact("이메일", d.email)}{fact("면접일", d.interview ? dayLabel(d.interview, true) : "")}{fact("면접 점수", d.score ? `${d.score}점` : "")}
          </tbody></table>
          <h4 className="u-h4">주요 경력</h4>{lines(d.career)}
          <div className="u-pair" style={{ marginTop: 10 }}>
            <div><h4 className="u-h4">👍 강점</h4>{lines(d.good)}</div>
            <div><h4 className="u-h4">❓ 확인할 점</h4>{lines(d.concern)}</div>
          </div>
        </Win>

        <Win en="EVALUATE" ko="진행·면접 평가" className="s5">
          <form action={setApplicantStage} className="u-eval" data-nodraft>
            <input type="hidden" name="id" value={id} />
            <label>진행 단계
              <select name="stage" defaultValue={stage}>{[...STEPS, ...OUT].map((s) => <option key={s}>{s}</option>)}</select>
            </label>
            <label>면접 점수 (100점)<input name="score" type="number" min={0} max={100} defaultValue={d.score ?? ""} /></label>
            <label>면접 메모<textarea name="memo" rows={5} defaultValue={d.memo ?? ""} placeholder="질문·답변 요약, 태도, 기술 확인 결과" /></label>
            <button className="btn primary">저장</button>
            <small className="muted">불합격·포기로 바꾸면 결과 통보일(오늘)과 서류 파기 기한(180일 뒤)이 비어 있을 때 자동으로 채워집니다.</small>
          </form>
          <h4 className="u-h4" style={{ marginTop: 14 }}>같은 공고 지원자 {same.length}명 <small className="muted">(점수 순)</small></h4>
          <MiniTable rows={same.slice(0, 12).map((r) => ({
            href: `/hr/applicant?id=${r.id}`,
            cells: [r.id === id ? <b key="n">▶ {r.data.name}</b> : r.data.name, <Tag key="s" tone={OUT.includes(r.data.stage) ? "r" : r.data.stage === "최종 합격" || r.data.stage === "입사 확정" ? "g" : "b"}>{r.data.stage || "서류 검토"}</Tag>, r.data.score ? `${r.data.score}점` : ""],
          }))} />
          <div className="row noprint" style={{ marginTop: 8, gap: 6 }}>
            {prev && <Link className="btn sm" href={`/hr/applicant?id=${prev.id}`}>‹ {prev.data.name}</Link>}
            {next && <Link className="btn sm" href={`/hr/applicant?id=${next.id}`} style={{ marginLeft: "auto" }}>{next.data.name} ›</Link>}
          </div>
        </Win>

        <Win en="RESUME" ko="이력서·첨부 파일" className="s12">
          <div className="row noprint" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {fl.map((a) => (
              <span key={a.id} className="row" style={{ gap: 2 }}>
                <a className="file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName} <small>{kb(a.size)}</small></a>
                <DeleteFile id={a.id} name={a.fileName} />
              </span>
            ))}
            <AttachRow id={id} />
            <span className="muted" style={{ fontSize: ".82rem" }}>사람인에서 이력서를 PDF로 저장해 올리면 아래에서 바로 볼 수 있습니다 (포트폴리오·자격증 사본도 함께).</span>
          </div>
          {pdf ? <iframe className="u-pdf" src={`/api/ga/file/${pdf.id}`} title="이력서 미리보기" />
            : img ? <img className="u-pdf" src={`/api/ga/file/${img.id}`} alt="이력서" style={{ objectFit: "contain", height: "auto" }} />
            : <p className="fd-empty">아직 첨부한 이력서가 없습니다.</p>}
        </Win>
      </div>
    </div>
  );
}
