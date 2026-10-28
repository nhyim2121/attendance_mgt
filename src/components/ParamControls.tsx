"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

function useSetParam() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v === null || v === "" ? q.delete(k) : q.set(k, v));
    start(() => router.push(`${path}?${q.toString()}`));
  };
  return { set, pending };
}

/** 주소의 값 하나를 고르는 선택 상자 (기준일, 직원 등) */
export function ParamSelect({ name, value, options, label, reset = [] }: {
  name: string; value: string; options: [string, string][]; label?: string; reset?: string[];
}) {
  const { set, pending } = useSetParam();
  const select = (
    <select value={value} disabled={pending} onChange={(e) =>
      set({ [name]: e.target.value, ...Object.fromEntries(reset.map((r) => [r, null])) })}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return label ? <label className="field">{label}{select}</label> : select;
}

/** 주소의 날짜 값 */
export function ParamDate({ name, value, label, max }: { name: string; value: string; label: string; max?: string }) {
  const { set, pending } = useSetParam();
  return (
    <label className="field">{label}
      <input type="date" value={value} max={max} disabled={pending} onChange={(e) => e.target.value && set({ [name]: e.target.value })} />
    </label>
  );
}

/** 주소의 숫자 값 */
export function ParamNumber({ name, value, label, min, max, step = 1 }: {
  name: string; value: number; label: string; min: number; max: number; step?: number;
}) {
  const { set } = useSetParam();
  return (
    <label className="field">{label}
      <input type="number" defaultValue={value} min={min} max={max} step={step}
        onBlur={(e) => set({ [name]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && set({ [name]: e.currentTarget.value })} />
    </label>
  );
}

/** 여러 개 고르기 (직원 선택 등). 비우면 전체. */
export function ParamMulti({ name, values, options, label, allLabel }: {
  name: string; values: string[]; options: string[]; label: string; allLabel: string;
}) {
  const { set, pending } = useSetParam();
  const toggle = (v: string) => {
    const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
    set({ [name]: next.join(",") });
  };
  return (
    <details className="pop left" style={{ opacity: pending ? 0.6 : 1 }}>
      <summary className="btn">{label}: {values.length ? `${values.length}명` : allLabel}</summary>
      <div className="pop-body" style={{ columns: 3, minWidth: 360 }}>
        {values.length > 0 && <p><button className="btn sm" onClick={() => set({ [name]: null })}>{allLabel}</button></p>}
        {options.map((o) => (
          <label key={o} style={{ display: "block", padding: "2px 0" }}>
            <input type="checkbox" checked={values.includes(o)} onChange={() => toggle(o)} /> {o}
          </label>
        ))}
      </div>
    </details>
  );
}
