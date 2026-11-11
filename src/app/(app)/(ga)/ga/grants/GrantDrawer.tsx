"use client";
/** 지원사업 등록·고치기 서랍 (오른쪽에서 열림): 기본 · 기간(빠른 버튼) · 진행 · 비고 · 스캔본 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { removeLedgerRow } from "@/components/대장/actions";
import { currentStage, GRANT_AGENCIES, GRANT_ENDS, GRANT_FIELDS, GRANT_PERIODS, GRANT_STAGES } from "@/lib/총무/grants";
import { saveGrant } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.heic,.tif,.tiff,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";
type Data = Record<string, string>;
export interface DrawerFile { id: number; fileName: string; size: number }

/** 날짜 + n개월 - 1일 (예: 2026-01-01 + 12개월 → 2026-12-31) */
function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, d));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}
const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export default function GrantDrawer({ id, v, files, close, emps }: {
  id: number; v: Data; files: DrawerFile[]; close: string; emps: string[];
}) {
  const router = useRouter();
  const [res, act, pending] = useActionState(saveGrant, null);
  const [from, setFrom] = useState(v.from ?? "");
  const [to, setTo] = useState(v.to ?? "");
  const [del, startDel] = useTransition();
  // 새로 등록하면 그 사업 상세(단계·서류)로, 고치면 원래 화면으로
  useEffect(() => { if (res?.ok) { router.push(id ? close : `/ga/grants/item?id=${res.id}`); router.refresh(); } }, [res, id, close, router]);
  // Esc로 닫기
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") router.push(close); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [close, router]);
  const f = (k: string) => `f_${k}`;
  return (
    <div className="ep-overlay" onClick={(e) => { if (e.target === e.currentTarget) router.push(close); }}>
      <aside className="ep-drawer gr-drawer" aria-label={id ? "지원사업 고치기" : "새 지원사업 등록"}>
        <h2>{id ? "지원사업 고치기" : "새 지원사업 등록"}</h2>
        <form action={act}>
          <input type="hidden" name="book" value="grants" />
          <input type="hidden" name="id" value={id || ""} />
          <input type="hidden" name="back" value={close} />

          <h3>기본</h3>
          <div className="gr-row">
            <label>단계 <b className="req">*</b>
              <select name={f("stage")} defaultValue={currentStage(v)} required>
                {[...GRANT_STAGES, ...GRANT_ENDS].map((x) => <option key={x.key} value={x.key}>{x.emoji} {x.label}</option>)}
              </select>
            </label>
            <label>폴더
              <select name={f("folder")} defaultValue={["6. 성과·수요조사", "7. 기타"].includes(v.folder ?? "") ? v.folder : ""}>
                <option value="">단계에 따라 자동</option><option>6. 성과·수요조사</option><option>7. 기타</option>
              </select>
            </label>
            <label>분야
              <select name={f("field")} defaultValue={v.field ?? ""}>
                <option value="">-</option>{GRANT_FIELDS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          </div>
          <label>사업명 <b className="req">*</b><input name={f("name")} defaultValue={v.name ?? ""} required placeholder="예: 2026년 협력중소기업 에너지효율화 지원사업" /></label>
          <div className="gr-row">
            <label>주관기관<input name={f("agency")} defaultValue={v.agency ?? ""} list="gr-agency" placeholder="예: 한국남동발전" /></label>
            <label>연도<input name={f("year")} defaultValue={v.year ?? ""} placeholder="예: 2026" inputMode="numeric" /></label>
          </div>
          <datalist id="gr-agency">{GRANT_AGENCIES.map((x) => <option key={x} value={x} />)}</datalist>
          <label>지원 내용<textarea name={f("support")} defaultValue={v.support ?? ""} rows={2} placeholder="예: 고효율 설비 교체비 70% 지원" /></label>

          <h3>기간</h3>
          <div className="gr-row">
            <label>신청일<input type="date" name={f("applied")} defaultValue={v.applied ?? ""} /></label>
            <label>사업 시작<input type="date" name={f("from")} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>사업 종료<input type="date" name={f("to")} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <div className="gr-quick">
            <span>기간을 누르면 사업 시작일부터 종료일을 계산합니다{from ? "" : " (사업 시작일을 먼저 넣으세요)"}</span>
            <div>{GRANT_PERIODS.map(([label, n]) => (
              <button key={label} type="button" className="btn sm" disabled={!from} onClick={() => setTo(addMonths(from, n))}>{label}</button>
            ))}</div>
          </div>

          <h3>진행</h3>
          <div className="gr-row">
            <label>담당<input name={f("owner")} defaultValue={v.owner ?? ""} list="gr-emps" /></label>
            <label>지원금 (원)<input name={f("amount")} defaultValue={v.amount ?? ""} inputMode="numeric" placeholder="예: 20000000" /></label>
            <label>자부담 (원)<input name={f("self")} defaultValue={v.self ?? ""} inputMode="numeric" /></label>
          </div>
          <datalist id="gr-emps">{emps.map((x) => <option key={x} value={x} />)}</datalist>
          <div className="gr-row">
            <label>다음 할 일 날짜<input type="date" name={f("nextAt")} defaultValue={v.nextAt ?? ""} /></label>
            <label className="grow">다음 할 일<input name={f("next")} defaultValue={v.next ?? ""} placeholder="예: 중간보고서 제출" /></label>
          </div>
          <label>결과<input name={f("result")} defaultValue={v.result ?? ""} placeholder="예: 선정, 정산 완료, 지원금 입금" /></label>

          <h3>비고</h3>
          <textarea name={f("note")} defaultValue={v.note ?? ""} rows={3} />
          <label>X 드라이브 폴더<input name={f("path")} defaultValue={v.path ?? ""} placeholder="예: 2.선정및진행\13.2026년 협력중소기업…" /></label>

          <h3>스캔본</h3>
          {files.length > 0 && (
            <ul className="gr-files">{files.map((a) => (
              <li key={a.id}><a href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName}</a> <small>{kb(a.size)}</small></li>
            ))}</ul>
          )}
          <input type="file" name="file" accept={ACCEPT} multiple />
          <p className="caption">공고문·신청서·협약서·결과보고서 (PDF·한글·이미지, 여러 개)</p>

          {res?.error && <div className="msg err">{res.error}</div>}
          <div className="gr-actions">
            <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : id ? "저장" : "등록"}</button>
            <Link className="btn" href={close}>취소</Link>
            {id > 0 && (
              <button type="button" className="btn danger" disabled={del} style={{ marginLeft: "auto" }} onClick={() => {
                if (!confirm(`「${v.name}」을(를) 지울까요? 첨부도 같이 지워집니다.`)) return;
                startDel(async () => { await removeLedgerRow(id); router.push(close); router.refresh(); });
              }}>삭제</button>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
}
