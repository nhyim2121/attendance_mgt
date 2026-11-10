/** 인증 하나: 기본 정보, 인증서 스캔본, 취득·심사·갱신·변경신고 이력 (관리자만) */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import * as cert from "@/lib/인증/cert";
import { loadFiles } from "@/lib/총무/mail";
import { dayLabel, todayKst } from "@/lib/time";
import { DeleteFile } from "../../../(ga)/ga/mail/forms";
import { AttachCert, DeleteEvent, DeleteItem, EventForm, ItemForm } from "../forms";

export const metadata = { title: "인증 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const dday = (n: number) => (n < 0 ? `${-n}일 지남` : n === 0 ? "오늘" : `D-${n}`);

function Files({ list }: { list: { id: number; fileName: string; size: number }[] }) {
  return <>{list.map((a) => (
    <div key={a.id} className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
      <a className="file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName} <small>{kb(a.size)}</small></a>
      <DeleteFile id={a.id} name={a.fileName} />
    </div>
  ))}</>;
}

export default async function CertItemPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const id = Number(sp.id);
  const c = id ? await cert.loadItem(id) : null;
  if (!c) notFound();
  const today = todayKst();
  const [events, itemFiles, evFiles] = await Promise.all([cert.loadEvents(id), loadFiles(cert.itemRef(id)), loadFiles("certev:")]);
  const scans = itemFiles.get(cert.itemRef(id)) ?? [];
  const alerts = cert.alertsOf(c, today);
  const edit = sp.edit === "1";
  const row = (k: string, v: React.ReactNode) => <tr><th style={{ width: 140 }}>{k}</th><td>{v || <span className="muted">-</span>}</td></tr>;

  return (
    <>
      <PageHead href="/cert" title={c.name} mark={c.status} desc={<><Link href="/cert">← 인증 현황</Link></>} />
      {alerts.map((a) => (
        <div key={a.kind} className={`msg ${a.level === "d90" ? "warn" : "err"}`}>{a.label} {dayLabel(a.day, true)} ({dday(a.left)})</div>
      ))}

      <div className="cert-detail">
        <div className="card">
          <div className="card-title row" style={{ justifyContent: "space-between" }}>
            기본 정보
            {!edit && <span className="row" style={{ gap: 4 }}><Link className="btn sm" href={`/cert/item?id=${id}&edit=1`}>고치기</Link><DeleteItem id={id} name={c.name} /></span>}
          </div>
          {edit ? (
            <ItemForm presets={cert.PRESETS} categories={cert.CATEGORIES} statuses={cert.STATUSES} v={{
              id, category: c.category, name: c.name, certNo: c.certNo, issuer: c.issuer, acquired: c.acquired ?? "", validFrom: c.validFrom ?? "",
              expires: c.expires ?? "", nextAudit: c.nextAudit ?? "", nextAuditLabel: c.nextAuditLabel, status: c.status, note: c.note,
            }} />
          ) : (
            <table className="tbl kv"><tbody>
              {row("분류", c.category)}
              {row("인증·등록 번호", c.certNo)}
              {row("인증기관", c.issuer)}
              {row("처음 취득일", c.acquired && dayLabel(c.acquired, true))}
              {row("유효기간", c.validFrom || c.expires ? `${c.validFrom ? dayLabel(c.validFrom, true) : ""} ~ ${c.expires ? dayLabel(c.expires, true) : "기한 없음"}` : "")}
              {row("다음 일정", c.nextAudit && `${c.nextAuditLabel || "심사·보고"} ${dayLabel(c.nextAudit, true)}`)}
              {row("메모", c.note && <span style={{ whiteSpace: "pre-line" }}>{c.note}</span>)}
            </tbody></table>
          )}
        </div>

        <div className="card">
          <div className="card-title">인증서·지정서 스캔본</div>
          <Files list={scans} />
          {!scans.length && <p className="muted" style={{ margin: "0 0 6px" }}>아직 없습니다. 인증서 PDF나 사진을 올려 두면 제출할 때 바로 꺼내 쓸 수 있습니다.</p>}
          <AttachCert refKey={cert.itemRef(id)} label="+ 스캔본 올리기" />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">이력 <span className="muted" style={{ fontWeight: 400 }}>취득·사후심사·갱신·변경신고·현장실사·제출</span></div>
        <EventForm itemId={id} today={today} kinds={cert.EVENT_KINDS} />
        {events.length > 0 && (
          <table className="tbl ga-mail" style={{ marginTop: 12 }}>
            <thead><tr><th>날짜</th><th>구분</th><th>내용</th><th>첨부</th><th /></tr></thead>
            <tbody>{events.map((e) => (
              <tr key={e.id}>
                <td>{dayLabel(e.day, true)}</td>
                <td><span className="tag kind">{e.kind}</span></td>
                <td style={{ whiteSpace: "normal" }}><b>{e.title}</b>{e.note && <div className="muted">{e.note}</div>}</td>
                <td style={{ whiteSpace: "normal" }}><Files list={evFiles.get(cert.eventRef(e.id)) ?? []} /><AttachCert refKey={cert.eventRef(e.id)} /></td>
                <td><DeleteEvent id={e.id} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
