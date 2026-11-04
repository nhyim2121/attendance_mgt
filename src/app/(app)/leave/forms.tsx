"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { LeavePolicy } from "@/lib/vacation";
import { addAdjustAction, addVacationAction, deleteAdjustAction, deleteVacationAction, savePolicyAction } from "./actions";

type Res = { ok?: string; error?: string } | null;
const Msg = ({ r }: { r: Res }) => (r ? <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div> : null);

// 반차·반반차 빠른 선택 (근무 기준 08:30~17:30, 점심 12:00~13:00)
const PRESETS: Record<string, [string, string, string][]> = {
  반차: [["오전", "08:30", "13:30"], ["오후", "13:30", "17:30"]],
  반반차: [["오전", "08:30", "10:30"], ["오후", "15:30", "17:30"]],
};

export function VacationForm({ names, types, rangeTypes, today }: {
  names: [string, string][]; types: string[]; rangeTypes: string[]; today: string;
}) {
  const [r, action, pending] = useActionState(addVacationAction, null);
  const [type, setType] = useState("연차");
  const [start, setStart] = useState(today);
  const [times, setTimes] = useState<[string, string]>(["", ""]);
  const range = rangeTypes.includes(type);
  const timed = !range;
  return (
    <form action={action} className="stack" style={{ gap: 12 }} key={r?.ok ?? "form"}>
      <Msg r={r} />
      <div className="row end">
        <label className="field">직원
          <select name="name" required defaultValue="">
            <option value="" disabled>선택</option>
            {names.map(([n, d]) => <option key={n} value={n}>{n}{d ? ` (${d})` : ""}</option>)}
          </select>
        </label>
        <label className="field">유형
          <select name="type" value={type} onChange={(e) => { setType(e.target.value); setTimes(["", ""]); }}>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="field">{range ? "시작일" : "날짜"}
          <input type="date" name="start" required value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        {range && <label className="field">종료일<input type="date" name="end" min={start} defaultValue={start} /></label>}
        {timed && (
          <>
            <label className="field">시작 시각<input type="text" name="startTime" placeholder="13:30" size={6} value={times[0]}
              onChange={(e) => setTimes([e.target.value, times[1]])} required={type === "외출"} /></label>
            <label className="field">종료 시각<input type="text" name="endTime" placeholder="17:30" size={6} value={times[1]}
              onChange={(e) => setTimes([times[0], e.target.value])} required={type === "외출"} /></label>
            {(PRESETS[type] ?? []).map(([l, a, b]) => (
              <button key={l} type="button" className="btn sm" onClick={() => setTimes([a, b])}>{l}</button>
            ))}
          </>
        )}
      </div>
      <div className="row end">
        <label className="field" style={{ flex: 2, minWidth: 220 }}>사유<input type="text" name="reason" placeholder="개인사유, 병원 등" /></label>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>비고<input type="text" name="note" placeholder="하이웍스 결재번호 등" /></label>
        <button className="btn primary" disabled={pending}>등록</button>
      </div>
      <p className="caption" style={{ margin: 0 }}>
        기간 휴가는 주말·공휴일을 빼고 하루씩 들어갑니다. 등록하면 일일 현황·직원별 시트·대시보드에 바로 반영됩니다.
        하이웍스 근태현황 파일·일일 근태 보고서에 이미 적힌 휴가는 다시 등록하지 않아도 사용 일수에 들어갑니다.
      </p>
    </form>
  );
}

export function DeleteButton({ id, kind, label = "삭제" }: { id: number; kind: "vacation" | "adjust"; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn sm danger" disabled={pending} onClick={() => {
      if (!confirm("삭제할까요?")) return;
      start(async () => {
        await (kind === "vacation" ? deleteVacationAction(id) : deleteAdjustAction(id));
        router.refresh();
      });
    }}>{label}</button>
  );
}

