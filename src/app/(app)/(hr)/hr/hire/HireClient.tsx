"use client";
/** 채용관리: 지원자 카드 → 모달(단계표시·다음 단계·합격/불합격 통보) → 스낵바 되돌리기 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Steps, useSnack } from "@/components/ux/Kit";
import { restoreApplicant, setApplicantStage } from "./actions";

export interface App { id: number; name: string; posting: string; stage: string; interview: string; years: string; score: string; notice: string; purge: string; got: string }
const FLOW = ["서류 검토", "서류 합격", "면접 예정", "면접 완료", "최종 합격"];

export function ApplicantCard({ a }: { a: App }) {
  const router = useRouter();
  const snack = useSnack();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const idx = a.stage === "불합격" ? FLOW.length : Math.max(0, FLOW.indexOf(a.stage === "입사 확정" ? "최종 합격" : a.stage));
  const next = FLOW[idx + 1];
  const go = (stage: string, text: string) => start(async () => {
    const r = await setApplicantStage(a.id, stage);
    if (r.error) return snack({ text: r.error });
    setOpen(false);
    snack({ text, undo: r.prev ? async () => { await restoreApplicant(a.id, r.prev!); router.refresh(); } : undefined });
    router.refresh();
  });
  return (
    <>
      <button type="button" className="ux-pcard ux-plain" onClick={() => setOpen(true)} style={{ textAlign: "left" }}>
        <b style={{ fontSize: 13.5 }}>{a.name}</b>
        <span className="ux-sub">{a.posting || "공고 미정"}{a.interview ? ` · 면접 ${a.interview.slice(5)}` : ""}{a.score ? ` · ${a.score}점` : ""}</span>
      </button>
      {open && (
        <div className="ux-modal-bg" onClick={() => setOpen(false)}>
          <div className="ux-modal" role="dialog" aria-modal="true" aria-label={a.name} onClick={(e) => e.stopPropagation()} style={{ opacity: pending ? 0.7 : 1 }}>
            <div className="ux-modal-h"><b>{a.name}</b><span className="ux-sub" style={{ marginLeft: 8 }}>{a.posting}</span>
              <button type="button" className="ux-ibtn soft" aria-label="닫기" onClick={() => setOpen(false)}>×</button></div>
            <div style={{ margin: "10px 0 14px" }}><Steps steps={FLOW} at={a.stage === "불합격" ? -1 : idx + (a.stage === "최종 합격" || a.stage === "입사 확정" ? 1 : 0)} color="#7c3aed" /></div>
            <table className="ux-list"><tbody>
              <tr><td className="ux-sub" style={{ width: 110 }}>지금 단계</td><td><b>{a.stage || "서류 검토"}</b></td></tr>
              <tr><td className="ux-sub">접수일</td><td>{a.got}</td></tr>
              {a.years && <tr><td className="ux-sub">경력</td><td>{a.years}년</td></tr>}
              {a.interview && <tr><td className="ux-sub">면접일</td><td>{a.interview}</td></tr>}
              {a.notice && <tr><td className="ux-sub">결과 통보일</td><td>{a.notice}</td></tr>}
              {a.purge && <tr><td className="ux-sub">서류 반환·파기</td><td>{a.purge}까지</td></tr>}
            </tbody></table>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Link className="ux-btn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", color: "#1b2333" }} href={`/hr/applicant?id=${a.id}`}>상세 · 고치기</Link>
              {a.stage !== "불합격" && a.stage !== "최종 합격" && a.stage !== "입사 확정" && <>
                <button type="button" className="ux-btn danger" onClick={() => go("불합격", `${a.name} 불합격 — 통보일을 오늘로 적었어요`)}>불합격 통보</button>
                {next && next !== "최종 합격" && <button type="button" className="ux-btn" onClick={() => go(next, `${a.name} → ${next}`)}>{next}로</button>}
                <button type="button" className="ux-btn primary" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={() => go("최종 합격", `${a.name} 최종 합격 — 통보일을 오늘로 적었어요`)}>합격 통보</button>
              </>}
              {a.stage === "최종 합격" && <button type="button" className="ux-btn primary" onClick={() => go("입사 확정", `${a.name} 입사 확정`)}>입사 확정</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
