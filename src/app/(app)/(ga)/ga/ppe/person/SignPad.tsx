"use client";
/** 전자서명 받기: 서명할 지급 기록 고르기 → 확인 문구 동의 → 손가락(태블릿·폰)·마우스로 서명 → 저장.
 *  서명은 PNG로 지급 기록마다 저장된다 (actions.signPpeImage). */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { signPpeImage } from "../actions";

export interface SignRow { id: number; label: string }

export default function SignPad({ name, rows }: { name: string; rows: SignRow[] }) {
  const router = useRouter();
  const box = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);
  const [pick, setPick] = useState<number[]>(rows.map((r) => r.id));
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  // 화면 배율에 맞춰 선명하게
  useEffect(() => {
    const c = box.current!;
    const fit = () => {
      const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext("2d")!;
      g.scale(dpr, dpr); g.lineWidth = 2.6; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#111827";
      setInked(false);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const pos = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    box.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const g = box.current!.getContext("2d")!, [x, y] = pos(e);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const g = box.current!.getContext("2d")!, [x, y] = pos(e);
    g.lineTo(x, y); g.stroke();
    setInked(true);
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = box.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setInked(false);
  };

  /** 흰 바탕을 깔아 PNG로 (투명 바탕은 인쇄·뷰어에서 검게 보일 수 있다) */
  const png = () => {
    const c = box.current!, out = document.createElement("canvas");
    out.width = c.width; out.height = c.height;
    const g = out.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, out.width, out.height); g.drawImage(c, 0, 0);
    return out.toDataURL("image/png");
  };

  const save = () => {
    if (!pick.length) return setMsg({ error: "서명할 지급 기록을 골라 주세요." });
    if (!agree) return setMsg({ error: "확인 문구에 동의해 주세요." });
    if (!inked) return setMsg({ error: "서명란에 서명해 주세요." });
    start(async () => {
      const r = await signPpeImage(name, pick, png());
      setMsg(r);
      if (r.ok) { clear(); setAgree(false); router.refresh(); }
    });
  };

  if (!rows.length) return <p className="fd-empty">서명받을 기록이 없습니다. 모든 지급 기록이 수령 확인되었습니다.</p>;
  return (
    <div className="pp-signpad">
      <div className="pp-sign-rows">
        <label className="check"><input type="checkbox" checked={pick.length === rows.length} onChange={(e) => setPick(e.target.checked ? rows.map((r) => r.id) : [])} /> <b>전체</b></label>
        {rows.map((r) => (
          <label key={r.id} className="check">
            <input type="checkbox" checked={pick.includes(r.id)} onChange={(e) => setPick(e.target.checked ? [...pick, r.id] : pick.filter((x) => x !== r.id))} /> {r.label}
          </label>
        ))}
      </div>
      <label className="check pp-agree">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        본인 <b>{name}</b>은(는) 위 {pick.length}건의 보호구·피복을 지급받았으며, 작업 중 착용하고 파손·분실 시 바로 알리겠습니다.
      </label>
      <div className="pp-canvas-wrap">
        <canvas ref={box} className="pp-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label="서명란" />
        {!inked && <span className="pp-canvas-hint">여기에 서명하세요 ({name})</span>}
      </div>
      {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.ok ?? msg.error}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" onClick={clear} disabled={pending}>지우고 다시</button>
        <button type="button" className="btn primary" onClick={save} disabled={pending}>{pending ? "저장 중…" : `서명 저장 (${pick.length}건)`}</button>
      </div>
    </div>
  );
}