export function AdjustForm({ names, fy }: { names: string[]; fy: number }) {
  const [r, action, pending] = useActionState(addAdjustAction, null);
  return (
    <form action={action} className="stack" style={{ gap: 10 }} key={r?.ok ?? "form"}>
      <Msg r={r} />
      <div className="row end">
        <label className="field">직원
          <select name="name" required defaultValue="">
            <option value="" disabled>선택</option>
            {names.map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <label className="field">회계연도<input type="number" name="fy" defaultValue={fy} min={2000} max={2100} style={{ width: 100 }} /></label>
        <label className="field">일수 (+부여 / −차감)<input type="number" name="days" step={0.25} placeholder="예: 2 또는 -1" style={{ width: 140 }} required /></label>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>사유<input type="text" name="reason" placeholder="전년도 이월, 포상휴가, 선사용 등" /></label>
        <button className="btn primary" disabled={pending}>추가</button>
      </div>
    </form>
  );
}

export function PolicyForm({ p }: { p: LeavePolicy }) {
  const [r, action, pending] = useActionState(savePolicyAction, null);
  const num = (k: keyof LeavePolicy, label: string, attrs: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">{label}<input type="number" name={k} defaultValue={p[k] as number} style={{ width: 110 }} {...attrs} /></label>
  );
  const check = (k: keyof LeavePolicy, label: string) => (
    <label className="row" style={{ gap: 6 }}><input type="checkbox" name={k} defaultChecked={p[k] as boolean} />{label}</label>
  );
  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <Msg r={r} />
      <fieldset className="fs">
        <legend>연차 (회계연도 기준)</legend>
        <div className="row end">
          {num("fyStartMonth", "회계연도 시작 월", { min: 1, max: 12 })}
          {num("baseDays", "기본 연차(일)", { min: 0, max: 30, step: 0.5 })}
          {num("addEvery", "가산 주기(년)", { min: 1, max: 10 })}
          {num("maxDays", "연차 상한(일)", { min: 0, max: 60 })}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {check("prorate", "입사 다음 회계연도에는 입사 연도 재직일만큼 비례 부여")}
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>끝수
            <select name="prorateRound" defaultValue={p.prorateRound}>
              <option value="halfRound">0.5일 단위 반올림 (하이웍스 방식)</option><option value="half">0.5일 단위 올림</option>
              <option value="one">1일 단위 올림</option><option value="none">그대로 (소수 둘째 자리)</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className="fs">
        <legend>월차 (입사 1년 미만)</legend>
        <div className="row">{check("monthly", "입사일로부터 매달 같은 날 1일씩 부여")}</div>
        <div className="row end" style={{ marginTop: 10 }}>
          {num("monthlyMax", "월차 상한(일)", { min: 0, max: 12 })}
          {num("joinCutoffDay", "입사일 기준(일, 포함)", { min: 0, max: 31 })}
          {num("joinExtra", "입사월 추가 월차(일)", { min: 0, max: 5, step: 0.5 })}
        </div>
        <p className="caption" style={{ margin: "8px 0 0" }}>
          회사 규정: 입사일이 기준일 이전(그날 포함)이면 입사한 달 몫으로 추가 월차를 입사일에 줍니다. 예) 기준 10일, 추가 1일 → 3월 10일 입사자는
          3/10에 1일, 이후 4/10·5/10 … 매달 1일. 쓰지 않으려면 추가 일수를 0으로.
        </p>
      </fieldset>
      <fieldset className="fs">
        <legend>외출</legend>
        <div className="row end">
          {check("outingDeduct", "외출 시간을 연차에서 차감")}
          {num("outingHoursPerDay", "연차 1일 = (시간)", { min: 1, max: 24 })}
        </div>
      </fieldset>
      <fieldset className="fs">
        <legend>연차 대상에서 뺄 사람</legend>
        <textarea name="exclude" rows={2} defaultValue={(p.exclude ?? []).join(", ")} placeholder="예: 임채웅, 김동수, 임향미" />
        <p className="caption" style={{ margin: "6px 0 0" }}>임원처럼 연차 관리 대상이 아닌 사람의 이름을 쉼표로 적으면 연차 현황·현황 보고서·휴가 홈 집계에서 뺍니다.</p>
      </fieldset>
      <div><button className="btn primary" disabled={pending}>저장</button></div>
    </form>
  );
}
