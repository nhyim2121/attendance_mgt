"use client";
/** 새 인사노무 화면 공통 UI (2026-11-27): 고정헤더·햄버거→드로어·뒤로가기, 세그먼트, 툴팁, 뱃지(바운스), 진행막대, 단계표시,
 *  모달(확대전환), 스낵바, 플로팅버튼, 순차등장. 스타일은 sb.css의 .ux-* */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";

// ---------------------------------------------------------------- 화면 제목 (2026-11-28 B′안: 위쪽 메뉴로 바뀌어 남색 고정헤더·햄버거 드로어는 뺌)
export function UxHead({ crumb, title, right }: { crumb: string; title: string; menu?: [string, string][]; back?: string; right?: ReactNode }) {
  return (
    <div className="ux-title">
      <div><small>{crumb}</small><h1>{title}</h1></div>
      {right && <span className="r">{right}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- 세그먼트 (주소 값)
export function Segment({ name, value, options, label }: { name: string; value: string; options: [string, string, (string | number)?][]; label: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div className="ux-seg" role="tablist" aria-label={label} style={{ opacity: pending ? 0.7 : 1 }}>
      {options.map(([v, l, badge]) => (
        <button key={v} type="button" role="tab" aria-selected={v === value} className={v === value ? "on" : ""}
          onClick={() => { const q = new URLSearchParams(sp.toString()); q.set(name, v); start(() => router.push(`${path}?${q}`, { scroll: false })); }}>
          {l}{badge ? <span className="ux-badge sm">{badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** 주소 값 체크박스 */
export function ParamCheck({ name, on, label }: { name: string; on: boolean; label: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <label className="ux-check">
      <input type="checkbox" checked={on} onChange={() => { const q = new URLSearchParams(sp.toString()); if (on) q.set(name, "0"); else q.set(name, "1"); router.push(`${path}?${q}`, { scroll: false }); }} />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------- 작은 부품
export function Tip({ text, label = "설명" }: { text: string; label?: string }) {
  return <span className="ux-tip"><span tabIndex={0} aria-label={label} className="ux-tip-i">i</span><span className="ux-tipbox" role="tooltip">{text}</span></span>;
}
export function Badge({ children, bounce, tone = "red" }: { children: ReactNode; bounce?: boolean; tone?: "red" | "navy" | "amber" | "green" }) {
  return <span className={`ux-badge ${tone}${bounce ? " bounce" : ""}`}>{children}</span>;
}
export function Bar({ pct, color, label }: { pct: number; color?: string; label: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <span className="ux-bar" role="progressbar" aria-label={label} aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${p}%`, background: color }} />
    </span>
  );
}
/** 단계표시: at = 지금 단계(0부터), 앞 단계는 ✓ */
export function Steps({ steps, at, color }: { steps: string[]; at: number; color?: string }) {
  return (
    <ol className="ux-steps" style={color ? ({ "--st": color } as React.CSSProperties) : undefined}>
      {steps.map((s, i) => (
        <li key={s} className={i < at ? "done" : i === at ? "now" : ""}><span className="ux-step-n">{i < at ? "✓" : i + 1}</span><span>{s}</span></li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- 모달 (확대전환)
export function Modal({ trigger, title, children, className, wide }: { trigger: ReactNode; title: string; children: ReactNode; className?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button type="button" className={className ?? "ux-plain"} onClick={() => setOpen(true)}>{trigger}</button>
      {open && (
        <div className="ux-modal-bg" onClick={() => setOpen(false)}>
          <div className={`ux-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
            <div className="ux-modal-h"><b>{title}</b><button type="button" className="ux-ibtn soft" aria-label="닫기" onClick={() => setOpen(false)}>×</button></div>
            <div className="ux-modal-b">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 스낵바
type Snack = { text: string; undo?: () => void | Promise<void> };
const SnackCtx = createContext<(s: Snack) => void>(() => {});
export const useSnack = () => useContext(SnackCtx);
export function SnackHost({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Snack | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((x: Snack) => {
    setS(x);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setS(null), 5000);
  }, []);
  return (
    <SnackCtx.Provider value={show}>
      {children}
      {s && (
        <div className="ux-snack" role="status">
          {s.text}
          {s.undo && <button type="button" onClick={async () => { const u = s.undo; setS(null); await u?.(); }}>되돌리기</button>}
        </div>
      )}
    </SnackCtx.Provider>
  );
}

/** 플로팅버튼: 주소로 가거나(href) 누르면 onClick */
export function Fab({ href, label, icon = "plus", onClick }: { href?: string; label: string; icon?: "plus" | "send" | "pen"; onClick?: () => void }) {
  const svg = icon === "send" ? <path d="M4 12l16-8-6 16-2-7-8-1z" /> : icon === "pen" ? <path d="M4 20h4L20 8l-4-4L4 16v4z" /> : <path d="M12 5v14M5 12h14" />;
  const inner = <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">{svg}</svg>{label}</>;
  return href ? <Link href={href} className="ux-fab noprint">{inner}</Link> : <button type="button" className="ux-fab noprint" onClick={onClick}>{inner}</button>;
}

/** 순차등장: 자식마다 조금씩 늦게 올라온다 */
export function Stagger({ children, className, step = 0.06 }: { children: ReactNode[]; className?: string; step?: number }) {
  return <div className={className}>{children.map((c, i) => <div key={i} className="ux-rise" style={{ animationDelay: `${0.04 + i * step}s` }}>{c}</div>)}</div>;
}
