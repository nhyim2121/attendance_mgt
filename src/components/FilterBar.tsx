"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  months: string[]; // 최근 달 먼저
  month: string | null;
  from: string;
  to: string;
  depts: string[];
  chosen: string[];
  onlyRoster: boolean;
  hasRoster: boolean;
  children?: React.ReactNode;
}

/** 기간·부서·명단 필터. 값은 주소(?month=…)에 담아 화면을 옮겨도 유지한다. */
export default function FilterBar({ months, month, from, to, depts, chosen, onlyRoster, hasRoster, children }: Props) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  function set(patch: Record<string, string | null>) {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v === null || v === "" ? q.delete(k) : q.set(k, v));
    start(() => router.push(`${path}?${q.toString()}`));
  }

  const toggleDept = (d: string) => {
    const next = chosen.includes(d) ? chosen.filter((x) => x !== d) : [...chosen, d];
    set({ dept: next.join(",") });
  };

  return (
    <div className="filters" style={{ opacity: pending ? 0.6 : 1 }}>
      <label className="field">월
        <select value={month ?? "custom"} onChange={(e) => set(e.target.value === "custom"
          ? { month: "custom", from, to } : { month: e.target.value, from: null, to: null })}>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
          <option value="custom">직접 선택</option>
        </select>
      </label>
      {month === null && (
        <>
          <label className="field">시작일<input type="date" value={from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="field">종료일<input type="date" value={to} onChange={(e) => set({ to: e.target.value })} /></label>
        </>
      )}
      {depts.length > 0 && (
        <details className="pop left">
          <summary className="btn">부서: {chosen.length ? chosen.join(", ") : "전체"}</summary>
          <div className="pop-body stack" style={{ gap: 6, minWidth: 180 }}>
            {depts.map((d) => (
              <label key={d} className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={chosen.includes(d)} onChange={() => toggleDept(d)} />{d}
              </label>
            ))}
            {chosen.length > 0 && <button className="btn sm" onClick={() => set({ dept: null })}>전체 보기</button>}
          </div>
        </details>
      )}
      {hasRoster && (
        <label className="check" title="직원 관리에 등록된 사람만, 입사일~퇴사일 사이 기록만 봅니다. 경비·외부 인원 등은 빠집니다.">
          <input type="checkbox" checked={onlyRoster} onChange={(e) => set({ all: e.target.checked ? null : "1" })} />
          등록된 직원만 (재직 기간)
        </label>
      )}
      <div className="spacer" />
      {children}
    </div>
  );
}
