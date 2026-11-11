"use client";
/** 계정별 권한 표: 계정마다 업무 영역 × 읽기·등록·수정·삭제 (lib/perm.ts). 관리자 계정은 언제나 전체. */
import { useState, useTransition } from "react";
import { type AreaPerms, PERM_ACTIONS, PERM_AREAS, PERM_LABEL, type PermAction } from "@/lib/perm";
import { savePerms } from "./actions";

export interface PermUser { loginId: string; name: string; role: string; custom: boolean; perms: AreaPerms }

export default function PermMatrix({ users }: { users: PermUser[] }) {
  return (
    <div className="pm-list">
      {users.map((u) => <PermCard key={u.loginId} u={u} />)}
    </div>
  );
}

function PermCard({ u }: { u: PermUser }) {
  const admin = u.role === "관리자";
  const [custom, setCustom] = useState(u.custom);
  const [p, setP] = useState<AreaPerms>(u.perms);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const has = (a: string, x: PermAction) => !!p[a]?.includes(x);
  const toggle = (a: string, x: PermAction) => setP((cur) => {
    const list = cur[a] ?? [];
    let next = list.includes(x) ? list.filter((y) => y !== x) : [...list, x];
    if (x === "read" && list.includes("read")) next = []; // 읽기를 끄면 그 영역 전체를 끈다
    if (x !== "read" && !list.includes(x) && !next.includes("read")) next = ["read", ...next];
    return { ...cur, [a]: next };
  });
  const rowAll = (a: string, on: boolean) => setP((cur) => ({ ...cur, [a]: on ? [...PERM_ACTIONS] : [] }));
  const save = (mode: "role" | "custom") => start(async () => {
    const r = await savePerms(u.loginId, mode, p);
    setMsg(r);
    if (r?.ok && mode === "role") setCustom(false);
  });
  const editable = !admin && custom;
  return (
    <section className="pm-card">
      <header className="pm-head">
        <b>{u.name}</b><span className="muted">{u.loginId}</span>
        <span className={`pm-role${admin ? " admin" : ""}`}>{u.role}</span>
        <span className="spacer" />
        {admin ? <span className="muted">관리자는 언제나 모든 권한 (잠김 방지)</span> : (
          <span className="pm-mode" role="group" aria-label="권한 방식">
            <button type="button" className={custom ? "" : "on"} onClick={() => (custom ? save("role") : null)} disabled={pending}>역할 기본값</button>
            <button type="button" className={custom ? "on" : ""} onClick={() => setCustom(true)} disabled={pending}>직접 지정</button>
          </span>
        )}
      </header>
      <table className="pm-tbl">
        <thead><tr><th>업무 영역</th>{PERM_ACTIONS.map((x) => <th key={x}>{PERM_LABEL[x]}</th>)}{editable && <th>전체</th>}</tr></thead>
        <tbody>
          {PERM_AREAS.map((a) => (
            <tr key={a.key} className={has(a.key, "read") ? "" : "off"}>
              <td>{a.label}</td>
              {PERM_ACTIONS.map((x) => (
                <td key={x} className="c">
                  <input type="checkbox" aria-label={`${a.label} ${PERM_LABEL[x]}`} checked={admin || has(a.key, x)} disabled={!editable}
                    onChange={() => toggle(a.key, x)} />
                </td>
              ))}
              {editable && (
                <td className="c">
                  <button type="button" className="btn sm" onClick={() => rowAll(a.key, !PERM_ACTIONS.every((x) => has(a.key, x)))}>
                    {PERM_ACTIONS.every((x) => has(a.key, x)) ? "모두 끄기" : "모두 켜기"}</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!admin && (
        <div className="row" style={{ marginTop: 8, alignItems: "center" }}>
          {editable && <button type="button" className="btn primary sm" disabled={pending} onClick={() => save("custom")}>{pending ? "저장 중…" : "권한 저장"}</button>}
          {!custom && <span className="caption" style={{ margin: 0 }}>지금은 역할({u.role}) 기본값을 따릅니다. 바꾸려면 [직접 지정]을 누르세요.</span>}
          {msg && <span className={msg.ok ? "pm-ok" : "pm-err"}>{msg.ok ?? msg.error}</span>}
        </div>
      )}
    </section>
  );
}
