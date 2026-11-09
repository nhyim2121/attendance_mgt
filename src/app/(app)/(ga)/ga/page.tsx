/** 총무 홈: 업무분장표의 '1. 문서 및 자료관리' 업무와 지금 처리 중인 문서 (관리자 한 사람만 사용) */
import Link from "next/link";
import AreaBooks from "@/components/대장/AreaBooks";
import { requireAdminPage } from "@/lib/auth";
import { loadOpenMails, mailNo } from "@/lib/총무/mail";
import { certAlert, loadCerts } from "@/lib/총무/issue";
import { addDays, dayLabel, todayKst } from "@/lib/time";

export const metadata = { title: "총무 · 통합관리시스템" };

// 업무분장표 1. 문서 및 자료관리 중 이 사이트에서 하는 것
const WORKS = [
  { no: "1-1 · 1-6", label: "문서 수발 대장", href: "/ga/mail", desc: "공문 수신·발신, 우편·등기·팩스·택배 대장과 스캔본", when: "매일" },
  { no: "1-3", label: "양식함", desc: "각종 양식 최신본과 제·개정 이력", when: "발생 시" },
  { no: "1-7", label: "증빙·법인서류 발급 대장", href: "/ga/issue", desc: "서류별 발급 기록과 발급본, 최근 발급일", when: "발생 시" },
  { no: "1-7", label: "공동인증서 관리", href: "/ga/certs", desc: "공동인증서·금융인증서·OTP 보관자·위치·만료일, 만료 60일 전 알림", when: "발생 시" },
  { no: "1-5", label: "명함·이메일 서명", desc: "직원 정보로 서명 만들기, 명함 신청 대장", when: "발생 시" },
];

export default async function GaHome() {
  await requireAdminPage();
  const today = todayKst();
  const [open, certs] = await Promise.all([loadOpenMails(), loadCerts()]);
  const due = certs.filter((c) => certAlert(c, today));
  return (
    <>
      <h1>총무</h1>
      <p className="caption">업무분장표 총무 업무를 대장으로 옮기고 있습니다. 총무 화면은 관리자 계정에서만 보입니다.</p>
      <div className="ga-home">
        {WORKS.map((w) => (
          <div key={w.label} className={`card${w.href ? "" : " off"}`}>
            <div className="muted" style={{ fontSize: ".8rem" }}>{w.no} · {w.when}</div>
            <div className="card-title" style={{ margin: 0 }}>{w.href ? <Link href={w.href}>{w.label} →</Link> : w.label}</div>
            <div>{w.desc}</div>
            {!w.href && <span className="muted" style={{ fontSize: ".8rem" }}>준비 중</span>}
          </div>
        ))}
      </div>
      <AreaBooks area="ga" title="총무 대장" />

      {due.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">만료가 다가오는 인증서 <span className="muted" style={{ fontWeight: 400 }}>{due.length}개</span></div>
          <ul style={{ margin: 0 }}>{due.map((c) => (
            <li key={c.id}><Link href="/ga/certs">{c.name}</Link> · {c.holder} ·{" "}
              <span className={certAlert(c, today) === "d60" ? "orange" : "red"}>만료 {dayLabel(c.expires!, true)}</span></li>
          ))}</ul>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">처리 중인 문서 <span className="muted" style={{ fontWeight: 400 }}>{open.length}건</span></div>
        {open.length ? (
          <table className="tbl"><thead><tr><th>번호</th><th>날짜</th><th>상대처</th><th>제목</th><th>기한</th></tr></thead>
            <tbody>{open.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/ga/mail?y=${x.year}&edit=${x.id}#form`}>{mailNo(x)}</Link></td>
                <td>{dayLabel(x.day)}</td><td>{x.party}</td><td>{x.title}</td>
                <td className={x.due && x.due < today ? "red" : x.due && x.due <= addDays(today, 3) ? "orange" : ""}>{x.due ? dayLabel(x.due) : ""}</td>
              </tr>
            ))}</tbody></table>
        ) : <p className="muted" style={{ margin: 0 }}>처리 중인 문서가 없습니다.</p>}
      </div>
    </>
  );
}
