/** 아직 만들지 않은 업무 영역 화면 */
import Link from "next/link";
import { hubOf } from "@/lib/hub";

export default function Soon({ k }: { k: string }) {
  const s = hubOf(k);
  return (
    <>
      <h1>{s.label}</h1>
      <p className="caption">{s.desc}</p>
      <div className="card hub-card" style={{ ["--hub" as string]: s.color, maxWidth: 640 }}>
        <span className="soon">준비 중</span>
        <p style={{ margin: 0 }}>이 영역은 아직 만들지 않았습니다. 무엇을 관리할지 정해지면 메뉴가 여기에 생깁니다.</p>
        {s.plan && <p className="plan">예: {s.plan.join(" · ")}</p>}
        <Link href="/" className="hub-go">← 통합 대시보드</Link>
      </div>
    </>
  );
}
