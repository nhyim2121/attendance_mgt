/** ISO 실적문서 화면 사이 탭 */
import Link from "next/link";

export default function IsoTabs({ on, year }: { on: "board" | "year" | "guide"; year: string }) {
  return (
    <div className="tabs noprint">
      <Link href={`/cert/iso?year=${year}`} className={on === "board" ? "on" : ""}>양식별 문서</Link>
      <Link href={`/cert/iso/year?year=${year}`} className={on === "year" ? "on" : ""}>연간 작성 현황</Link>
      <Link href="/cert/iso/guide" className={on === "guide" ? "on" : ""}>작성 매뉴얼</Link>
    </div>
  );
}
