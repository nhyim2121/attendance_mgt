"use client";
/** 직원 관리 화면: 숫자 카드 · 다가오는 인사 일정 · 목록(검색·부서·재직/퇴사·정렬) · 상세 서랍(고치기·캐릭터·퇴사 처리) · 비상연락망 인쇄 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Employee } from "@/lib/인사노무/employees";
import { type HrEvent, tenure, tenureYears } from "@/lib/인사노무/hrEvents";
import { type CharOpts, characterSvg, guessHair, HAIRS, renderCharacter, STYLES } from "@/components/인사노무/character";
import { deleteEmployee, dropAvatar, type PrivateInput, removeEmpFile, saveAvatar, saveEmployee, showRrn, uploadEmpFiles } from "./actions";

type Res = { ok?: string; error?: string } | null;
export interface Priv { birth: string | null; rrnMask: string; salaryType: string; salary: number | null; salaryNote: string }
export interface EmpFile { id: number; fileName: string; size: number; createdAt: string }
export interface Extra {
  tenure: string; span: [string, string] | null; leave: { total: number; used: number; remain: number } | null;
  priv?: Priv; files?: EmpFile[];
}

const COLORS = ["#0c3994", "#0e7490", "#b45309", "#15803d", "#6d28d9", "#be185d"];
const colorOf = (name: string) => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const BLANK: Employee = { name: "", capsName: "", empId: "", dept: "", rank: "", position: "", phone: "", ext: "", email: "", joinDate: null, leaveDate: null, note: "", ord: 0 };
const KIND_TONE: Record<string, string> = { "수습 종료": "b", "1년 근속": "g", "근속 기념": "v", "퇴사 예정": "o" };
const dday = (n: number) => (n < 0 ? `${-n}일 지남` : n === 0 ? "오늘" : `D-${n}`);
const n1 = (x: number) => Math.round(x * 10) / 10;

export function statusOf(e: Employee, today: string): string {
  if (e.leaveDate && e.leaveDate < today) return "퇴사";
  if (e.joinDate && e.joinDate > today) return "입사 예정";
  return "재직";
}
const tone = (s: string) => (s === "재직" ? "g" : s === "퇴사" ? "k" : "b");

export function Avatar({ name, src, size = 34 }: { name: string; src?: string; size?: number }) {
  return src
    ? <img className="ep-av" src={src} alt="" width={size} height={size} />
    : <span className="ep-av" style={{ ["--c" as string]: colorOf(name || "?"), width: size, height: size, fontSize: size * 0.4 }}>{(name || "?")[0]}</span>;
}

type SortKey = "ord" | "name" | "dept" | "rank" | "joinDate" | "tenure";
const COLS: [SortKey | null, string][] = [["name", "이름"], ["dept", "부서"], ["rank", "직급"], ["joinDate", "입사일"], ["tenure", "근속"], [null, "연락처"], [null, "상태"]];

export default function EmployeeEditor({ emps, depts, today, extra, avatars, admin, openNew, events, fyLabel }: {
  emps: Employee[]; depts: string[]; today: string; extra: Record<string, Extra>; avatars: Record<string, number>;
  admin: boolean; openNew?: boolean; events: HrEvent[]; fyLabel: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [view, setView] = useState<"전체" | "재직" | "퇴사">("전체");
  const [sort, setSort] = useState<[SortKey, 1 | -1]>(["ord", 1]);
  const [open, setOpen] = useState<Employee | null>(openNew ? BLANK : null);
  const [printMode, setPrintMode] = useState<"list" | "contacts">("list");
  const [allEvents, setAllEvents] = useState(false);
  const close = () => { setOpen(null); if (openNew) router.replace("/employees", { scroll: false }); };
  const src = (n: string) => (avatars[n] ? `/api/ga/file/${avatars[n]}` : undefined);

  useEffect(() => {
    const done = () => setPrintMode("list");
    addEventListener("afterprint", done);
    return () => removeEventListener("afterprint", done);
  }, []);
  const printAs = (m: "list" | "contacts") => { setPrintMode(m); setTimeout(() => print(), 80); };

  const working = emps.filter((e) => statusOf(e, today) !== "퇴사");
  const month = today.slice(0, 7);
  const joined = emps.filter((e) => e.joinDate?.startsWith(month)), left = emps.filter((e) => e.leaveDate?.startsWith(month));
  const avgTenure = working.length ? n1(working.reduce((t, e) => t + tenureYears(tenure(e, today)), 0) / working.filter((e) => e.joinDate).length || 0) : 0;
  const noJoin = working.filter((e) => !e.joinDate).length;
  const noPhone = working.filter((e) => !e.phone).length;

  const count = (v: string) => emps.filter((e) => (!dept || e.dept === dept) && (v === "전체" || (v === "퇴사") === (statusOf(e, today) === "퇴사"))).length;
  const shown = useMemo(() => {
    const k = q.trim();
    const list = emps.filter((e) => {
      const s = statusOf(e, today);
      if (view !== "전체" && (view === "퇴사") !== (s === "퇴사")) return false;
      if (dept && e.dept !== dept) return false;
      return !k || [e.name, e.dept, e.rank, e.position, e.phone, e.email, e.capsName, e.empId, e.note].some((x) => x?.includes(k));
    });
    const [key, dir] = sort;
    const val = (e: Employee): string | number => key === "tenure" ? -(e.joinDate ? Date.parse(e.joinDate) : Infinity)
      : key === "ord" ? e.ord : (e[key] ?? "") as string;
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir || a.ord - b.ord;
    });
  }, [emps, q, dept, view, sort, today]);
  const byName = (n: string) => emps.find((e) => e.name === n) ?? null;
  const evShown = allEvents ? events : events.slice(0, 5);
  const contactDepts = [...new Set(working.map((e) => e.dept || "(부서 없음)"))];

  return (
    <div className={`ep-body pm-${printMode}`}>
      <div className="ep-kpis noprint">
        <button type="button" className="ep-kpi" onClick={() => { setView("재직"); setDept(""); }}>
          <span className="l">👥 재직 인원</span><b>{working.length}<small>명</small></b>
          <span className="t">부서 {new Set(working.map((e) => e.dept).filter(Boolean)).size}개</span>
        </button>
        <div className="ep-kpi">
          <span className="l">🔄 {+month.slice(5)}월 입사 · 퇴사</span><b>{joined.length}<small> / {left.length}명</small></b>
          <span className="t">{[...joined.map((e) => `+${e.name}`), ...left.map((e) => `-${e.name}`)].join(" ") || "변동 없음"}</span>
        </div>
        <div className="ep-kpi">
          <span className="l">⏳ 평균 근속</span><b>{avgTenure}<small>년</small></b>
          <span className="t">재직자 기준{noJoin ? ` · 입사일 없음 ${noJoin}명` : ""}</span>
        </div>
        <div className={`ep-kpi${noJoin + noPhone ? " warn" : ""}`}>
          <span className="l">📝 채울 정보</span><b>{noJoin + noPhone}<small>건</small></b>
          <span className="t">입사일 {noJoin} · 휴대전화 {noPhone}</span>
        </div>
      </div>

      {events.length > 0 && (
        <div className="ep-card ep-events noprint">
          <h3>📆 다가오는 인사 일정 <small>45일 안 · 누르면 상세</small></h3>
          <ul>{evShown.map((x, i) => (
            <li key={i} onClick={() => setOpen(byName(x.name))}>
              <span className={`fd-tag ${KIND_TONE[x.kind]}`}>{x.kind}</span>
              <b>{x.name}</b><span className="sub">{x.dept} · {x.label}</span>
              <span className="day">{x.day.slice(5).replace("-", "/")}</span>
              <span className={`dd${x.left <= 7 ? " r" : ""}`}>{dday(x.left)}</span>
            </li>
          ))}</ul>
          {events.length > 5 && <button type="button" className="fd-more" onClick={() => setAllEvents(!allEvents)}>{allEvents ? "접기" : `${events.length - 5}건 더 보기`}</button>}
        </div>
      )}

      <div className="ep-card ep-list">
        <div className="ep-tools noprint">
          <label className="ep-search">🔍<input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="이름·부서·연락처 검색" /></label>
          <select className="ep-select" value={dept} onChange={(ev) => setDept(ev.target.value)}>
            <option value="">전체 부서</option>
            {[...new Set(emps.map((e) => e.dept).filter(Boolean))].map((d) => <option key={d}>{d}</option>)}
          </select>
          <span className="ep-seg">{(["전체", "재직", "퇴사"] as const).map((v) => (
            <button key={v} type="button" className={v === view ? "on" : ""} onClick={() => setView(v)}>{v} <i>{count(v)}</i></button>
          ))}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="ep-btn sm" onClick={() => printAs("list")}>🖨 목록 인쇄</button>
          <button type="button" className="ep-btn sm" onClick={() => printAs("contacts")}>📇 비상연락망 인쇄</button>
        </div>
        <div className="print-only ep-ptitle">직원 명부 · {today} 기준 · {shown.length}명</div>
        <div className="tbl-wrap">
          <table className="ep-t">
            <thead><tr>{COLS.map(([k, l]) => (
              <th key={l} className={k ? "sortable" : ""} onClick={() => k && setSort(([sk, d]) => (sk === k ? (d === 1 ? [k, -1] : ["ord", 1]) : [k, 1]))}>
                {l}{k && sort[0] === k && <span className="arrow">{sort[1] === 1 ? "▲" : "▼"}</span>}
              </th>
            ))}</tr></thead>
            <tbody>
              {shown.map((e) => {
                const s = statusOf(e, today);
                return (
                  <tr key={e.name} onClick={() => setOpen(e)}>
                    <td><div className="ep-who"><Avatar name={e.name} src={src(e.name)} /><b>{e.name}</b>{e.position && <small>{e.position}</small>}</div></td>
                    <td>{e.dept}</td><td>{e.rank}</td><td>{e.joinDate ?? <span className="ep-miss">입사일 없음</span>}</td>
                    <td className="muted2">{extra[e.name]?.tenure}</td>
                    <td>{e.phone}{e.ext && <small className="muted2"> · 내선 {e.ext}</small>}</td>
                    <td><span className={`fd-tag ${tone(s)}`}>{s}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!shown.length && <p className="ep-foot">조건에 맞는 직원이 없습니다.</p>}
        <p className="ep-foot noprint">줄을 누르면 상세가 열립니다 · 머리줄을 누르면 정렬 · {shown.length}명</p>
      </div>

      {/* 비상연락망 (인쇄 전용) */}
      <div className="ep-contacts">
        <h2>비상연락망</h2>
        <p>{today} 기준 · 재직 {working.length}명</p>
        <div className="ep-cgrid">
          {contactDepts.map((d) => (
            <table key={d}>
              <thead><tr><th colSpan={4}>{d}</th></tr><tr><th>이름</th><th>직급·직책</th><th>휴대전화</th><th>내선</th></tr></thead>
              <tbody>{working.filter((e) => (e.dept || "(부서 없음)") === d).map((e) => (
                <tr key={e.name}><td>{e.name}</td><td>{[e.rank, e.position].filter(Boolean).join(" · ")}</td><td>{e.phone}</td><td>{e.ext}</td></tr>
              ))}</tbody>
            </table>
          ))}
        </div>
      </div>

      <datalist id="depts">{depts.map((d) => <option key={d} value={d} />)}</datalist>
      {open && <Drawer key={open.name || "new"} emp={open} today={today} extra={extra[open.name]} admin={admin}
        avatar={src(open.name)} fyLabel={fyLabel} onClose={close} />}
    </div>
  );
}

