"use client";

import { toBlob, toPng } from "html-to-image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addWorkHours, attCat, isPartialSchedule, LEAVE_TYPES, leaveUnit, renderReportHtml, type ReportRow, returnDays, SCHEDULE_TYPES, scheduleText, splitReportTypes,
  tidySchedule, timeLabel,
} from "@/lib/인사노무/daily";
import { addDays, dayLabel, isDateStr, weekday } from "@/lib/time";
import { carryAction, deleteReportAction, prefillAction, saveReportAction, sendReportMail } from "./actions";

interface Props {
  day: string;
  saved: ReportRow[];
  isSaved: boolean;
  canDelete: boolean;
  hasPrev: boolean;
  names: string[];
  deptOf: Record<string, string>;
  ranks: Record<string, string>;
  holidayDates: string[]; // 휴일 근태 표에 기본으로 보일 날짜 (직전 주말·최근 공휴일)
  holidays: string[]; // 공휴일 전체 (출근예정 계산)
  mail: { configured: boolean; sender: string; to: string; cc: string; subject: string; greeting: string };
}

type Res = { ok?: string; error?: string } | null;
/** 근태 종류 버튼 묶음 (보고서 화면 정돈 2026-11-11) */
const TYPE_GROUPS: [string, string[]][] = [
  ["휴가", ["연차", "월차", "반차", "반반차", "외출"]],
  ["특별", ["공가", "경조휴가", "병가"]],
  ["근무", ["출장", "외근", "교육", "휴일근무", "연장근무"]],
];
// 묶음에 빠진 종류가 생기면 근무 묶음 끝에 붙인다
[...LEAVE_TYPES, "외근"].forEach((t) => { if (!TYPE_GROUPS.some(([, ts]) => ts.includes(t))) TYPE_GROUPS[2][1].push(t); });
const blank = (section: string): ReportRow => ({
  section, ord: 0, dept: "", rank: "", name: "", types: "", title: "", detail: "", value: "", note: "",
});
const KEYS = ["section", "dept", "rank", "name", "types", "title", "detail", "value", "note"] as const;
const norm = (rows: ReportRow[]) => rows.filter((r) => r.name.trim())
  .map((r) => KEYS.map((k) => String(r[k] ?? "")).join("\u0000")).sort().join("\n"); // 순서는 비교하지 않음

/** 근태현황 탭은 '근태 건' 단위로 편집한다: 근태·근무지·내용·비고가 같은 사람들을 한 줄(인원)로. 저장은 사람별 행. */
interface Group { id: number; types: string; title: string; detail: string; note: string; names: string[]; from: string; to: string }
let gid = 0;
const newGroup = (g: Partial<Group> = {}): Group => ({ id: ++gid, types: "", title: "", detail: "", note: "", names: [], from: "", to: "", ...g });
const RANGE = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/;
function toGroups(rows: ReportRow[]): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows.filter((x) => x.section === "근태")) {
    const types = splitReportTypes(r.types).join(",");
    const k = [splitReportTypes(r.types).sort().join(","), r.title.trim(), r.detail.trim(), r.note.trim(), r.value].join("\u0000");
    const rg = RANGE.exec(r.value ?? "");
    const g = m.get(k) ?? newGroup({ types, title: r.title, detail: r.detail, note: r.note, from: rg?.[1] ?? "", to: rg?.[2] ?? "" });
    if (r.name && !g.names.includes(r.name)) g.names.push(r.name);
    m.set(k, g);
  }
  return [...m.values()];
}
/** 휴일 근태는 날짜·근무지·작업내용이 같은 사람들을 한 줄(명단)로 편집한다. 저장은 사람별 행, 제목 = '근무지 / 작업내용'. */
interface HGroup { id: number; types: string; place: string; work: string; note: string; names: string[] }
const newHGroup = (g: Partial<HGroup> = {}): HGroup => ({ id: ++gid, types: "", place: "", work: "", note: "", names: [], ...g });
const hTitle = (g: HGroup) => [g.place.trim(), g.work.trim()].filter(Boolean).join(" / ");
function toHGroups(rows: ReportRow[]): HGroup[] {
  const m = new Map<string, HGroup>();
  for (const r of rows.filter((x) => x.section === "휴일근무")) {
    const types = splitReportTypes(r.types).sort().join(",");
    const k = [types, r.title.trim(), r.note.trim()].join("\u0000");
    const cut = r.title.indexOf("/");
    const place = (cut < 0 ? r.title : r.title.slice(0, cut)).trim();
    const work = cut < 0 ? "" : r.title.slice(cut + 1).trim();
    const g = m.get(k) ?? newHGroup({ types, place, work, note: r.note });
    if (r.name && !g.names.includes(r.name)) g.names.push(r.name);
    m.set(k, g);
  }
  return [...m.values()];
}
const GROUPED = (s: string) => s === "근태" || s === "휴일근무";

