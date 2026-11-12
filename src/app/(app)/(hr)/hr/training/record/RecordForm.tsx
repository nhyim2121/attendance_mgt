"use client";
/** 교육 실시 기록 입력: 왼쪽 입력 · 오른쪽 교육일지 미리보기 */
import { useActionState, useMemo, useState } from "react";
import { saveTrainingRecord } from "../actions";

export interface Init {
  id: number; plan: number; day: string; name: string; kind: string; hours: string; time: string; place: string;
  by: string; cost: string; next: string; content: string; note: string; names: string[]; extra: string;
  until: string; target: string[]; cert: string[];
}
interface Plan { id: number; month: string; name: string; kind: string; target: string; status: string }
interface Person { name: string; dept: string; join: string; leave: string; office: boolean }

export default function RecordForm({ init, plans, kinds, people, absent, today }: {
  init: Init; plans: Plan[]; kinds: string[]; people: Person[]; absent: Record<string, Record<string, string>>; today: string;
}) {
  const [res, act, pending] = useActionState(saveTrainingRecord, null);
  const [v, setV] = useState(init);
  const [sel, setSel] = useState(() => new Set(init.names));
  // 수강 관리(온라인·위탁 과정): 대상자 · 수료 · 수료증
  const [course, setCourse] = useState(init.target.length > 0 || !!init.until);
  const [tgt, setTgt] = useState(() => new Set(init.target));
  const [cert, setCert] = useState(() => new Set(init.cert));
  const set = (k: keyof Init) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  // 그날 재직자만
  const staff = useMemo(() => people.filter((p) => (!p.join || p.join <= v.day) && (!p.leave || p.leave >= v.day)), [people, v.day]);
  const depts = useMemo(() => [...new Set(staff.map((p) => p.dept))], [staff]);
  const away = absent[v.day];
  const chosen = staff.filter((p) => sel.has(p.name));
  const missing = staff.filter((p) => !sel.has(p.name));
  const flip = (s: Set<string>, n: string, on: boolean) => { const x = new Set(s); if (on) x.add(n); else x.delete(n); return x; };
  const toggle = (n: string) => {
    if (!course) { setSel((s) => flip(s, n, !s.has(n))); return; }
    // 대상 아님 → 미수료 → 수료 → 수료·수료증 → 대상 아님
    const st = cert.has(n) ? 3 : sel.has(n) ? 2 : tgt.has(n) ? 1 : 0, nx = (st + 1) % 4;
    setTgt((s) => flip(s, n, nx > 0)); setSel((s) => flip(s, n, nx >= 2)); setCert((s) => flip(s, n, nx === 3));
  };
  const stateOf = (n: string) => (cert.has(n) ? "수료·수료증" : sel.has(n) ? "수료" : tgt.has(n) ? "미수료" : "");
  const setMany = (names: string[], on: boolean) => {
    const f = (s: Set<string>) => { const x = new Set(s); names.forEach((n) => (on ? x.add(n) : x.delete(n))); return x; };
    if (course) { setTgt(f); if (!on) { setSel(f); setCert(f); } } else setSel(f);
  };

  const pickPlan = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = plans.find((x) => x.id === Number(e.target.value));
    setV({ ...v, plan: p?.id ?? 0, name: p?.name ?? v.name, kind: p ? (kinds.includes(p.kind) ? p.kind : v.kind) : v.kind });
  };
  const n = chosen.length + (v.extra ? v.extra.split(/[,\n]+/).filter((x) => x.trim()).length : 0);
  const pairs: [Person | null, Person | null][] = [];
  for (let i = 0; i < Math.max(6, chosen.length); i += 2) pairs.push([chosen[i] ?? null, chosen[i + 1] ?? null]);

  return (
    <form action={act} className="tr-rec">
      <input type="hidden" name="id" value={v.id || ""} />
      <input type="hidden" name="plan" value={v.plan || ""} />
      {[...sel].filter((x) => staff.some((p) => p.name === x)).map((x) => <input key={x} type="hidden" name="p" value={x} />)}
      {course && [...new Set([...tgt, ...sel])].filter((x) => staff.some((p) => p.name === x)).map((x) => <input key={`t${x}`} type="hidden" name="tg" value={x} />)}
      {[...cert].filter((x) => staff.some((p) => p.name === x)).map((x) => <input key={`c${x}`} type="hidden" name="cf" value={x} />)}

      <div className="tr-rec-l">
        <section className="card">
          <div className="card-title">교육 내용</div>
          {!v.id && (
            <label className="tr-f">연간 계획에서 불러오기
              <select value={v.plan || ""} onChange={pickPlan}>
                <option value="">(계획 없이 기록)</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{+p.month.slice(5)}월 · {p.name}{p.target ? ` (${p.target})` : ""} — {p.status || "계획"}</option>)}
              </select>
            </label>
          )}
          <div className="tr-g2">
            <label className="tr-f wide">교육명 *<input name="name" value={v.name} onChange={set("name")} required /></label>
            <label className="tr-f">교육일 *<input type="date" name="day" value={v.day} onChange={set("day")} required /></label>
            <label className="tr-f">구분
              <select name="kind" value={v.kind} onChange={set("kind")}><option value="" />{kinds.map((k) => <option key={k}>{k}</option>)}</select>
            </label>
            <label className="tr-f">교육 시간 (시간)<input type="number" step="0.5" min="0" name="hours" value={v.hours} onChange={set("hours")} placeholder="예: 3" /></label>
            <label className="tr-f">시각<input name="time" value={v.time} onChange={set("time")} placeholder="예: 14:00~17:00" /></label>
            <label className="tr-f">장소·방법<input name="place" value={v.place} onChange={set("place")} placeholder="예: 2층 회의실 · 집체 / 온라인" /></label>
            <label className="tr-f">강사·기관<input name="by" value={v.by} onChange={set("by")} /></label>
            <label className="tr-f">비용 (원)<input type="number" min="0" name="cost" value={v.cost} onChange={set("cost")} /></label>
            <label className="tr-f">다음 교육 예정<input type="date" name="next" value={v.next} onChange={set("next")} /></label>
            <label className="tr-f wide">교육 내용 (교육일지에 들어감)<textarea name="content" rows={3} value={v.content} onChange={set("content")} /></label>
            <label className="tr-f wide">비고<input name="note" value={v.note} onChange={set("note")} /></label>
          </div>
        </section>

        <section className="card">
          <label className="tr-mode"><input type="checkbox" checked={course} onChange={(e) => setCourse(e.target.checked)} />
            수강 관리 (온라인·위탁 과정: 대상자 · 수료 / 미수료 · 수료증 제출)
            {course && <span className="muted"> — 이름을 누를 때마다 미수료 → 수료 → 수료·수료증 → 대상 아님</span>}
          </label>
          {course && <label className="tr-f" style={{ maxWidth: 260, marginBottom: 8 }}>수강 기간 끝<input type="date" name="until" value={v.until} onChange={set("until")} /></label>}
          <div className="card-title">{course ? "수료" : "참석자"} <b className="tr-n">{chosen.length}</b><span className="muted" style={{ fontWeight: 400 }}> / {course ? `대상 ${staff.filter((p) => tgt.has(p.name) || sel.has(p.name)).length}명 · 수료증 ${cert.size}` : `${staff.length}명`}</span>
            <span className="spacer" />
            <button type="button" className="btn sm" onClick={() => setMany(staff.map((p) => p.name), true)}>전 직원</button>
            <button type="button" className="btn sm" disabled={!away} title={away ? "" : "그날 출퇴근 기록이 없습니다"}
              onClick={() => setSel(new Set(staff.filter((p) => !away?.[p.name]).map((p) => p.name)))}>그날 출근한 사람만</button>
            <button type="button" className="btn sm" onClick={() => setSel(new Set())}>모두 해제</button>
          </div>
          {depts.map((d) => {
            const list = staff.filter((p) => p.dept === d);
            const all = list.every((p) => (course ? tgt.has(p.name) || sel.has(p.name) : sel.has(p.name)));
            return (
              <div key={d} className="tr-dept">
                <button type="button" className="tr-dh" onClick={() => setMany(list.map((p) => p.name), !all)}>
                  {d} <small>{list.filter((p) => sel.has(p.name)).length}/{list.length}</small>
                </button>
                <div className="tr-ppl">
                  {list.map((p) => (
                    <button key={p.name} type="button" className={`tr-p${sel.has(p.name) ? " on" : course && tgt.has(p.name) ? " miss" : ""}`} onClick={() => toggle(p.name)} aria-pressed={sel.has(p.name)}>
                      {sel.has(p.name) ? "✓ " : ""}{p.name}{course && stateOf(p.name) ? <em> {stateOf(p.name)}</em> : null}{away?.[p.name] ? <small> ({away[p.name]})</small> : null}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <label className="tr-f">직원 관리에 없는 참석자 (외부 강사·파견 등, 쉼표로)<input name="extra" value={v.extra} onChange={set("extra")} /></label>
          {missing.length > 0 && chosen.length > 0 && (
            <p className="tr-warn">빠진 {missing.length}명: {missing.map((p) => `${p.name}${away?.[p.name] ? `(${away[p.name]})` : ""}`).join(", ")} → 직원별 이수 현황표에 &apos;미이수&apos;로 남아 보충 교육 알림이 갑니다.</p>
          )}
        </section>

        <section className="card">
          <div className="card-title">증빙 첨부 <span className="muted" style={{ fontWeight: 400 }}>교육 자료 · 현장 사진 · 수료증 · 서명한 서명부 스캔</span></div>
          <input type="file" name="file" multiple />
        </section>

        <div className="tr-save">
          {res?.error && <span className="red">{res.error}</span>}
          <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : v.id ? "고친 내용 저장" : "저장하고 결과 보고서 보기"}</button>
        </div>
      </div>

      <aside className="tr-rec-r">
        <div className="muted" style={{ fontSize: ".8rem", fontWeight: 700, marginBottom: 6 }}>미리보기 · 교육결과 보고서 (저장하면 회사 양식 인쇄 화면으로)</div>
        <div className="tr-paper sm">
          <h2>교육결과 보고서</h2>
          <table className="tr-doc"><tbody>
            <tr><th>교육명</th><td colSpan={3}>{v.name || "　"}</td></tr>
            <tr><th>교육일시</th><td>{v.day} {v.time}</td><th>시간</th><td>{v.hours ? `${v.hours}시간` : ""}</td></tr>
            <tr><th>장소·방법</th><td>{v.place}</td><th>강사</th><td>{v.by}</td></tr>
            <tr><th>대상·인원</th><td colSpan={3}>{staff.length}명 중 {n}명 참석{v.kind ? ` · ${v.kind}` : ""}</td></tr>
            <tr><th style={{ height: 54 }}>교육 내용</th><td colSpan={3} style={{ whiteSpace: "pre-line" }}>{v.content}</td></tr>
          </tbody></table>
          <h3>참석자 서명부</h3>
          <table className="tr-doc c"><thead><tr><th>No</th><th>부서</th><th>성명</th><th>서명</th><th>No</th><th>부서</th><th>성명</th><th>서명</th></tr></thead>
            <tbody>{pairs.slice(0, 8).map(([a, b], i) => (
              <tr key={i}><td>{a ? i * 2 + 1 : ""}</td><td>{a?.dept}</td><td>{a?.name}</td><td /><td>{b ? i * 2 + 2 : ""}</td><td>{b?.dept}</td><td>{b?.name}</td><td /></tr>
            ))}</tbody></table>
          {pairs.length > 8 && <small className="muted">… {chosen.length}명까지 이어짐</small>}
        </div>
        {v.day > today && <p className="muted" style={{ fontSize: ".78rem" }}>앞으로의 날짜입니다. 교육이 끝난 뒤 저장하면 이수로 잡힙니다.</p>}
      </aside>
    </form>
  );
}