const FILE_KINDS = ["근로계약서", "이력서", "자격증", "통장 사본", "가족관계·주민등록", "건강검진", "기타"];
const won = (n: number) => n.toLocaleString("ko-KR");
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
function age(birth: string | null, today: string) {
  if (!birth) return "";
  let a = +today.slice(0, 4) - +birth.slice(0, 4);
  if (today.slice(5) < birth.slice(5)) a--;
  return `만 ${a}세`;
}
const privForm = (p?: Priv) => ({ birth: p?.birth ?? null, salaryType: p?.salaryType || "월급", salary: p?.salary == null ? "" : won(p.salary), salaryNote: p?.salaryNote ?? "" });

function Drawer({ emp, today, extra, admin, avatar, fyLabel, onClose }: {
  emp: Employee; today: string; extra?: Extra; admin: boolean; avatar?: string; fyLabel: string; onClose: () => void;
}) {
  const router = useRouter();
  const isNew = !emp.name;
  const priv0 = privForm(extra?.priv);
  const rrnMask = extra?.priv?.rrnMask ?? "";
  const [e, setE] = useState<Employee>(emp);
  const [pv, setPv] = useState(priv0);
  const [rrnNew, setRrnNew] = useState<string | null>(null); // null = 그대로
  const [rrnShown, setRrnShown] = useState<string | null>(null);
  const [msg, setMsg] = useState<Res>(null);
  const [pending, start] = useTransition();
  const [ch, setCh] = useState<CharOpts | null>(null); // 만드는 중인 캐릭터
  const photoRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(FILE_KINDS[0]);
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);

  const set = (patch: Partial<Employee>) => setE((x) => ({ ...x, ...patch }));
  const field = (k: keyof Employee, label: string, opt: { type?: string; list?: string; wide?: boolean; hint?: string } = {}) => (
    <label className={opt.wide ? "wide" : ""} title={opt.hint}>{label}
      <input type={opt.type ?? "text"} list={opt.list} value={(e[k] as string | null) ?? ""}
        onChange={(ev) => set({ [k]: opt.type === "date" ? ev.target.value || null : ev.target.value })} />
    </label>
  );
  const newChar = (patch: Partial<CharOpts> = {}) =>
    setCh((c) => ({ hair: "짧은 머리", glasses: false, style: "펜", ...c, seed: Math.floor(Math.random() * 100000) + 1, ...patch }));
  const fromPhoto = (f: File) => start(async () => {
    try { const hair = await guessHair(f); newChar({ hair }); setMsg(null); } catch (err) { setMsg({ error: (err as Error).message }); }
  });
  const keepChar = () => start(async () => {
    if (!ch) return;
    const blob = await renderCharacter(ch);
    const fd = new FormData();
    fd.set("name", emp.name);
    fd.set("file", new File([blob], "avatar.png", { type: "image/png" }));
    const r = await saveAvatar(fd);
    setMsg(r);
    if (r.ok) { setCh(null); router.refresh(); }
  });
  const privDirty = admin && (rrnNew !== null || JSON.stringify(pv) !== JSON.stringify(priv0));
  const save = () => start(async () => {
    const priv: PrivateInput | undefined = admin ? { ...pv, rrn: rrnNew ?? undefined } : undefined;
    const r = await saveEmployee(emp.name, e, priv);
    setMsg(r);
    if (r.ok) { setRrnNew(null); setRrnShown(null); router.refresh(); if (isNew) onClose(); }
  });
  const del = () => confirm(`${emp.name}을(를) 명부에서 지울까요?\n주민번호·급여·첨부 파일·캐릭터도 함께 지워집니다.\n퇴사한 직원은 지우지 말고 '퇴사 처리'로 퇴사일만 넣으면 지난 기록이 그대로 남습니다.`) && start(async () => {
    const r = await deleteEmployee(emp.name);
    if (r.ok) { router.refresh(); onClose(); } else setMsg(r);
  });
  const upload = (list: File[]) => start(async () => {
    const fd = new FormData();
    fd.set("name", emp.name);
    fd.set("kind", kind === "기타" ? "" : kind);
    list.forEach((f) => fd.append("file", f));
    const r = await uploadEmpFiles(fd);
    setMsg(r);
    if (r.ok) router.refresh();
  });
  const reveal = () => start(async () => {
    const r = await showRrn(emp.name);
    if (r.rrn) { setRrnShown(r.rrn); setTimeout(() => setRrnShown(null), 15000); } else setMsg(r);
  });
  const s = statusOf(e, today);
  const dirty = JSON.stringify(e) !== JSON.stringify(emp) || privDirty;
  const lv = extra?.leave;
  const chUrl = ch ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(characterSvg(ch))}` : null;
  const files = extra?.files ?? [];

  return (
    <div className="ep-overlay" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <aside className="ep-drawer" role="dialog" aria-label="직원 상세">
        <div className="ep-dh">
          <h2>{isNew ? "직원 추가" : "직원 상세"}</h2>
          <button type="button" className="ep-x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        {!isNew && (
          <>
            <div className="ep-hero">
              <Avatar name={e.name} src={chUrl ?? avatar} size={88} />
              <div>
                <b>{emp.name}</b>
                <span>{[emp.dept, emp.rank, emp.position].filter(Boolean).join(" · ")}</span>
                <span className={`fd-tag ${tone(s)}`}>{s}</span>
              </div>
            </div>
            <div className="ep-facts">
              <div><span>근속</span><b>{extra?.tenure || "-"}</b></div>
              <div><span>연차 잔여 <small>{fyLabel}</small></span><b>{lv ? `${n1(lv.remain)}일` : "-"}</b>{lv && <small>{n1(lv.used)} / {n1(lv.total)}일 사용</small>}</div>
              <div><span>캡스 출입</span><b>{extra?.span ? extra.span[1].slice(5).replace("-", "/") : "-"}</b>{extra?.span && <small>{extra.span[0]}부터</small>}</div>
            </div>
            <div className="ep-links">
              <Link href={`/person?emp=${encodeURIComponent(emp.name)}`}>🙋 직원별 근태</Link>
              <Link href={`/sheets?tab=edit&emp=${encodeURIComponent(emp.name)}`}>✍️ 근태 기입</Link>
              <Link href="/leave/status">📈 연차 현황</Link>
              {emp.phone && <a href={`tel:${emp.phone.replace(/[^\d+]/g, "")}`}>📞 전화</a>}
              {emp.email && <a href={`mailto:${emp.email}`}>✉️ 메일</a>}
            </div>
          </>
        )}
        {!isNew && admin && (
          <div className="ep-photo">
            <input ref={photoRef} type="file" accept="image/*" hidden
              onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) fromPhoto(f); }} />
            {!ch ? (
              <>
                <button type="button" className="ep-btn sm" disabled={pending} onClick={() => newChar()}>🎨 캐릭터 만들기</button>
                <button type="button" className="ep-btn sm" disabled={pending} onClick={() => photoRef.current?.click()}>📷 증명사진 보고 만들기</button>
                {avatar && <button type="button" className="ep-btn sm ghost" disabled={pending}
                  onClick={() => start(async () => { const r = await dropAvatar(emp.name); setMsg(r); router.refresh(); })}>캐릭터 지우기</button>}
                <p>이목구비 없는 선 그림입니다. 사진은 머리 길이를 짐작하는 데만 쓰고 저장하지 않습니다.</p>
              </>
            ) : (
              <>
                <div className="ep-chips"><span>그림체</span>{STYLES.map((x) => (
                  <button key={x} type="button" className={ch.style === x ? "on" : ""} onClick={() => newChar({ style: x, seed: ch.seed })}>{x === "펜" ? "✒️ 펜" : "🟩 칠판"}</button>
                ))}</div>
                <div className="ep-chips"><span>머리</span>{HAIRS.map((x) => (
                  <button key={x} type="button" className={ch.hair === x ? "on" : ""} onClick={() => newChar({ hair: x })}>{x}</button>
                ))}</div>
                <div className="ep-chips"><span>안경</span>{[false, true].map((x) => (
                  <button key={String(x)} type="button" className={ch.glasses === x ? "on" : ""} onClick={() => newChar({ glasses: x, seed: ch.seed })}>{x ? "👓 씀" : "안 씀"}</button>
                ))}</div>
                <div className="ep-row">
                  <button type="button" className="ep-btn sm pri" disabled={pending} onClick={keepChar}>이 캐릭터로 저장</button>
                  <button type="button" className="ep-btn sm" disabled={pending} onClick={() => newChar()}>🎲 머리 결 바꾸기</button>
                  <button type="button" className="ep-btn sm ghost" disabled={pending} onClick={() => setCh(null)}>취소</button>
                </div>
              </>
            )}
          </div>
        )}

        <h3 className="ep-sec">기본 정보</h3>
        <div className="ep-form">
          {field("name", "이름")}
          {field("dept", "부서", { list: "depts" })}
          {field("rank", "직급")}
          {field("position", "직책", { hint: "조직도에 표시 (팀장, 공장장 등)" })}
          {field("joinDate", "입사일", { type: "date", hint: "비우면 처음부터 재직으로 봅니다." })}
          <label title="비우면 재직 중">퇴사일 (마지막 근무일)
            <span className="ep-inline">
              <input type="date" value={e.leaveDate ?? ""} onChange={(ev) => set({ leaveDate: ev.target.value || null })} />
              {!isNew && !e.leaveDate && <button type="button" className="ep-btn sm" onClick={() => set({ leaveDate: today })}>퇴사 처리</button>}
            </span>
          </label>
          {field("phone", "휴대전화")}
          {field("ext", "내선")}
          {field("email", "이메일", { type: "email", wide: true })}
          {field("capsName", "캡스 이름", { hint: "캡스에 이름이 다르게 찍힐 때만 (예: 홍길동A)" })}
          {field("empId", "사번")}
          {field("note", "비고", { wide: true })}
        </div>

        {admin && (
          <>
            <h3 className="ep-sec">🔒 인사 기밀 <small>관리자만 보입니다 · 엑셀 내려받기에 들어가지 않음</small></h3>
            <div className="ep-form">
              <label>생년월일 {pv.birth && <small className="muted2">{age(pv.birth, today)}</small>}
                <input type="date" value={pv.birth ?? ""} onChange={(ev) => setPv({ ...pv, birth: ev.target.value || null })} /></label>
              <label title="암호화해서 저장합니다. 생년월일이 비어 있으면 주민번호 앞자리로 채웁니다.">주민등록번호
                {rrnNew === null ? (
                  <span className="ep-inline">
                    <input readOnly value={rrnShown ?? rrnMask} placeholder="없음" />
                    {rrnMask && <button type="button" className="ep-btn sm" disabled={pending} onClick={() => (rrnShown ? setRrnShown(null) : reveal())}>{rrnShown ? "가리기" : "보기"}</button>}
                    <button type="button" className="ep-btn sm" onClick={() => setRrnNew("")}>{rrnMask ? "바꾸기" : "넣기"}</button>
                  </span>
                ) : (
                  <span className="ep-inline">
                    <input value={rrnNew} autoFocus placeholder="900101-1234567" autoComplete="off" inputMode="numeric" onChange={(ev) => setRrnNew(ev.target.value)} />
                    <button type="button" className="ep-btn sm ghost" onClick={() => setRrnNew(null)}>취소</button>
                  </span>
                )}
              </label>
              <label>급여 형태
                <select value={pv.salaryType} onChange={(ev) => setPv({ ...pv, salaryType: ev.target.value })}>
                  {["월급", "연봉", "시급"].map((x) => <option key={x}>{x}</option>)}
                </select></label>
              <label>금액 (원)
                <input inputMode="numeric" value={pv.salary} placeholder="예: 3,000,000"
                  onChange={(ev) => { const d = ev.target.value.replace(/\D/g, ""); setPv({ ...pv, salary: d ? won(+d) : "" }); }} /></label>
              <label className="wide">급여 메모
                <input value={pv.salaryNote} placeholder="예: 2026-04 인상, 식대 20만 별도" onChange={(ev) => setPv({ ...pv, salaryNote: ev.target.value })} /></label>
            </div>
            {rrnNew === "" && rrnMask && <p className="ep-note">빈칸으로 저장하면 주민등록번호가 지워집니다.</p>}

            {!isNew && (
              <>
                <h3 className="ep-sec">📎 첨부 파일 <small>근로계약서·이력서·자격증 사본 등 · 20MB 이하</small></h3>
                <div className="ep-files">
                  {files.map((f) => (
                    <div key={f.id} className="ep-file">
                      <a href={`/api/ga/file/${f.id}`} target="_blank" rel="noopener">
                        {/\.pdf$/i.test(f.fileName) ? "📄" : /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(f.fileName) ? "🖼️" : "📎"} {f.fileName}</a>
                      <small>{kb(f.size)} · {f.createdAt.slice(0, 10)}</small>
                      <a href={`/api/ga/file/${f.id}?download`} title="내려받기">⬇</a>
                      <button type="button" title="지우기" disabled={pending}
                        onClick={() => confirm(`'${f.fileName}'을(를) 지울까요?`) && start(async () => { const r = await removeEmpFile(f.id); setMsg(r); router.refresh(); })}>×</button>
                    </div>
                  ))}
                  {!files.length && <p className="ep-note">아직 첨부한 파일이 없습니다.</p>}
                  <div className="ep-inline">
                    <select value={kind} onChange={(ev) => setKind(ev.target.value)}>{FILE_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
                    <input ref={filesRef} type="file" multiple hidden
                      onChange={(ev) => { const l = ev.target.files ? [...ev.target.files] : []; ev.target.value = ""; if (l.length) upload(l); }} />
                    <button type="button" className="ep-btn sm" disabled={pending} onClick={() => filesRef.current?.click()}>＋ 파일 올리기</button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {e.leaveDate && !emp.leaveDate && <p className="ep-note">퇴사일을 넣었습니다. 저장하면 그날 뒤의 기록은 집계에서 빠지고, 지난 기록은 그대로 남습니다.</p>}
        {msg?.ok && <div className="msg ok">{msg.ok}</div>}
        {msg?.error && <div className="msg err">{msg.error}</div>}
        <div className="ep-actions">
          {!isNew && <button type="button" className="ep-btn danger" disabled={pending} onClick={del}>명부에서 지우기</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="ep-btn" onClick={onClose}>닫기</button>
          <button type="button" className="ep-btn pri" disabled={pending || !dirty || !e.name.trim()} onClick={save}>{pending ? "저장 중…" : "저장"}</button>
        </div>
      </aside>
    </div>
  );
}
