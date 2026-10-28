"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Employee } from "@/lib/employees";
import { addFromCaps, saveEmployeesAction } from "./actions";

type Res = { ok?: string; error?: string } | null;

function statusOf(e: Employee, today: string): string {
  if (e.leaveDate && e.leaveDate < today) return "퇴사";
  if (e.joinDate && e.joinDate > today) return "입사 예정";
  return "재직";
}

export default function EmployeeEditor({ emps, depts, today, seen }: {
  emps: Employee[]; depts: string[]; today: string; seen: Record<string, [string, string]>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(emps);
  const [view, setView] = useState<"전체" | "재직" | "퇴사">("전체");
  const [msg, setMsg] = useState<Res>(null);
  const [pending, start] = useTransition();

  const set = (i: number, patch: Partial<Employee>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const shown = rows.map((r, i) => [r, i] as const).filter(([r]) => {
    const s = statusOf(r, today);
    return view === "전체" || (view === "재직" ? s !== "퇴사" : s === "퇴사");
  });
  const bad = rows.filter((e) => e.joinDate && e.leaveDate && e.leaveDate < e.joinDate).map((e) => e.name);
  const dirty = JSON.stringify(rows) !== JSON.stringify(emps);
  const save = () => start(async () => {
    const r = await saveEmployeesAction(rows);
    setMsg(r);
    if (r.ok) router.refresh();
  });
  const span = (e: Employee) => seen[e.capsName || e.name];
  const input = (i: number, k: keyof Employee, w = 90, type = "text") => (
    <input type={type} value={(rows[i][k] as string | null) ?? ""} style={{ minWidth: w }}
      onChange={(ev) => set(i, { [k]: type === "date" ? ev.target.value || null : ev.target.value })} />
  );

  return (
    <>
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.error && <div className="msg err">{msg.error}</div>}
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="seg">
          {(["전체", "재직", "퇴사"] as const).map((v) => (
            <button key={v} className={v === view ? "on" : ""} onClick={() => setView(v)}>{v}</button>
          ))}
        </span>
      </div>
      <datalist id="depts">{depts.map((d) => <option key={d} value={d} />)}</datalist>
      <div className="tbl-wrap tall">
        <table className="tbl edit">
          <thead><tr>
            <th>이름</th><th>상태</th><th>부서</th><th>직급</th><th title="비우면 처음부터 재직으로 봅니다.">입사일</th>
            <th title="마지막 근무일. 비우면 재직 중.">퇴사일</th><th title="캡스에 이름이 다르게 찍힐 때만 (예: 홍길동A)">캡스 이름</th>
            <th>사번</th><th>비고</th><th>첫 출입(참고)</th><th>마지막 출입(참고)</th><th />
          </tr></thead>
          <tbody>
            {shown.map(([e, i]) => (
              <tr key={i}>
                <td>{input(i, "name", 80)}</td>
                <td className="ro">{statusOf(e, today)}</td>
                <td><input type="text" list="depts" value={e.dept} style={{ minWidth: 80 }} onChange={(ev) => set(i, { dept: ev.target.value })} /></td>
                <td>{input(i, "rank", 60)}</td>
                <td>{input(i, "joinDate", 130, "date")}</td>
                <td>{input(i, "leaveDate", 130, "date")}</td>
                <td>{input(i, "capsName")}</td>
                <td>{input(i, "empId", 60)}</td>
                <td>{input(i, "note", 140)}</td>
                <td className="ro">{span(e)?.[0] ?? ""}</td>
                <td className="ro">{span(e)?.[1] ?? ""}</td>
                <td><button className="btn sm danger" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>삭제</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption" style={{ marginTop: 8 }}>퇴사한 직원은 지우지 말고 퇴사일만 넣으면 지난 기록은 그대로 남습니다.</p>
      {bad.length > 0 && <div className="msg err">퇴사일이 입사일보다 빠른 직원: {bad.join(", ")}</div>}
      <div className="row">
        <button className="btn" onClick={() => setRows((rs) => [...rs, {
          name: "", capsName: "", empId: "", dept: "", rank: "", joinDate: null, leaveDate: null, note: "", ord: rs.length + 1,
        }])}>+ 직원 추가</button>
        <button className="btn primary" disabled={pending || !dirty || bad.length > 0} onClick={save}>저장</button>
        <button className="btn" disabled={pending || !dirty} onClick={() => setRows(emps)}>편집 취소</button>
      </div>
    </>
  );
}

export function AddFromCaps({ people }: { people: { name: string; first: string; last: string }[] }) {
  const router = useRouter();
  const [pick, setPick] = useState<string[]>([]);
  const [msg, setMsg] = useState<Res>(null);
  const [pending, start] = useTransition();
  return (
    <>
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      <div className="tbl-wrap tall">
        <table className="tbl">
          <thead><tr><th /><th>이름</th><th>첫 출입</th><th>마지막 출입</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.name}>
                <td><input type="checkbox" checked={pick.includes(p.name)}
                  onChange={(e) => setPick((v) => (e.target.checked ? [...v, p.name] : v.filter((x) => x !== p.name)))} /></td>
                <td>{p.name}</td><td>{p.first}</td><td>{p.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption" style={{ marginTop: 8 }}>직원이면 골라서 명부에 추가하세요 (경비·고객용 카드 등은 두세요).</p>
      <button className="btn" disabled={pending || !pick.length} onClick={() => start(async () => {
        const r = await addFromCaps(pick, Object.fromEntries(people.map((p) => [p.name, p.first])));
        setMsg(r);
        setPick([]);
        router.refresh();
      })}>명부에 추가</button>
    </>
  );
}
