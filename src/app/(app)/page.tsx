/** 통합 대시보드: 업무 영역(총무·인사노무·환경안전보건·인증·기타)으로 들어가는 첫 화면. */
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { HUB } from "@/lib/hub";

export default async function HubPage() {
  await requireUser();
  return (
    <>
      <h1>통합 대시보드</h1>
      <p className="caption">업무 영역을 골라 들어가세요. 근태·휴가는 <b>인사노무</b> 안에 있습니다.</p>
      <div className="hub-grid">
        {HUB.map((s) => (
          <div key={s.key} className="card hub-card" style={{ ["--hub" as string]: s.color }}>
            <h2>{s.label}</h2>
            <p className="hub-sub">{s.desc}</p>
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
