/** 교육훈련 인쇄 양식 머리: 사이트 공통 문서 머리(휴가 보고서와 같은 로고 · 제목 · 결재란)를 그대로 쓰고, 정보는 부제로 */
import { DocHead as SysDocHead } from "@/app/(app)/(hr)/leave/Report";

export default function DocHead({ eyebrow, title, chips = [], appr = false }: {
  eyebrow: string; title: string; chips?: (string | false | null | undefined | [string, "ok" | "warn"])[]; appr?: boolean;
}) {
  const sub = (
    <>
      <span>{eyebrow}</span>
      {chips.filter(Boolean).map((c, i) => Array.isArray(c)
        ? <span key={i} className={`sd-chip ${c[1]}`}>{c[0]}</span>
        : <span key={i}> · {c}</span>)}
    </>
  );
  return <SysDocHead title={title} sub={sub} sign={appr} />;
}

export function SdH({ children }: { children: React.ReactNode }) {
  return <h3 className="doc-h">{children}</h3>;
}
