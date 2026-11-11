"use client";
/** 일일 현황 부서별 현황판: 사원증 미지참 등으로 캡스 기록이 없는 직원의 출퇴근 시각을 그 자리에서 수기입력.
 *  저장은 근태 기입(직원별 근태 → 근태 기입 탭)과 같은 saveEdits를 쓴다 → 엑셀 인증 칸에 '수기입력'으로 표시된다. */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveEdits } from "../edit/actions";

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function QuickClock({ emp, day }: { emp: string; day: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tin, setIn] = useState("");
  const [tout, setOut] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  if (!open) {
    return <button type="button" className="qc-btn" onClick={() => setOpen(true)} title="사원증 미지참 등으로 기록이 없을 때 시각을 직접 넣습니다">✏️ 수기입력</button>;
  }
  const save = () => {
    const a = tin.trim(), b = tout.trim();
    if (!a && !b) return setErr("출근 또는 퇴근 시각을 넣어 주세요.");
    if ((a && !TIME_RE.test(a)) || (b && !TIME_RE.test(b))) return setErr("시각은 08:10처럼 적어 주세요.");
    setErr("");
    start(async () => {
      const r = await saveEdits([{ employee: emp, day, ...(a ? { clock_in: a } : {}), ...(b ? { clock_out: b } : {}) }]);
      if (r.error) return setErr(r.error);
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <form className="qc-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label>출근<input type="time" value={tin} onChange={(e) => setIn(e.target.value)} autoFocus /></label>
      <label>퇴근<input type="time" value={tout} onChange={(e) => setOut(e.target.value)} /></label>
      <button type="submit" disabled={pending}>{pending ? "저장 중" : "저장"}</button>
      <button type="button" className="qc-x" onClick={() => { setOpen(false); setErr(""); }}>취소</button>
      {err && <span className="qc-err">{err}</span>}
    </form>
  );
}
