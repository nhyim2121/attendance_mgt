/** 인증 현황: 회사가 가진 인증·지정·확인을 분류별 카드로 보고, 만료·심사 일정이 다가오면 맨 위에 알린다 (관리자만). */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import { Metric } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import * as cert from "@/lib/인증/cert";
import { loadFiles } from "@/lib/총무/mail";
import { dayLabel, todayKst } from "@/lib/time";
import { ItemForm } from "./forms";

export const metadata = { title: "인증 현황 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;

const dday = (n: number) => (n < 0 ? `${-n}일 지남` : n === 0 ? "오늘" : `D-${n}`);
const LEVEL = { late: "red", d30: "red", d90: "orange" } as const;

export default async function CertHome({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const today = todayKst();
  const [items, files] = await Promise.all([cert.loadItems(), loadFiles("cert:")]);
  const showAll = sp.all === "1";
  const live = items.filter((c) => c.status === "유효" || c.status === "진행 중");
  const shown = showAll ? items : live;
  const alerts = live.flatMap((c) => cert.alertsOf(c, today).map((a) => ({ c, a }))).sort((x, y) => x.a.left - y.a.left);
  const ended = items.length - live.length;

  return (
    <>
      <PageHead href={"/cert"} desc={<>ISO·벤처·이노비즈·기업부설연구소·AEO 같은 회사 인증과 지정을 한곳에서 봅니다. 유효기간 끝이나 사후심사·보고 일정이 90일 안으로 다가오면 여기와 통합 대시보드에 뜹니다.</>} />

      <div className="metrics">
        <Metric label="유효·진행 중" value={`${live.length}개`} />
        <Metric label="30일 안 일정" value={<span className={alerts.some((x) => x.a.level !== "d90") ? "red" : ""}>{alerts.filter((x) => x.a.level !== "d90").length}건</span>} />
        <Metric label="90일 안 일정" value={<span className={alerts.length ? "orange" : ""}>{alerts.length}건</span>} />
        <Metric label="만료·반납" value={<Link href={showAll ? "/cert" : "/cert?all=1"}>{ended}개 {showAll ? "숨기기" : "보기"}</Link>} />
      </div>

      {alerts.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">다가오는 일정</div>
          <table className="tbl"><tbody>
            {alerts.map(({ c, a }) => (
              <tr key={`${c.id}${a.kind}`}>
                <td className={LEVEL[a.level]} style={{ fontWeight: 700, width: 90 }}>{dday(a.left)}</td>
                <td style={{ width: 110 }}>{dayLabel(a.day, true)}</td>
                <td><Link href={`/cert/item?id=${c.id}`}><b>{c.name}</b></Link> · {a.label}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {cert.CATEGORIES.map((cat) => {
        const list = shown.filter((c) => c.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat} style={{ marginBottom: 18 }}>
            <h2 className="cert-cat">{cat} <span className="muted">{list.length}</span></h2>
            <div className="cert-grid">
              {list.map((c) => {
                const al = cert.alertsOf(c, today);
                const worst = al.sort((x, y) => x.left - y.left)[0];
                const n = (files.get(cert.itemRef(c.id)) ?? []).length;
                return (
                  <Link key={c.id} href={`/cert/item?id=${c.id}`} className={`card cert-card s-${c.status.replace("·", "")}${worst ? ` a-${worst.level}` : ""}`}>
                    <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                      <b>{c.name}</b><span className="tag">{c.status}</span>
                    </div>
                    <div className="muted">{[c.issuer, c.certNo].filter(Boolean).join(" · ") || " "}</div>
                    <div>{c.expires ? <>~ {dayLabel(c.expires, true)}</> : <span className="muted">유효기간 없음</span>}
                      {worst && <span className={LEVEL[worst.level]}> · {worst.kind === "만료" ? "만료" : worst.label} {dday(worst.left)}</span>}</div>
                    {c.nextAudit && (!worst || worst.kind !== "심사") && <div className="muted">{c.nextAuditLabel || "다음 일정"} {dayLabel(c.nextAudit, true)}</div>}
                    <div className="muted" style={{ fontSize: ".8rem" }}>{n ? `📎 인증서 ${n}개` : "인증서 스캔본 없음"}</div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
      {!items.length && <p className="muted">아직 등록한 인증이 없습니다. 아래에서 회사가 가진 인증을 하나씩 등록해 주세요.</p>}

      <details className="fold" open={!items.length} style={{ marginTop: 16 }} id="add">
        <summary>인증 등록</summary>
        <div style={{ marginTop: 10 }}>
          <ItemForm presets={cert.PRESETS} categories={cert.CATEGORIES} statuses={cert.STATUSES}
            v={{ category: "기업 인증·확인", name: "", certNo: "", issuer: "", acquired: "", validFrom: "", expires: "", nextAudit: "", nextAuditLabel: "", status: "유효", note: "" }} />
        </div>
      </details>
    </>
  );
}
