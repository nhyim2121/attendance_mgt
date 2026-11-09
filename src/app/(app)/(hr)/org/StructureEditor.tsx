"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NODE_KINDS, type NodeKind, type OrgCompany, type OrgNode } from "@/lib/인사노무/org";
import { saveStructureAction } from "./actions";

type Res = { ok?: string; error?: string } | null;

/** 조직 구조(대표 → 임원 → 부서 → 반) 상자 추가·수정·순서 바꾸기, 회사 이름·로고 */
export default function StructureEditor({ nodes, company, emps }: {
  nodes: OrgNode[]; company: OrgCompany; emps: [string, string, string][]; // 이름, 부서, 직급
}) {
  const router = useRouter();
  const [rows, setRows] = useState(nodes);
  const [co, setCo] = useState(company);
  const [msg, setMsg] = useState<Res>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify([rows, co]) !== JSON.stringify([nodes, company]);
  const set = (id: string, patch: Partial<OrgNode>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const depts = [...new Set(emps.map(([, d]) => d).filter(Boolean))];

  // 화면에는 트리 순서(위 → 아래, 형제는 저장 순서)로 펼쳐 보인다
  const ids = new Set(rows.map((r) => r.id));
  const tree: [OrgNode, number][] = [];
  const walk = (parent: string | null, depth: number) => rows
    .filter((r) => (parent ? r.parent === parent : !r.parent || !ids.has(r.parent)))
    .forEach((r) => { if (!tree.some(([t]) => t.id === r.id)) { tree.push([r, depth]); walk(r.id, depth + 1); } });
  walk(null, 0);
  rows.filter((r) => !tree.some(([t]) => t.id === r.id)).forEach((r) => tree.push([r, 0])); // 순환된 것

  const below = (id: string): Set<string> => {
    const out = new Set([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const r of rows) if (r.parent && out.has(r.parent) && !out.has(r.id)) { out.add(r.id); grew = true; }
    }
    return out;
  };
  const move = (id: string, dir: -1 | 1) => setRows((rs) => {
    const me = rs.find((r) => r.id === id)!;
    const sib = rs.filter((r) => r.parent === me.parent);
    const other = sib[sib.indexOf(me) + dir];
    if (!other) return rs;
    const [a, b] = [rs.indexOf(me), rs.indexOf(other)];
    const out = [...rs];
    [out[a], out[b]] = [out[b], out[a]];
    return out;
  });
  const add = (parent: string | null) => setRows((rs) => [...rs, {
    id: `n${Date.now()}`, parent, kind: parent ? "unit" : "top", label: "새 상자", head: "", dept: "", members: [], extra: [],
  }]);
  const remove = (id: string) => setRows((rs) => {
    const me = rs.find((r) => r.id === id)!;
    return rs.filter((r) => r.id !== id).map((r) => (r.parent === id ? { ...r, parent: me.parent } : r));
  });
  const onLogo = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 500_000) { setMsg({ error: "로고 파일은 500KB 이하로 올려 주세요." }); return; }
    const rd = new FileReader();
    rd.onload = () => setCo((c) => ({ ...c, logo: String(rd.result) }));
    rd.readAsDataURL(f);
  };

  return (
    <>
      {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.ok ?? msg.error}</div>}
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
        <label className="field">회사 이름<input type="text" value={co.name} onChange={(e) => setCo({ ...co, name: e.target.value })} /></label>
        <label className="field">영문 이름<input type="text" value={co.nameEn} onChange={(e) => setCo({ ...co, nameEn: e.target.value })} /></label>
        <div className="row" style={{ gap: 6 }}>
          {co.logo && <img src={co.logo} alt="로고" style={{ height: 34 }} />}
          <label className="btn sm">로고 올리기<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => onLogo(e.target.files?.[0])} /></label>
          {co.logo && <button className="btn sm" onClick={() => setCo({ ...co, logo: "" })}>로고 빼기</button>}
        </div>
      </div>
      <datalist id="org-emps">{emps.map(([n, d, r]) => <option key={n} value={n}>{`${d} ${r}`}</option>)}</datalist>
      <div className="tbl-wrap"><table className="tbl edit">
        <thead><tr>
          <th>상자 이름</th><th>모양</th><th>상위</th><th>책임자</th><th>부서 직원 자동 포함</th><th>직접 넣을 직원</th>
          <th>명부에 없는 사람</th><th>색</th><th />
        </tr></thead>
        <tbody>
          {tree.map(([n, depth]) => {
            const no = below(n.id);
            return (
              <tr key={n.id}>
                <td style={{ paddingLeft: 8 + depth * 18 }}>
                  {depth > 0 && <span className="muted">└ </span>}
                  <input type="text" value={n.label} onChange={(e) => set(n.id, { label: e.target.value })} style={{ width: 120 }} />
                </td>
                <td>
                  <select value={n.kind} onChange={(e) => set(n.id, { kind: e.target.value as NodeKind })}>
                    {Object.entries(NODE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td>
                  <select value={n.parent ?? ""} onChange={(e) => set(n.id, { parent: e.target.value || null })}>
                    <option value="">(맨 위)</option>
                    {tree.filter(([t]) => !no.has(t.id)).map(([t, d]) => <option key={t.id} value={t.id}>{"· ".repeat(d)}{t.label}</option>)}
                  </select>
                </td>
                <td>
                  <input type="text" list="org-emps" value={n.head} placeholder="이름" onChange={(e) => set(n.id, { head: e.target.value })} style={{ width: 90 }} />
                  {n.head && !emps.some(([e]) => e === n.head) && (
                    <input type="text" value={n.headPhone ?? ""} placeholder="휴대전화" title="명부에 없는 사람이라 여기 적은 번호가 조직도에 나옵니다"
                      onChange={(e) => set(n.id, { headPhone: e.target.value })} style={{ width: 120, display: "block", marginTop: 4 }} />
                  )}
                </td>
                <td>
                  <select value={n.dept} onChange={(e) => set(n.id, { dept: e.target.value })}>
                    <option value="">없음</option>
                    {depts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
                <td>
                  <details className="pop left">
                    <summary className="btn sm">{n.members.length ? `${n.members.length}명` : "고르기"}</summary>
                    <div className="pop-body" style={{ minWidth: 220, maxHeight: 320, overflow: "auto" }}>
                      {depts.map((d) => (
                        <div key={d} style={{ marginBottom: 6 }}>
                          <div className="sub-title">{d}</div>
                          {emps.filter(([, ed]) => ed === d).map(([e, , r]) => (
                            <label key={e} style={{ display: "block" }}>
                              <input type="checkbox" checked={n.members.includes(e)} onChange={() => set(n.id, {
                                members: n.members.includes(e) ? n.members.filter((m) => m !== e) : [...n.members, e],
                              })} /> {e} <span className="muted">{r}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>
                </td>
                <td>
                  <input type="text" value={n.extra.join(", ")} placeholder="과장 김선우, 사원 홍길동"
                    onChange={(e) => set(n.id, { extra: e.target.value.split(",").map((x) => x.trimStart()) })} style={{ width: 180 }} />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {n.kind === "unit" || n.kind === "sub" ? (
                    <>
                      <input type="color" value={n.color || "#ffffff"} title={n.color ? n.color : "자동"}
                        onChange={(e) => set(n.id, { color: e.target.value })} style={{ width: 34, height: 26, padding: 0, verticalAlign: "middle" }} />
                      {n.color ? <button className="btn sm" onClick={() => set(n.id, { color: "" })}>자동</button> : <span className="muted"> 자동</span>}
                    </>
                  ) : <span className="muted">-</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn sm" title="위로" onClick={() => move(n.id, -1)}>↑</button>{" "}
                  <button className="btn sm" title="아래로" onClick={() => move(n.id, 1)}>↓</button>{" "}
                  <button className="btn sm" onClick={() => add(n.id)}>+ 하위</button>{" "}
                  <button className="btn sm danger" onClick={() => remove(n.id)}>삭제</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => add(null)}>+ 맨 위 상자</button>
        <button className="btn primary" disabled={pending || !dirty} onClick={() => start(async () => {
          const r = await saveStructureAction(rows, co);
          setMsg(r);
          if (r.ok) router.refresh();
        })}>저장</button>
        <button className="btn" disabled={pending || !dirty} onClick={() => { setRows(nodes); setCo(company); }}>편집 취소</button>
      </div>
    </>
  );
}
