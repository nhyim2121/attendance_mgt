"use client";

import { useActionState } from "react";
import { WEEKDAYS_KR } from "@/lib/config";
import { saveHolidays, saveRule } from "./actions";

type Res = { ok?: string; error?: string } | null;
const Msg = ({ r }: { r: Res }) => (r ? <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div> : null);

export interface RuleView {
  start: string; end: string; grace: number; overtime: number; round: number; workdays: number[]; labelAll: boolean;
}

export function RuleForm({ rule }: { rule: RuleView }) {
  const [r, action, pending] = useActionState(saveRule, null);
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <div className="row">
        <label className="field">출근 기준<input type="text" name="start" defaultValue={rule.start} placeholder="08:30" size={6} /></label>
        <label className="field">퇴근 기준<input type="text" name="end" defaultValue={rule.end} placeholder="17:30" size={6} /></label>
        <label className="field">지각 유예(분)<input type="number" name="grace" defaultValue={rule.grace} min={0} max={120} step={5} /></label>
      </div>
      <div className="row">
        <label className="field" title="이 시각 이후 퇴근하면 근무형태를 '연장(HH:MM)'으로 적습니다.">연장 표기 기준(퇴근 기준 + 분)
          <input type="number" name="overtime" defaultValue={rule.overtime} min={0} max={240} step={10} /></label>
        <label className="field">연장·휴일 시각 단위(분)
          <select name="round" defaultValue={rule.round}>{[10, 15, 30, 60].map((m) => <option key={m}>{m}</option>)}</select>
        </label>
      </div>
      <div>
        <div style={{ fontSize: ".85rem", marginBottom: 4 }}>근무 요일</div>
        <div className="row">
          {WEEKDAYS_KR.map((w, i) => (
            <label key={w} className="row" style={{ gap: 4 }}>
              <input type="checkbox" name="workdays" value={i} defaultChecked={rule.workdays.includes(i)} />{w}
            </label>
          ))}
        </div>
      </div>
      <label className="row" style={{ gap: 6 }} title="끄면 수작업 시트처럼 휴일·연장·출장 등 특이한 날만 근무형태를 적습니다.">
        <input type="checkbox" name="labelAll" defaultChecked={rule.labelAll} /> 평범한 날에도 근무형태 기입
      </label>
      <Msg r={r} />
      <div><button className="btn primary" disabled={pending}>근무 기준 저장</button></div>
    </form>
  );
}

export function HolidayForm({ text }: { text: string }) {
  const [r, action, pending] = useActionState(saveHolidays, null);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <label className="field">한 줄에 하나씩: YYYY-MM-DD 이름
        <textarea name="text" rows={16} defaultValue={text} />
      </label>
      <p className="caption" style={{ margin: 0 }}>회사 휴무일(예: 2026-05-04 회사휴무)도 여기에 추가하세요.</p>
      <Msg r={r} />
      <div><button className="btn primary" disabled={pending}>공휴일 저장</button></div>
    </form>
  );
}
