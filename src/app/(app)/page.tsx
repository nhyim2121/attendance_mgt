/** 통합 대시보드: 업무 영역(총무·인사노무·환경안전보건·인증·기타)으로 들어가는 첫 화면. */
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { HUB } from "@/lib/hub";
import { loadOpenMails } from "@/lib/총무/mail";
import { certAlert, loadCerts } from "@/lib/총무/issue";
import { alertsOf, loadItems } from "@/lib/인증/cert";
import { BOOKS } from "@/lib/대장/books";
import { alertsOf as rowAlerts } from "@/lib/대장/logic";
import { loadBooks } from "@/lib/대장/store";
import { todayKst } from "@/lib/time";

export default async function HubPage() {
  const user = await requireUser();
  const admin = user.role === "관리자";
  const openMails = admin ? (await loadOpenMails()).length : 0;
  const certDue = admin ? (await loadItems()).flatMap((c) => alertsOf(c, todayKst())).length : 0;
  const rows = admin ? await loadBooks(BOOKS.map((b) => b.key)) : [];
  const due: Record<string, number> = {};
  for (const r of rows) {
    const b = BOOKS.find((x) => x.key === r.book)!;
    const n = rowAlerts(b, r.data, todayKst()).length;
    if (n) due[b.area] = (due[b.area] ?? 0) + n;
  }
  const dueCerts = admin ? (await loadCerts()).filter((c) => certAlert(c, todayKst())).length : 0;
  return (
    <>
      <h1>통합 대시보드</h1>
      <p className="caption">업무 영역을 골라 들어가세요. 근태·휴가는 <b>인사노무</b> 안에 있습니다.</p>
      <div className="hub-grid">
        {HUB.filter((s) => admin || !["ga", "cert", "ehs", "misc"].includes(s.key)).map((s) => (
          <div key={s.key} className="card hub-card" style={{ ["--hub" as string]: s.color }}>
            <h2>{s.label}</h2>
            <p className="hub-sub">{s.desc}</p>
            {s.key === "ga" && openMails > 0 && <p className="red" style={{ margin: 0 }}>처리 중인 문서 {openMails}건</p>}
            {(due[s.key] ?? 0) > 0 && <p className="orange" style={{ margin: 0 }}>대장 기한 {due[s.key]}건</p>}
            {s.key === "cert" && certDue > 0 && <p className="red" style={{ margin: 0 }}>90일 안 만료·심사 일정 {certDue}건</p>}
            {s.key === "ga" && dueCerts > 0 && <p className="red" style={{ margin: 0 }}>만료가 다가오는 인증서 {dueCerts}개</p>}
            {s.ready ? (
              <ul>{s.links!.map(([l, h]) => <li key={h}><Link href={h}>{l}</Link></li>)}</ul>
            ) : <>
              <span className="soon">준비 중</span>
              {s.plan && <p className="plan">예: {s.plan.join(" · ")}</p>}
            </>}
            <Link href={s.href} className="hub-go">{s.label} 바로가기 →</Link>
          </div>
        ))}
      </div>
    </>
  );
}
