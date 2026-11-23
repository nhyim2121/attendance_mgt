/** ISO 실적문서 작성: 왼쪽 = 이 양식으로 쓴 문서 목록, 오른쪽 = 양식 그대로의 A4 한 장 (칸을 눌러 바로 적기, 자동 저장).
 *  한글(.hwpx)로 받기 = 양식 파일에 적은 글만 바꿔 넣은 파일, PDF = 브라우저 인쇄. */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import * as iso from "@/lib/인증/iso27k";
import { createIsoDoc } from "../actions";
import Meta, { DeleteDoc } from "../Meta";
import Sheet from "../Sheet";

export const metadata = { title: "ISO 27001 실적문서 작성 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;

export default async function IsoDocPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const form = iso.formOf(String(sp.form ?? ""));
  if (!form) notFound();
  if (!(await iso.templateReady())) {
    return <><PageHead href="/cert/iso" title={form.title} /><div className="msg err">양식 파일이 없습니다: 데이터\iso27001\template.hwpx</div></>;
  }
  const list = await iso.listDocs(form.key);
  const id = Number(sp.id) || list[0]?.id || 0;
  const doc = id ? await iso.loadDoc(id) : null;
  const cur = doc && doc.form === form.key ? doc : null;
  const sheet = await iso.sheetOf(form, cur?.data.rows ?? {});
  const i = iso.FORMS.indexOf(form);
  const prev = iso.FORMS[i - 1], next = iso.FORMS[i + 1];

  return (
    <>
      <PageHead href="/cert/iso" title={form.title} mark={form.code}
        desc={<><Link href="/cert/iso">← 실적문서 양식</Link> · {form.group} · {form.cycle}
          {prev && <> · <Link href={`/cert/iso/doc?form=${prev.key}`}>‹ {prev.title}</Link></>}
          {next && <> · <Link href={`/cert/iso/doc?form=${next.key}`}>{next.title} ›</Link></>}</>} />

      <div className="iso-work">
        <aside className="card iso-list noprint">
          <form action={createIsoDoc}>
            <input type="hidden" name="form" value={form.key} />
            <button className="btn primary" style={{ width: "100%" }}>+ 새로 작성 (빈 양식)</button>
          </form>
          {cur && (
            <form action={createIsoDoc}>
              <input type="hidden" name="form" value={form.key} />
              <input type="hidden" name="copy" value={cur.id} />
              <button className="btn" style={{ width: "100%" }}>이 문서 복사해서 새로</button>
            </form>
          )}
          <div className="iso-list-h">작성한 문서 {list.length}건</div>
          {list.map((d) => (
            <Link key={d.id} href={`/cert/iso/doc?form=${form.key}&id=${d.id}`} className={`iso-li${d.id === cur?.id ? " on" : ""}`}>
              <b>{d.title || form.title}</b><span>{d.day} · {d.updatedBy}</span>
            </Link>
          ))}
          {!list.length && <p className="muted" style={{ margin: 0 }}>아직 없습니다. [+ 새로 작성]을 누르면 오른쪽 양식에 바로 적을 수 있습니다.</p>}
        </aside>

        <div className="iso-main">
          {cur ? (
            <div className="iso-bar noprint">
              <Meta key={cur.id} id={cur.id} title={cur.title} day={cur.day} />
              <span className="spacer" />
              <a className="btn primary" href={`/api/cert/iso/${cur.id}`}>한글(.hwpx)로 받기</a>
              <PrintButton label="PDF / 인쇄" />
              <DeleteDoc id={cur.id} name={cur.title || form.title} />
            </div>
          ) : (
            <div className="msg noprint">아래는 빈 양식 미리보기입니다. 적으려면 왼쪽 [+ 새로 작성]을 누르세요.</div>
          )}
          <Sheet key={`${cur?.id ?? 0}|${JSON.stringify(cur?.data.rows ?? {})}`} docId={cur?.id} sheet={sheet} values={cur?.data.v ?? {}} readOnly={!cur} />
        </div>
      </div>
    </>
  );
}
