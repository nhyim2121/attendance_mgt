/** 통합 디자인의 '창' 틀 (2차 F 레트로 창): 제목줄 ○○○ · 영어 큰 제목 + 한글 이름 · 오른쪽 '더 보기'.
 *  서버·클라이언트 어디서나 쓴다 (훅 없음). tape를 주면 위에 마스킹테이프(3차 L)를 붙인다. */
import Link from "next/link";

export function Win({ en, ko, more, tape, className = "", children }: {
  en: string; ko?: string; more?: [label: string, href: string]; tape?: "y" | "b"; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`uw ${className}`}>
      {tape && <i className={`u-tape ${tape}`} aria-hidden />}
      <div className="uw-tb" aria-hidden><i /><i /><i /><span>– □ ×</span></div>
      <div className="uw-h">
        <h3 data-scr={en}>{en}</h3>
        {ko && <span>{ko}</span>}
        {more && <Link className="more" href={more[1]}>{more[0]} ›</Link>}
      </div>
      <div className="uw-b">{children}</div>
    </section>
  );
}
