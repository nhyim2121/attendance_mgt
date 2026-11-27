"use client";
/** 인력계획 화면의 입력 부품: 정원 고치기, 충원 요청(모달 + 플로팅버튼), 단계 넘기기·지우기(스낵바 되돌리기) */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Fab, useSnack } from "@/components/ux/Kit";
import { type HirePlan, PLAN_STAGES } from "@/lib/인사노무/hrPlan";
import { deletePlan, restorePlan, saveCapacity, savePlan } from "./actions";

export function CapacityInput({ dept, value }: { dept: string; value: number | null }) {
  const router = useRouter();
  const snack = useSnack();
  const [v, setV] = useState(value === null ? "" : String(value));
  const [pending, start] = useTransition();
  const save = () => {
    const n = Number(v);
    if (v === "" || n === value) return;
    start(async () => {
      const r = await saveCapacity(dept, n);
      if (r.error) return snack({ text: r.error });
      snack({ text: `${dept} 정원을 ${n}명으로 저장했어요`, undo: value === null ? undefined : async () => { await saveCapacity(dept, value); setV(String(value)); router.refresh(); } });
      router.refresh();
    });
  };
  return (
    <input aria-label={`${dept} 정원`} inputMode="numeric" value={v} disabled={pending} placeholder="정원"
      onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      style={{ width: 52, minHeight: 32, border: "1px solid #cfd5df", borderRadius: 8, textAlign: "right", padding: "0 6px", font: "inherit" }} />
  );
}

export function PlanFab({ depts }: { depts: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Fab label="충원 요청" onClick={() => setOpen(true)} />
      {open && <PlanForm depts={depts} onClose={() => setOpen(false)} />}
    </>
  );
}

function PlanForm({ depts, onClose }: { depts: string[]; onClose: () => void }) {
  const router = useRouter();
  const snack = useSnack();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ title: "", dept: depts[0] ?? "", n: "1", why: "", when: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="ux-modal-bg" onClick={onClose}>
      <form className="ux-modal" role="dialog" aria-modal="true" aria-label="충원 요청" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); start(async () => {
          const r = await savePlan({ ...f, n: Number(f.n) || 1, stage: 0 });
          if (r.error) return snack({ text: r.error });
          onClose(); snack({ text: `「${f.title}」 충원 요청을 올렸어요` }); router.refresh();
        }); }}>
        <div className="ux-modal-h"><b>충원 요청</b><button type="button" className="ux-ibtn soft" aria-label="닫기" onClick={onClose}>×</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label className="ux-field" style={{ gridColumn: "1 / -1" }}>무엇을 (예: 생산팀 조립반)<input required value={f.title} onChange={set("title")} autoFocus /></label>
          <label className="ux-field">부서<select value={f.dept} onChange={set("dept")}>{depts.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label className="ux-field">인원<input inputMode="numeric" value={f.n} onChange={set("n")} /></label>
          <label className="ux-field">희망 입사<input type="month" value={f.when} onChange={set("when")} /></label>
          <label className="ux-field">사유<input value={f.why} onChange={set("why")} placeholder="예: 물량 증가, 퇴사자 대체" /></label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" className="ux-btn" onClick={onClose}>취소</button>
          <button type="submit" className="ux-btn primary" disabled={pending}>올리기</button>
        </div>
      </form>
    </div>
  );
}

export function PlanActions({ plan }: { plan: HirePlan }) {
  const router = useRouter();
  const snack = useSnack();
  const [pending, start] = useTransition();
  const done = plan.stage >= PLAN_STAGES.length;
  return (
    <span style={{ display: "inline-flex", gap: 6, opacity: pending ? 0.6 : 1 }}>
      {!done && <button type="button" className="ux-btn primary" style={{ minHeight: 36 }} onClick={() => start(async () => {
        await savePlan({ id: plan.id, stage: plan.stage + 1 });
        snack({ text: `「${plan.title}」 ${PLAN_STAGES[plan.stage]} 단계를 마쳤어요`, undo: async () => { await restorePlan(plan); router.refresh(); } });
        router.refresh();
      })}>{PLAN_STAGES[plan.stage]} 완료</button>}
      {plan.stage === 2 && <a className="ux-btn" style={{ minHeight: 36, display: "inline-flex", alignItems: "center" }} href="/hr/hire">채용관리로 ›</a>}
      <button type="button" className="ux-btn danger" style={{ minHeight: 36 }} onClick={() => start(async () => {
        const r = await deletePlan(plan.id);
        snack({ text: `「${plan.title}」을 지웠어요`, undo: r.removed ? async () => { await restorePlan(r.removed!); router.refresh(); } : undefined });
        router.refresh();
      })}>지우기</button>
    </span>
  );
}