/** 인원 칩 + [+ 인원] 체크 목록 */
function NamePicker({ names, all, toggle, hint }: { names: string[]; all: string[]; toggle: (n: string) => void; hint: string }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      {names.map((n) => (
        <span key={n} className="name-chip">{n}
          <button type="button" title="빼기" onClick={() => toggle(n)}>×</button></span>
      ))}
      <details className="pop left">
        <summary className="btn sm">+ 인원</summary>
        <div className="pop-body mates-pop">
          <b>같이 해당되는 직원</b>
          <p className="caption" style={{ margin: "2px 0 8px" }}>{hint}</p>
          <div className="mates-grid">
            {all.map((n) => (
              <label key={n}><input type="checkbox" checked={names.includes(n)} onChange={() => toggle(n)} />{n}</label>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

const TABS: [string, string][] = [["근태", "근태현황"], ["도제", "일학습병행(도제)"], ["휴가일정", "휴가일정"], ["휴일근무", "휴일 근태"]];

export default function ReportEditor(p: Props) {
  const router = useRouter();
  // 근태현황 밖의 탭. 예전 휴가일정 줄은 사람·종류·시간별 한 줄로 정리해서 연다
  const [rows, setRows] = useState<ReportRow[]>(() => tidySchedule(p.saved.filter((r) => !GROUPED(r.section)), p.day));
  const [hgroups, setHGroups] = useState<HGroup[]>(() => toHGroups(p.saved));
  const hset = useMemo(() => new Set(p.holidays), [p.holidays]);
  const isWorkday = (d: string) => weekday(d) < 5 && !hset.has(d);
  const [groups, setGroups] = useState<Group[]>(() => toGroups(p.saved));
  // 저장돼 있던 사람별 부서·직급 (직접 고친 값 유지)
  const info = useMemo(() => new Map(p.saved.filter((r) => r.section === "근태").map((r) => [r.name, r])), [p.saved]);
  const hinfo = useMemo(() => new Map(p.saved.filter((r) => r.section === "휴일근무").map((r) => [r.name, r])), [p.saved]);
  const [tab, setTab] = useState("근태");
  const [msg, setMsg] = useState<Res>(null);
  const [pending, start] = useTransition();
  const cap = useRef<HTMLDivElement>(null);
  const [shot, setShot] = useState("");
  const [mail, setMail] = useState({ to: p.mail.to, cc: p.mail.cc, subject: p.mail.subject, greeting: p.mail.greeting, ok: false });

  // 부서·직급을 비우면 명단의 부서, 최근 직급으로 채운다
  const final = useMemo(() => {
    const ord: Record<string, number> = {};
    const att: ReportRow[] = groups.flatMap((g) => g.names.map((n) => ({
      ...blank("근태"), name: n, dept: info.get(n)?.dept ?? "", rank: info.get(n)?.rank ?? "",
      types: g.types, title: g.title, detail: g.detail, note: g.note,
      value: g.from && g.to && g.to > g.from ? `${g.from}~${g.to}` : "",
    })));
    const hw: ReportRow[] = hgroups.flatMap((g) => g.names.map((n) => ({
      ...blank("휴일근무"), name: n, dept: hinfo.get(n)?.dept ?? "", rank: hinfo.get(n)?.rank ?? "",
      types: g.types, title: hTitle(g), note: g.note,
    })));
    // 휴가일정: 출근 예정은 날짜에서 자동 계산
    const sch = rows.map((r) => (r.section === "휴가일정" && r.types
      ? { ...r, value: isPartialSchedule(r.title) ? "" : returnDays(splitReportTypes(r.types), isWorkday).map((d) => dayLabel(d)).join(", ") } : r));
    return [...att, ...sch, ...hw].filter((r) => r.name.trim()).map((r) => ({
      ...r, dept: r.dept || p.deptOf[r.name] || "", rank: r.rank || p.ranks[r.name] || "",
      ord: (ord[r.section] = (ord[r.section] ?? 0) + 1),
    }));
  }, [rows, groups, hgroups, info, hinfo, p.deptOf, p.ranks]);
  // 자동 저장: 마지막으로 저장한 내용(baseline)과 다르면 입력을 멈추고 1.5초 뒤 저장한다 (화면은 그대로 둔다)
  const [baseline, setBaseline] = useState<string | null>(null);
  useEffect(() => { setBaseline((b) => b ?? norm(final)); }, [final]);
  const [savedOnce, setSavedOnce] = useState(p.isSaved);
  const [autoAt, setAutoAt] = useState("");
  const dirty = baseline !== null && norm(final) !== baseline;
  const isSaved = savedOnce;
  const noType = groups.filter((g) => g.names.length && !g.types).flatMap((g) => g.names);
  const setG = (id: number, patch: Partial<Group>) => setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const toggleGType = (g: Group, t: string) => {
    const cur = splitReportTypes(g.types);
    setG(g.id, { types: (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(",") });
  };
  const toggleName = (g: Group, n: string) =>
    setG(g.id, { names: g.names.includes(n) ? g.names.filter((x) => x !== n) : [...g.names, n] });
  const setH = (id: number, patch: Partial<HGroup>) => setHGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const html = useMemo(() => renderReportHtml(p.day, final), [p.day, final]);

  const hol = useMemo(() => {
    const s = new Set(p.holidayDates);
    hgroups.forEach((g) => splitReportTypes(g.types).forEach((t) => t.length === 10 && s.add(t)));
    return [...s].sort();
  }, [hgroups, p.holidayDates]);

  const idx = rows.map((r, i) => [r, i] as const).filter(([r]) => r.section === tab);
  const set = (i: number, patch: Partial<ReportRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const toggleType = (i: number, t: string) => {
    const cur = splitReportTypes(rows[i].types);
    set(i, { types: (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(",") });
  };
  const saveNow = (manual: boolean) => start(async () => {
    const snap = norm(final);
    const r = await saveReportAction(p.day, final);
    if (r?.ok) {
      setBaseline(snap);
      setSavedOnce(true);
      setAutoAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
      if (manual) setMsg(r);
    } else setMsg(r);
  });
  useEffect(() => {
    if (!dirty || noType.length || pending) return;
    const t = setTimeout(() => saveNow(false), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [final, dirty]);
  // 삭제처럼 서버 내용이 바뀌는 버튼 뒤에만 저장된 값으로 다시 채운다. 자동 저장은 화면을 그대로 둔다 (입력 중 커서가 튕기지 않게)
  const reload = useRef(false);
  useEffect(() => {
    if (!reload.current) return;
    reload.current = false;
    setRows(tidySchedule(p.saved.filter((r) => !GROUPED(r.section)), p.day));
    setGroups(toGroups(p.saved));
    setHGroups(toHGroups(p.saved));
    setBaseline(null);
    setSavedOnce(p.isSaved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.saved]);
  const run = (fn: () => Promise<Res>, refresh = true, resync = false) => start(async () => {
    reload.current = resync;
    const r = await fn();
    setMsg(r);
    if (r?.ok && refresh) router.refresh();
    else reload.current = false;
  });

  async function image(kind: "png" | "copy") {
    if (!cap.current) return;
    await document.fonts.ready;
    try {
      if (kind === "png") {
        const a = document.createElement("a");
        a.download = `근태현황_${p.day}.png`;
        a.href = await toPng(cap.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
        a.click();
        setShot("저장했습니다.");
      } else {
        const b = await toBlob(cap.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
        await navigator.clipboard.write([new ClipboardItem({ "image/png": b! })]);
        setShot("복사했습니다. 메일·메신저에 붙여넣기(Ctrl+V) 하세요.");
      }
    } catch {
      setShot("이 브라우저에서는 복사가 막혀 있습니다 (http 접속). 이미지로 저장을 써 주세요.");
    }
  }

  const nameSelect = (i: number, r: ReportRow) => (
    <select value={r.name} style={{ minWidth: 96 }} onChange={(e) => set(i, { name: e.target.value })}>
      <option value="">-</option>
      {(p.names.includes(r.name) || !r.name ? p.names : [r.name, ...p.names]).map((n) => <option key={n}>{n}</option>)}
    </select>
  );
  const text = (i: number, k: keyof ReportRow, ph = "", w = 110) => (
    <input type="text" value={String(rows[i][k] ?? "")} placeholder={ph} style={{ minWidth: w }}
      onChange={(e) => set(i, { [k]: e.target.value })} />
  );

  return (
    <>
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.error && <div className="msg err">{msg.error}</div>}
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" disabled={pending} title="업로드된 근태현황(하이웍스) 파일에 이 날짜로 적힌 근태를 가져옵니다."
          onClick={() => start(async () => {
            const pre = await prefillAction(p.day);
            if (!pre.length) setMsg({ error: "근태현황 파일에 이 날짜 기록이 없습니다." });
            else setGroups(toGroups(pre));
          })}>근태현황 파일 내용 불러오기</button>
        <button className="btn" disabled={pending || !p.hasPrev} title="계속 이어지는 일학습병행(도제)·휴가일정 표를 가장 최근 보고서에서 복사합니다."
          onClick={() => start(async () => {
            const carry = await carryAction(p.day);
            setRows((rs) => [...rs.filter((r) => r.section !== "도제" && r.section !== "휴가일정"), ...carry]);
          })}>전일 보고서에서 도제·휴가일정 가져오기</button>
      </div>

      <div className="card">
        <div className="tabs">
          {TABS.map(([k, l]) => (
            <button key={k} className={k === tab ? "on" : ""} onClick={() => setTab(k)}>
              {l} ({k === "근태" ? groups.reduce((t, g) => t + g.names.length, 0)
                : k === "휴일근무" ? hgroups.reduce((t, g) => t + g.names.length, 0)
                : rows.filter((r) => r.section === k && r.name).length})
            </button>
          ))}
        </div>
        {tab === "근태" && (
          <div className="rg-list">
            {groups.length === 0 && <p className="caption" style={{ margin: "6px 2px" }}>아직 근태가 없습니다. 아래 [+ 근태 추가]를 누르세요.</p>}
            {groups.map((g, n) => {
              const cur = splitReportTypes(g.types);
              return (
                <div key={g.id} className={`rg-card${!cur.length && g.names.length ? " warn" : ""}`}>
                  <div className="rg-head">
                    <span className="rg-no">{n + 1}</span>
                    <div className="rg-types">
                      {TYPE_GROUPS.map(([label, ts]) => (
                        <span key={label} className="rg-tgroup">
                          <small>{label}</small>
                          {ts.map((t) => (
                            <button key={t} type="button" className={`rg-t${cur.includes(t) ? " on" : ""}`} onClick={() => toggleGType(g, t)}>{t}</button>
                          ))}
                        </span>
                      ))}
                    </div>
                    <button type="button" className="rg-del" onClick={() => setGroups((gs) => gs.filter((x) => x.id !== g.id))} title="이 근태 삭제">삭제</button>
                  </div>
                  <div className="rg-body">
                    <div className="rg-cell rg-who">
                      <span className="rg-lbl">인원</span>
                      <NamePicker names={g.names} all={p.names} toggle={(nm) => toggleName(g, nm)} hint="고른 사람마다 같은 근태·근무지·내용으로 저장됩니다." />
                    </div>
                    <div className="rg-cell" title="연속 출장 등: 기간 안의 다른 근무일 보고서에도 같은 줄이 들어갑니다">
                      <span className="rg-lbl">기간</span>
                      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <input type="date" value={g.from || p.day} style={{ width: 132 }}
                          onChange={(e) => setG(g.id, { from: e.target.value, to: g.to && g.to >= e.target.value ? g.to : e.target.value })} />
                        <span className="muted">~</span>
                        <input type="date" value={g.to || g.from || p.day} min={g.from || p.day} style={{ width: 132 }}
                          onChange={(e) => setG(g.id, { from: g.from || p.day, to: e.target.value })} />
                      </span>
                    </div>
                    {cur.length ? <GroupFields g={g} setG={setG} /> : <div className="rg-cell rg-hint">위에서 근태 종류를 고르면 장소·사유 칸이 나옵니다.</div>}
                    <label className="rg-cell"><span className="rg-lbl">비고</span>
                      <input type="text" value={g.note} style={{ width: 140 }} onChange={(e) => setG(g.id, { note: e.target.value })} /></label>
                  </div>
                  {cur.length > 0 && g.names.length > 0 && (
                    <div className="rg-out">보고서에는 <q>{[cur.join("·"), g.title.trim(), g.detail.trim() && (timeLabel(g.detail) || g.detail.trim())].filter(Boolean).join(" · ")}</q> — {g.names.join("·")} {g.names.length}명{g.from && g.to && g.to > g.from ? ` (${dayLabel(g.from)}~${dayLabel(g.to)})` : ""}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {tab === "휴가일정" && (
          <div className="rg-list">
            {idx.length === 0 && <p className="caption" style={{ margin: "6px 2px" }}>아직 휴가일정이 없습니다. 아래 [+ 휴가 추가]를 누르세요.</p>}
            {idx.map(([r, i], n) => {
              const legacy = !r.types && !r.title && !!r.note; // 정리하지 못한 예전 줄
              const ds = splitReportTypes(r.types).filter(isDateStr).sort();
              const kind = r.title || "연차";
              const partial = isPartialSchedule(kind);
              const unit = leaveUnit(kind);
              const tm = /^(\d{1,2}:\d{2})?\s*~\s*(\d{1,2}:\d{2})?$/.exec(r.detail.trim());
              const st = tm?.[1] ? tm[1].padStart(5, "0") : "", et = tm?.[2] ? tm[2].padStart(5, "0") : "";
              const back = partial ? "당일 출근" : returnDays(ds, isWorkday).map((d) => dayLabel(d)).join(", ") || "-";
              return (
                <div key={i} className="rg-card">
                  <div className="rg-head">
                    <span className="rg-no">{n + 1}</span>
                    {nameSelect(i, r)}
                    <div className="rg-types">
                      {!legacy && SCHED_GROUPS.map(([label, ts]) => (
                        <span key={label} className="rg-tgroup"><small>{label}</small>
                          {ts.map((t) => (
                            <button key={t} type="button" className={`rg-t${kind === t ? " on" : ""}`}
                              onClick={() => set(i, { title: t, ...(leaveUnit(t) !== unit ? { detail: "" } : {}) })}>{t}</button>
                          ))}
                        </span>
                      ))}
                    </div>
                    <button type="button" className="rg-del" onClick={() => remove(i)} title="이 휴가 삭제">삭제</button>
                  </div>
                  {legacy ? (
                    <div className="rg-body">
                      <label className="rg-cell"><span className="rg-lbl">휴가 일정 (예전 형식)</span>{text(i, "note", "예: 10/29(목) 1일 연차", 320)}</label>
                      <label className="rg-cell"><span className="rg-lbl">출근 예정</span>{text(i, "value", "예: 10/30(금)")}</label>
                    </div>
                  ) : (
                    <div className="rg-body">
                      <div className="rg-cell"><span className="rg-lbl">날짜</span>
                        <div className="row" style={{ gap: 4, maxWidth: 380 }}>
                          {ds.map((d) => (
                            <span key={d} className="name-chip">{dayLabel(d)}
                              <button type="button" title="빼기" onClick={() => set(i, { types: ds.filter((x) => x !== d).join(",") })}>×</button></span>
                          ))}
                          <input type="date" value="" title="날짜 추가" style={{ width: 140 }} onChange={(e) => {
                            const v = e.target.value;
                            if (v && !ds.includes(v)) set(i, { types: [...ds, v].sort().join(","), title: kind });
                          }} />
                        </div>
                      </div>
                      {unit !== "day" && (
                        <div className="rg-cell"><span className="rg-lbl">{unit === "free" ? "시간 (30분 단위)" : `시간 (${unit}시간)`}</span>
                          {unit === 4 || unit === 2
                            ? <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                                {slotSel(st, (x) => set(i, { detail: x ? `${x}~${addWorkHours(x, unit)}` : "" }))}
                                <span>~ {st ? addWorkHours(st, unit) : "--:--"}</span></span>
                            : <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                                {slotSel(st, (x) => set(i, { detail: x && et && et > x ? `${x}~${et}` : x ? `${x}~` : "" }))}~
                                {slotSel(et, (x) => set(i, { detail: st && x ? `${st}~${x}` : "" }), SLOTS.filter((t) => !st || t > st))}</span>}
                        </div>
                      )}
                      <label className="rg-cell"><span className="rg-lbl">사유</span>{text(i, "note", "예: 개인사유, 병원", 150)}</label>
                      <div className="rg-cell"><span className="rg-lbl">출근 예정 (자동)</span><span className="rg-auto">{back}</span></div>
                    </div>
                  )}
                  {!legacy && ds.length > 0 && (
                    <div className="rg-out">보고서에는 <q>{scheduleText({ ...r, title: kind })}</q> → {partial ? "당일 출근" : `출근 ${back}`}</div>
                  )}
                </div>
              );
            })}
            {rows.some((r) => r.section === "휴가일정" && r.types) && (
              <p className="caption" style={{ margin: "2px" }}>저장하면 오늘 이후 날짜는 <b>휴가 관리</b>에도 휴가로 등록됩니다 (다시 저장하면 최신 내용으로 바뀜).
                반차·반반차·외출은 그날도 출근하므로 출근 예정을 &lsquo;당일 출근&rsquo;으로 봅니다.</p>
            )}
          </div>
        )}
        {tab === "휴일근무" && (
          <div className="rg-list">
            {hgroups.length === 0 && <p className="caption" style={{ margin: "6px 2px" }}>아직 휴일 근무가 없습니다. 아래 [+ 작업 추가]를 누르세요.</p>}
            {hgroups.map((g, n) => {
              const ds = splitReportTypes(g.types).filter(isDateStr);
              const opts = [...new Set([...hol, ...ds])].sort();
              const toggleDay = (d: string) =>
                setH(g.id, { types: (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]).sort().join(",") });
              return (
                <div key={g.id} className={`rg-card${g.names.length && !ds.length ? " warn" : ""}`}>
                  <div className="rg-head">
                    <span className="rg-no">{n + 1}</span>
                    <div className="rg-types">
                      <span className="rg-tgroup"><small>날짜</small>
                        {opts.map((d) => (
                          <button key={d} type="button" className={`rg-t${ds.includes(d) ? " on" : ""}`} onClick={() => toggleDay(d)}>{dayLabel(d)}</button>
                        ))}
                        <input type="date" value="" title="다른 날짜 추가" className="rg-date-add" onChange={(e) => {
                          const v = e.target.value;
                          if (v && !ds.includes(v)) toggleDay(v);
                        }} />
                      </span>
                    </div>
                    <button type="button" className="rg-del" onClick={() => setHGroups((gs) => gs.filter((x) => x.id !== g.id))} title="이 작업 삭제">삭제</button>
                  </div>
                  <div className="rg-body">
                    <div className="rg-cell rg-who"><span className="rg-lbl">명단</span>
                      <NamePicker names={g.names} all={p.names} hint="고른 사람마다 같은 날짜·근무지·작업내용으로 저장됩니다."
                        toggle={(nm) => setH(g.id, { names: g.names.includes(nm) ? g.names.filter((x) => x !== nm) : [...g.names, nm] })} />
                    </div>
                    <label className="rg-cell"><span className="rg-lbl">근무지</span>
                      <input type="text" value={g.place} placeholder="예: 에쓰엔" style={{ width: 130 }}
                        onChange={(e) => setH(g.id, { place: e.target.value.replace(/\//g, "") })} /></label>
                    <label className="rg-cell"><span className="rg-lbl">작업내용</span>
                      <input type="text" value={g.work} placeholder="예: 신공장 페인트 작업" style={{ width: 210 }}
                        onChange={(e) => setH(g.id, { work: e.target.value })} /></label>
                    <label className="rg-cell"><span className="rg-lbl">비고</span>
                      <input type="text" value={g.note} style={{ width: 130 }} onChange={(e) => setH(g.id, { note: e.target.value })} /></label>
                  </div>
                  {(hTitle(g) || g.names.length > 0) && (
                    <div className="rg-out">보고서에는 <q>{hTitle(g) || "근무지 / 작업내용"}</q>{g.names.length ? ` — ${g.names.join("·")} ${g.names.length}명` : ""}{ds.length ? `, ${ds.map((d) => dayLabel(d)).join("·")}` : " (날짜를 고르세요)"}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {tab === "도제" && <div className="tbl-wrap">
          <table className="tbl edit">
            <thead><tr>
              <th>성명</th><th>부서</th><th>직급</th>
              <th>출근 완료</th><th>비고란</th>
              <th />
            </tr></thead>
            <tbody>
              {idx.map(([r, i]) => (
                <tr key={i}>
                  <td>{nameSelect(i, r)}</td>
                  <td>{text(i, "dept", p.deptOf[r.name] ?? "", 80)}</td>
                  <td>{text(i, "rank", p.ranks[r.name] ?? "", 60)}</td>
                  <td>{text(i, "value", "예: 10/23(금) 또는 -")}</td><td>{text(i, "note", "", 280)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn sm danger" onClick={() => remove(i)} title="행 삭제">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => (tab === "근태" ? setGroups((gs) => [...gs, newGroup()])
            : tab === "휴일근무" ? setHGroups((gs) => [...gs, newHGroup()])
            : setRows((rs) => [...rs, tab === "휴가일정" ? { ...blank(tab), title: "연차" } : blank(tab)]))}>{tab === "근태" ? "+ 근태 추가" : tab === "휴가일정" ? "+ 휴가 추가" : tab === "휴일근무" ? "+ 작업 추가" : "+ 행 추가"}</button>
          <span className="caption" style={{ margin: 0 }}>
            {tab === "근태" && "근태 한 건마다 카드 한 장입니다. 종류를 누르고, 같은 출장·휴가에 해당하는 사람은 [+ 인원]으로 고르세요. 기간을 정하면 그 기간의 다른 근무일 보고서에도 같은 줄이 들어갑니다. 부서·직급은 직원 명부에서 자동으로 채웁니다."}
            {tab === "휴가일정" && "한 사람의 휴가 한 건마다 카드 한 장: 종류를 누르고 날짜를 여러 개 넣으세요. 출근 예정은 자동으로 계산됩니다."}
            {tab === "휴일근무" && "작업 한 건마다 카드 한 장: 근무한 날짜를 누르고 같이 일한 사람은 [+ 인원]으로 고르세요. 보고서에는 「근무지 / 작업내용」으로 나옵니다."}
          </span>
        </div>
      </div>

      {noType.length > 0 && <div className="msg warn" style={{ marginTop: 12 }}>근태 종류가 비어 있는 사람: {noType.join(", ")}</div>}
      <div className="row" style={{ margin: "12px 0" }}>
        <button className="btn primary" disabled={pending || (!dirty && isSaved)} onClick={() => saveNow(true)}>저장</button>
        <button className="btn" disabled={pending || !dirty} onClick={() => { setRows(p.saved.filter((r) => !GROUPED(r.section))); setGroups(toGroups(p.saved)); setHGroups(toHGroups(p.saved)); }}>편집 취소</button>
        <details className="pop left">
          <summary className="btn" aria-disabled={!p.isSaved}>보고서 삭제</summary>
          {p.isSaved && (
            <div className="pop-body">
              <p>{dayLabel(p.day)} 보고서를 지웁니다. 근태 판정은 근태현황 파일 기준으로 돌아갑니다.</p>
              <button className="btn danger" disabled={pending || !p.canDelete} onClick={() => run(() => deleteReportAction(p.day), true, true)}>
                삭제</button>
              {!p.canDelete && <p className="caption">작성자나 관리자만 지울 수 있습니다.</p>}
            </div>
          )}
        </details>
        {pending ? <span className="muted">저장 중…</span>
          : dirty ? <span style={{ color: "#e07b00" }}>{noType.length ? "근태 종류를 고르면 자동 저장됩니다." : "잠시 후 자동 저장됩니다…"}</span>
            : autoAt ? <span style={{ color: "#1f8a3b" }}>✓ 자동 저장됨 {autoAt}</span> : null}
      </div>

      <div className="card">
        <div className="card-title">미리보기</div>
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn primary" onClick={() => image("png")}>이미지로 저장 (PNG)</button>
          <button className="btn" onClick={() => image("copy")}>이미지 복사</button>
          <span style={{ color: "#1f8a3b", fontSize: 13 }}>{shot}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div ref={cap} style={{ display: "inline-block", width: "100%", maxWidth: 920 }} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">하이웍스 메일로 보내기</div>
        {p.mail.configured
          ? <p className="caption">보내는 사람: {p.mail.sender}</p>
          : <div className="msg info">메일 발송 설정이 아직 없습니다. 서버 PC의 프로젝트 폴더에서 <code>.env.local</code>에 하이웍스 메일 계정(HIWORKS_SMTP_USER, HIWORKS_SMTP_PASSWORD)을 적은 뒤 사이트를 다시 켜 주세요. 그 전에는 위의 <b>이미지 복사</b>로 하이웍스 메일에 붙여 넣어 보낼 수 있습니다.</div>}
        <div className="grid2">
          <label className="field">받는 사람<input type="text" value={mail.to} placeholder="a@회사.co.kr, b@회사.co.kr"
            onChange={(e) => setMail({ ...mail, to: e.target.value })} /></label>
          <label className="field">참조<input type="text" value={mail.cc} onChange={(e) => setMail({ ...mail, cc: e.target.value })} /></label>
        </div>
        <label className="field" style={{ marginTop: 10 }}>제목<input type="text" value={mail.subject}
          onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></label>
        <label className="field" style={{ marginTop: 10 }}>본문 인사말<textarea rows={3} value={mail.greeting}
          onChange={(e) => setMail({ ...mail, greeting: e.target.value })} /></label>
        {(dirty || !isSaved) && <div className="msg warn" style={{ marginTop: 10 }}>저장된 보고서만 보낼 수 있습니다. 먼저 <b>저장</b>해 주세요.</div>}
        <label className="row" style={{ gap: 6, margin: "10px 0" }}>
          <input type="checkbox" checked={mail.ok} onChange={(e) => setMail({ ...mail, ok: e.target.checked })} />
          위 받는 사람·참조에게 저장된 보고서를 보냅니다.
        </label>
        <button className="btn primary" disabled={pending || !p.mail.configured || !mail.ok || !mail.to.trim() || dirty || !isSaved}
          onClick={() => run(() => sendReportMail(p.day, mail.to, mail.cc, mail.subject, mail.greeting))}>
          {pending ? "보내는 중..." : "메일 보내기"}</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 근태 종류별 입력칸
// title = 장소(출장·교육·휴일연장) 또는 사유(휴가류), detail = 내용 또는 시간('HH:MM~HH:MM')
const catOf = attCat;
const PLACES = ["1공장", "2공장", "출장"];
// 30분 단위 시각 07:00 ~ 22:00
const SLOTS = Array.from({ length: 31 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const slotSel = (v: string, on: (x: string) => void, opts = SLOTS) => (
  <select value={v} onChange={(e) => on(e.target.value)} style={{ width: 92 }}>
    <option value="">--:--</option>{opts.map((t) => <option key={t}>{t}</option>)}
  </select>
);
/** 휴가일정 종류 버튼 묶음 */
const DAYOFF = ["연차", "월차", "반차", "반반차", "외출"];
const SCHED_GROUPS: [string, string[]][] = [
  ["휴가", SCHEDULE_TYPES.filter((t) => DAYOFF.includes(t))],
  ["특별", SCHEDULE_TYPES.filter((t) => !DAYOFF.includes(t))],
];

function Labeled({ label, children, group }: { label: string; children: React.ReactNode; group?: boolean }) {
  // 선택칸이 여러 개면 <label>로 감싸지 않음 (클릭이 첫 칸으로 넘어가 목록이 안 뜸)
  if (group) return <div className="gf"><span>{label}</span>{children}</div>;
  return <label className="gf"><span>{label}</span>{children}</label>;
}

function GroupFields({ g, setG }: { g: { id: number; types: string; title: string; detail: string }; setG: (id: number, p: { title?: string; detail?: string }) => void }) {
  const cat = catOf(g.types);
  const title = (label: string, ph: string) => (
    <Labeled label={label}><input type="text" value={g.title} placeholder={ph} onChange={(e) => setG(g.id, { title: e.target.value })} /></Labeled>
  );
  const detail = (label: string, ph: string) => (
    <Labeled label={label}><input type="text" value={g.detail} placeholder={ph} onChange={(e) => setG(g.id, { detail: e.target.value })} /></Labeled>
  );
  if (cat === "trip") return <><div className="rg-cell">{title("근무장소", "예: SK나래에너지(하남)")}</div><div className="rg-cell">{detail("목적/작업내용", "예: MCOP 취외 작업")}</div></>;
  if (cat === "edu") return <><div className="rg-cell">{title("교육장소", "예: 서산상공회의소")}</div><div className="rg-cell">{detail("교육목적/내용", "예: 산업안전 보건교육")}</div></>;
  if (cat === "work") {
    const custom = g.title && !PLACES.includes(g.title);
    return <>
      <div className="rg-cell"><Labeled label="근무장소">
        <select value={custom ? "__" : g.title} onChange={(e) => setG(g.id, { title: e.target.value === "__" ? g.title : e.target.value })}>
          <option value="">선택</option>{PLACES.map((p) => <option key={p}>{p}</option>)}
          {custom && <option value="__">{g.title}</option>}
        </select>
      </Labeled></div>
      <div className="rg-cell">{detail("목적/작업내용", "예: 신공장 배관 작업")}</div>
    </>;
  }
  if (cat === "special") return <><div className="rg-cell"><div className="gf-two">{title("구분 사유", "예: 본인 결혼, 예비군, 진단명")}{detail("비고", "예: 증빙 제출 예정")}</div></div></>;
  if (cat === "leave") {
    const unit = leaveUnit(g.types);
    // 시작만 고른 상태('09:00~')도 읽음
    const m = /^(\d{1,2}:\d{2})?\s*~\s*(\d{1,2}:\d{2})?$/.exec(g.detail.trim());
    const [st, et] = m ? [(m[1] ?? "").padStart(m[1] ? 5 : 0, "0"), (m[2] ?? "").padStart(m[2] ? 5 : 0, "0")] : ["", ""];
    const sel = (v: string, on: (x: string) => void, opts = SLOTS) => (
      <select value={v} onChange={(e) => on(e.target.value)} style={{ width: 92 }}>
        <option value="">--:--</option>{opts.map((t) => <option key={t}>{t}</option>)}
      </select>
    );
    let timeBox: React.ReactNode;
    if (unit === "day") timeBox = <span className="gf-fixed">종일 (1일)</span>;
    else if (unit === 4 || unit === 2) {
      // 반차·반반차: 시작만 고르면 끝은 자동 (점심을 지나면 그만큼 뒤로)
      timeBox = <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
        {sel(st, (x) => setG(g.id, { detail: x ? `${x}~${addWorkHours(x, unit)}` : "" }))}
        <span>~ {st ? addWorkHours(st, unit) : "--:--"}</span><small className="muted">({unit}시간)</small>
      </span>;
    } else {
      timeBox = <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
        {sel(st, (x) => setG(g.id, { detail: x && et && et > x ? `${x}~${et}` : x ? `${x}~` : "" }))}~
        {sel(et, (x) => setG(g.id, { detail: st && x ? `${st}~${x}` : "" }), SLOTS.filter((t) => !st || t > st))}
        {timeLabel(g.detail) && <small className="muted">{timeLabel(g.detail).replace(/^.*\(/, "(")}</small>}
      </span>;
    }
    return <>
      
      <div className="rg-cell"><div className="gf-two">
        {title("사유", "예: 개인사유, 병원")}
        <Labeled label={unit === "day" ? "기간" : unit === "free" ? "시간 (30분 단위)" : `시간 (${unit}시간)`} group>{timeBox}</Labeled>
      </div></div>
    </>;
  }
  return <><div className="rg-cell">{title("장소·사유", "")}</div><div className="rg-cell">{detail("내용", "")}</div></>;
}
