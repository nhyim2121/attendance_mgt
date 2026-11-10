/** 총무 > 인증서 관리: 공동인증서·금융인증서·OTP 등의 보관자·보관 위치·만료일. 만료 60일 전부터 알린다.
 *  인증서 파일·비밀번호는 저장하지 않는다. */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import { Metric } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import * as issue from "@/lib/총무/issue";
import { addDays, dayLabel, todayKst } from "@/lib/time";
import { CertForm, type CertFormValue, DeleteCert, RenewCert } from "../issue/forms";

export const metadata = { title: "공동인증서 관리 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;

const ALERT_TEXT = { late: "만료됨", d30: "30일 안", d60: "60일 안", "": "" } as const;

export default async function CertsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const today = todayKst();
  const certs = await issue.loadCerts();
  const editing = certs.find((c) => c.id === Number(sp.edit)) ?? null;
  const active = certs.filter((c) => c.active);
  const n = (k: string) => active.filter((c) => issue.certAlert(c, today) === k).length;

  const v: CertFormValue = editing
    ? { ...editing, issued: editing.issued ?? "", expires: editing.expires ?? "" }
    : { name: "", kind: issue.CERT_KINDS[0], issuer: "", usage: "", holder: "", location: "", issued: "", expires: "", active: true, note: "" };

  return (
    <>
      <PageHead href={"/ga/certs"} desc={<>회사 인증서가 몇 개이고 누가 어디에 보관하는지, 언제 끝나는지를 한곳에 적어 둡니다. 만료 60일 전부터 주황, 30일 전부터 빨강으로 표시되고 통합 대시보드·총무 홈에도 알림이 뜹니다.</>} />

      <div className="metrics">
        <Metric label="사용 중" value={`${active.length}개`} />
        <Metric label="만료됨" value={<span className={n("late") ? "red" : ""}>{n("late")}개</span>} />
        <Metric label="30일 안 만료" value={<span className={n("d30") ? "red" : ""}>{n("d30")}개</span>} />
        <Metric label="60일 안 만료" value={<span className={n("d60") ? "orange" : ""}>{n("d60")}개</span>} />
      </div>

      <div className="card">
        <div className="tbl-wrap"><table className="tbl ga-mail">
          <thead><tr><th>이름</th><th>종류</th><th>발급기관</th><th>쓰는 곳</th><th>보관자 · 위치</th><th>만료일</th><th /></tr></thead>
          <tbody>
            {certs.map((c) => {
              const a = issue.certAlert(c, today), d = issue.daysLeft(c, today);
              return (
                <tr key={c.id} className={`${c.active ? "" : "inactive"}${editing?.id === c.id ? " editing" : ""}`}>
                  <td style={{ whiteSpace: "normal", minWidth: 160 }}><b>{c.name}</b>{!c.active && <span className="muted"> (폐기·안 씀)</span>}
                    {c.note && <div className="muted" style={{ whiteSpace: "pre-line", fontSize: ".8rem" }}>{c.note}</div>}</td>
                  <td>{c.kind}</td>
                  <td>{c.issuer}</td>
                  <td style={{ whiteSpace: "normal" }}>{c.usage}</td>
                  <td style={{ whiteSpace: "normal" }}>{c.holder}{c.location && <div className="muted">{c.location}</div>}</td>
                  <td>
                    {c.expires ? dayLabel(c.expires, true) : <span className="muted">모름</span>}
                    {a && <div className={a === "d60" ? "orange" : "red"} style={{ fontSize: ".8rem" }}>{ALERT_TEXT[a]}{d !== null && d >= 0 ? ` (D-${d})` : ""}</div>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      {c.active && <RenewCert id={c.id} suggest={addDays(c.expires && c.expires > today ? c.expires : today, 365)} />}
                      <Link className="btn sm" href={`/ga/certs?edit=${c.id}#form`}>고치기</Link>
                      <DeleteCert id={c.id} name={c.name} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        {!certs.length && <p className="muted">아직 등록한 인증서가 없습니다. 아래에서 회사 인증서를 하나씩 등록해 주세요.</p>}
      </div>

      <div className="card" id="form" style={{ marginTop: 16 }}>
        <div className="card-title">{editing ? `${editing.name} 고치기` : "인증서 등록"}</div>
        <CertForm key={editing?.id ?? "new"} v={v} kinds={issue.CERT_KINDS} />
      </div>
    </>
  );
}
