/** 이수·수강 현황 탭: 직원별 법정교육 이수표(연간) · 과정별 수강현황(반기) */
import Link from "next/link";

export default function TrainTabs({ on }: { on: "matrix" | "status" }) {
  return (
    <nav className="tr-tabs noprint" aria-label="이수·수강 현황">
      <Link href="/hr/training/matrix" className={on === "matrix" ? "on" : ""}>직원별 법정교육 이수표 <small>연간 · 법정 7종</small></Link>
      <Link href="/hr/training/status" className={on === "status" ? "on" : ""}>과정별 수강현황 <small>반기 · 수료증</small></Link>
    </nav>
  );
}
