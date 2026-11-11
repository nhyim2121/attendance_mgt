"use client";
/** 직무기술서 입력 화면: 양식 순서대로 (직무 확인 → 개요 → 주요 업무 → 요건 → 자격 → 환경·성과·교육) */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BASICS, CYCLES, type JobDesc, type JobTask, shareSum } from "@/lib/인사노무/jobdesc";
import { saveJob } from "./actions";

type Unit = { id: string; path: string; people: string[] };
type ListKey = "ncsUnits" | "knowledge" | "skills" | "attitudes" | "licenses" | "kpis" | "training";

type Staff = { name: string; label: string; unit: string };
export default function JobEditor({ job, units, staff, depts, isNew }: { job: JobDesc; units: Unit[]; staff: Staff[]; depts: string[]; isNew: boolean }) {
  const router = useRouter();
  const [j, setJ] = useState<JobDesc>(job);
  const [lists, setLists] = useState<Record<ListKey, string>>(() => ({
    ncsUnits: job.ncsUnits.join("\n"), knowledge: job.knowledge.join("\n"), skills: job.skills.join("\n"), attitudes: job.attitudes.join("\n"),
    licenses: job.licenses.join("\n"), kpis: job.kpis.join("\n"), training: job.training.join("\n"),
  }));
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const set = <K extends keyof JobDesc>(k: K, v: JobDesc[K]) => setJ((x) => ({ ...x, [k]: v }));
  const setTask = (i: number, p: Partial<JobTask>) => set("tasks", j.tasks.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const sum = shareSum(j);

  const save = (go: "stay" | "view") => start(async () => {
    const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    const r = await saveJob({ ...j, ncsUnits: split(lists.ncsUnits), knowledge: split(lists.knowledge), skills: split(lists.skills), attitudes: split(lists.attitudes),
      licenses: split(lists.licenses), kpis: split(lists.kpis), training: split(lists.training) });
    if (r.error) { setMsg(r.error); return; }
    if (go === "view") router.push(`/jobs/view?id=${r.id}`);
    else { setMsg(r.ok ?? ""); if (isNew) router.replace(`/jobs/edit?id=${r.id}`); else router.refresh(); }
  });

  const text = (k: keyof JobDesc, label: string, ph = "", wide = false) => (
    <label className={`jd-f${wide ? " wide" : ""}`}><span>{label}</span>
      <input value={String(j[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} placeholder={ph} /></label>
  );
  const area = (k: keyof JobDesc, label: string, ph = "") => (
    <label className="jd-f wide"><span>{label}</span>
      <textarea rows={2} value={String(j[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} placeholder={ph} /></label>
  );
  const list = (k: ListKey, label: string, ph: string) => (
    <label className="jd-f"><span>{label} <small>(한 줄에 하나)</small></span>
      <textarea rows={4} value={lists[k]} onChange={(e) => setLists((x) => ({ ...x, [k]: e.target.value }))} placeholder={ph} /></label>
  );

  return (
    <div className={`jd-ed${pending ? " busy" : ""}`}>
      {job.example && <div className="jd-note">💡 예시 초안입니다. 실제 업무에 맞게 고친 뒤 저장하면 예시 표시가 사라집니다.</div>}

      <section className="card">
        <div className="card-title">1. 직무 확인</div>
        <div className="jd-grid">
          <label className="jd-f"><span>소속 부서 *</span>
            <input list="jd-depts" value={j.dept} onChange={(e) => set("dept", e.target.value)} placeholder="예: 생산팀" />
            <datalist id="jd-depts">{depts.map((d) => <option key={d} value={d} />)}</datalist></label>
          {text("name", "직무명 *", "예: 조립")}
          {text("grade", "대상 직급", "예: 사원~과장")}
          {text("reportTo", "보고 대상", "예: 생산팀장")}
          {text("ncs", "NCS 분류", "예: 19.전기·전자 > 01.전기 > 05.전기기기제작 > 02.전기기기제작 (19010502)", true)}
        </div>
        <div className="jd-f wide"><span>NCS 능력단위 <small>(한 줄에 하나, &quot;번호 이름&quot; — <a href="https://www.ncs.go.kr" target="_blank" rel="noreferrer">ncs.go.kr</a>에서 찾기)</small></span>
          <textarea rows={4} value={lists.ncsUnits} onChange={(e) => setLists((x) => ({ ...x, ncsUnits: e.target.value }))}
            placeholder={"1901050203 전기기기 권선 작업\n1901050204 전기기기 함침 건조 작업"} /></div>
        <div className="jd-f wide"><span>담당자 — 이름을 누를 때마다 <b className="jd-m">주 담당</b> → <b className="jd-s">보조 담당</b> → 빼기</span>
          <div className="jd-units">
            {staff.map((p) => {
              const st = j.main.includes(p.name) ? "m" : j.sub.includes(p.name) ? "s" : "";
              const next = () => {
                const main = j.main.filter((x) => x !== p.name), sub = j.sub.filter((x) => x !== p.name);
                if (st === "") main.push(p.name); else if (st === "m") sub.push(p.name);
                setJ((x) => ({ ...x, main, sub }));
              };
              return (
                <button type="button" key={p.name} className={`jd-pp ${st}`} onClick={next} title={p.unit}>
                  {st === "m" ? "주 " : st === "s" ? "보조 " : ""}{p.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="jd-f wide"><span>조직도 상자 (반·팀) — 담당자를 고르지 않았을 때 이 상자 사람을 씁니다</span>
          <div className="jd-units">
            {units.map((u) => (
              <label key={u.id} className={j.units.includes(u.id) ? "on" : ""} title={u.people.join(", ")}>
                <input type="checkbox" checked={j.units.includes(u.id)}
                  onChange={(e) => set("units", e.target.checked ? [...j.units, u.id] : j.units.filter((x) => x !== u.id))} />
                {u.path}{u.people.length > 0 && <small> {u.people.length}명</small>}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">2. 직무 개요</div>
        {area("purpose", "직무 목적", "이 직무가 왜 있는지 한두 문장 (예: 납기와 품질을 지키기 위해 장비를 조립·정비한다)")}
        {area("authority", "책임과 권한", "결정할 수 있는 것(작업 중지, 불량 판정, 발주 한도 등)")}
      </section>

      <section className="card">
        <div className="card-title">3. 주요 업무 <span className={`fd-tag ${sum === 100 ? "g" : "r"}`}>비중 합계 {sum}%{sum !== 100 ? " (100이 되게)" : ""}</span></div>
        <div className="tbl-wrap">
          <table className="tbl jd-tasks">
            <thead><tr><th>#</th><th>업무</th><th>세부 내용</th><th>비중(%)</th><th>주기</th><th /></tr></thead>
            <tbody>
              {j.tasks.map((x, i) => (
                <tr key={i}>
                  <td className="c">{i + 1}</td>
                  <td><input value={x.name} onChange={(e) => setTask(i, { name: e.target.value })} placeholder="예: 조립·정비" /></td>
                  <td><input value={x.detail} onChange={(e) => setTask(i, { detail: e.target.value })} placeholder="~을 한다" /></td>
                  <td><input type="number" min={0} max={100} value={x.share || ""} onChange={(e) => setTask(i, { share: Number(e.target.value) })} /></td>
                  <td><select value={x.cycle} onChange={(e) => setTask(i, { cycle: e.target.value })}>{CYCLES.map((c) => <option key={c}>{c}</option>)}</select></td>
                  <td className="c">
                    <button type="button" className="btn sm" disabled={i === 0} onClick={() => { const t = [...j.tasks]; [t[i - 1], t[i]] = [t[i], t[i - 1]]; set("tasks", t); }}>↑</button>
                    <button type="button" className="btn sm" onClick={() => set("tasks", j.tasks.filter((_, k) => k !== i))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn sm" style={{ marginTop: 6 }} onClick={() => set("tasks", [...j.tasks, { name: "", detail: "", share: Math.max(0, 100 - sum), cycle: "수시" }])}>＋ 업무 더하기</button>
      </section>

      <section className="card">
        <div className="card-title">4. 직무 요건 (필요 능력)</div>
        <div className="jd-grid3">
          {list("knowledge", "필요 지식", "예: 도면 해독\n전동기 구조")}
          {list("skills", "필요 기술", "예: 정밀 측정기 사용\n크레인 신호·줄걸이")}
          {list("attitudes", "직무수행태도", "예: 작업표준 준수\n안전 수칙 준수")}
        </div>
        <div className="jd-f wide"><span>직업기초능력 (NCS 10가지 중 3~5개)</span>
          <div className="jd-units">
            {BASICS.map((b) => (
              <label key={b} className={j.basics.includes(b) ? "on" : ""}>
                <input type="checkbox" checked={j.basics.includes(b)} onChange={(e) => set("basics", e.target.checked ? [...j.basics, b] : j.basics.filter((x) => x !== b))} />{b}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">5. 자격 요건 · 6. 근무 환경 · 성과 · 교육</div>
        <div className="jd-grid">
          {text("edu", "학력·전공", "예: 무관 (기계·전기 계열 우대)")}
          {text("career", "경력", "예: 신입 가능")}
        </div>
        {area("env", "근무 환경", "작업 장소, 근무 시간, 위험 요인과 보호구")}
        <div className="jd-grid3">
          {list("licenses", "자격·면허", "예: 지게차운전기능사 (우대)")}
          {list("kpis", "성과 지표", "예: 작업 불량 건수\n납기 준수율")}
          {list("training", "필요 교육", "예: 정기 안전보건교육 (분기 6시간)")}
        </div>
        <div className="jd-grid">
          {text("updated", "작성·개정일", "비우면 오늘")}
          {text("writer", "작성자", "비우면 내 이름")}
        </div>
      </section>

      <div className="jd-bar">
        <button className="btn primary" disabled={pending} onClick={() => save("view")}>{pending ? "저장 중…" : "저장하고 보기"}</button>
        <button className="btn" disabled={pending} onClick={() => save("stay")}>저장</button>
        <Link className="btn" href="/jobs">목록</Link>
        {msg && <span className="caption" style={{ margin: 0 }}>{msg}</span>}
      </div>
    </div>
  );
}
