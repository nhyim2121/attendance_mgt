"use client";
/** 휴일·연장 달력·근태 기입의 '돋보기': 기본 범위(영업팀 임택권·생산팀·품질팀…) 밖의 직원을 찾아 넣고 빼기. 넣은 사람은 설정에 저장된다. */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveEditScope } from "./actions";

export default function ScopeSearch({ view, added, candidates }: { view: "cal" | "edit"; added: string[]; candidates: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const save = (next: string[]) => start(async () => {
    const r = await saveEditScope(view, next);
    if (r.error) { setMsg(r.error); return; }
    setMsg(""); setQ(""); router.refresh();
  });
  const hits = q.trim() ? candidates.filter((c) => c.includes(q.trim()) && !added.includes(c)).slice(0, 12) : [];
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 6, flexWrap: "wrap", opacity: pending ? 0.6 : 1 }}>
      <details className="pop left">
        <summary className="btn" aria-label="직원 찾아서 넣기" title="기본 범위 밖 직원 찾아서 넣기">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" style={{ verticalAlign: -2 }}>
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg> 직원 추가
        </summary>
        <div className="pop-body" style={{ minWidth: 260 }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 입력" aria-label="직원 이름" style={{ width: "100%" }} />
          {hits.map((h) => (
            <button key={h} type="button" className="btn sm" style={{ display: "block", width: "100%", textAlign: "left", marginTop: 4 }} onClick={() => save([...added, h])}>+ {h}</button>
          ))}
          {q.trim() && !hits.length && <p className="caption" style={{ margin: "6px 0 0" }}>찾는 직원이 없습니다 (이미 보이거나 그 달 기록 없음).</p>}
          {msg && <p className="caption" style={{ color: "#be123c", margin: "6px 0 0" }}>{msg}</p>}
        </div>
      </details>
      {added.map((a) => (
        <span key={a} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {a}<button type="button" aria-label={`${a} 빼기`} onClick={() => save(added.filter((x) => x !== a))}
            style={{ border: 0, background: "none", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
        </span>
      ))}
    </span>
  );
}
