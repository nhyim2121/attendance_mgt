/** 데이터 관리: [올리기] 캡스 월별 파일 + 근태현황(하이웍스) 파일 저장, [내려받기] 직원별 시트 엑셀·ZIP. */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import type { SearchParams } from "@/lib/인사노무/data";
import DownloadView from "./DownloadView";
import { Metric, Table } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { loadBase } from "@/lib/인사노무/data";
import * as store from "@/lib/store";
import { fullKst } from "@/lib/time";
import { ApprovalForm, CapsForm, DeleteForms, HiworksForm } from "./forms";

export const metadata = { title: "데이터 관리 · 근태관리통합시스템" };

export default async function UploadPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const down = sp.tab === "download";
  const keep = new URLSearchParams();
  for (const k of ["month", "from", "to", "dept", "all", "emps"]) if (typeof sp[k] === "string") keep.set(k, sp[k] as string);
  const tabs = (
    <>
      <PageHead href={"/upload"} />
      <div className="tabs noprint">
        <Link href={`/upload${keep.size ? `?${keep}` : ""}`} className={down ? "" : "on"} scroll={false}>⬆ 올리기</Link>
        <Link href={`/upload?tab=download${keep.size ? `&${keep}` : ""}`} className={down ? "on" : ""} scroll={false}>⬇ 내려받기 (엑셀·ZIP)</Link>
      </div>
    </>
  );
  if (down) return <DownloadView sp={sp} head={tabs} />;
  const [user, base, uploads, spans] = await Promise.all([
    currentUser(), loadBase(), store.loadUploads(), store.recordNameSpan(),
  ]);
  const months = base.months;
  const total = months.reduce((s, m) => s + Number(m.n), 0);
  const period = months.length ? `${months[0].first_day.replaceAll("-", ".")}~${months[months.length - 1].last_day.slice(5).replace("-", ".")}` : "-";
  const capsNames = new Set(spans.map((s) => s.name));
  const missing = [...new Set(base.leaves.map((l) => l.name))].filter((n) => !capsNames.has(n)).sort();

  return (
    <>
      {tabs}
      <p className="caption">올린 파일은 서버의 공용 저장소에 저장되어 관리팀 모두가 같은 데이터를 봅니다. 같은 기록을 다시 올려도 중복으로 쌓이지 않습니다.</p>
      <div className="metrics">
        <Metric label="캡스 기록" value={`${total.toLocaleString()}건`} />
        <Metric label="기간" value={period} />
        <Metric label="명단" value={`${base.roster.length}명`} />
        <Metric label="하이웍스 근태" value={`${base.leaves.length.toLocaleString()}건`} />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">1. 캡스 출입기록 (월별 파일, 여러 개 가능)</div>
          <p className="caption">예: <code>9월 근태현황.xls</code>. 원본 시트(Sheet1, 9월 전체 등)를 자동으로 찾습니다.</p>
          <CapsForm />
        </div>
        <div className="card">
          <div className="card-title">2. 근태현황 (하이웍스 정리 파일)</div>
          <p className="caption">예: <code>근태현황(2026년~).xlsx</code>. 1월부터 누적된 파일이라 올릴 때마다 명단·근태를 새 파일로 교체합니다.</p>
          <HiworksForm />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">3. 하이웍스 결재 내역 (근무계획 수립이력 · 여러 개 가능)</div>
        <p className="caption">하이웍스 전자결재에서 내려받은 <code>…_근무계획수립이력.xls</code> 파일(휴가 신청·취소, 연장근무, 휴(무)일근무)을 올리세요.
          <b>결재완료</b>만 근태로 넣고, 반려·관리자 기안 취소는 넣지 않습니다. 결재완료된 <b>휴가 취소</b>는 그날의 휴가를 지웁니다.
          같은 파일을 여러 번 올려도 한 번만 들어가고, 근태현황 파일·일일 근태 보고서와 같은 날이 겹쳐도 한 번만 셉니다.</p>
        <ApprovalForm />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">업로드 이력</div>
        {uploads.length ? (
          <Table head={["번호", "종류", "파일", "시트", "건수", "새 기록", "기간", "사용자", "일시"]} numeric={[0, 4, 5]} tall
            rows={uploads.map((u) => [u.id, u.kind, u.file, u.sheet, u.count, u.added, u.period, u.user_id, fullKst(u.created_at)])} />
        ) : <p className="muted">아직 올린 파일이 없습니다.</p>}
        {user?.role === "관리자" && uploads.length > 0 && (
          <details className="fold" style={{ marginTop: 12, boxShadow: "none", border: "1px solid #eef0f4" }}>
            <summary>데이터 삭제 (관리자)</summary>
            <p className="caption">잘못 올린 파일을 지울 때 씁니다. 근태현황은 새 파일을 다시 올리면 교체됩니다.</p>
            <DeleteForms uploads={uploads.filter((u) => u.kind === "캡스")} months={months.map((m) => m.month).reverse()} />
          </details>
        )}
      </div>

      {missing.length > 0 && base.months.length > 0 && (
        <p className="caption" style={{ marginTop: 12 }}>근태현황에는 있지만 캡스 기록이 없는 사람 (판정에서 제외): {missing.join(", ")}</p>
      )}
    </>
  );
}
