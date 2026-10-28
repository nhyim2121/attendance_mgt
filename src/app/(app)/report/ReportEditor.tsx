"use client";

import { toBlob, toPng } from "html-to-image";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { LEAVE_TYPES, renderReportHtml, type ReportRow, splitReportTypes } from "@/lib/daily";
import { dayLabel } from "@/lib/time";
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
  mail: { configured: boolean; sender: string; to: string; cc: string; subject: string; greeting: string };
}

type Res = { ok?: string; error?: string } | null;
const TYPES = [...LEAVE_TYPES, "외근"];
const blank = (section: string): ReportRow => ({
  section, ord: 0, dept: "", rank: "", name: "", types: "", title: "", detail: "", value: "", note: "",
});
const KEYS = ["section", "dept", "rank", "name", "types", "title", "detail", "value", "note"] as const;
const norm = (rows: ReportRow[]) => rows.filter((r) => r.name.trim())
  .map((r) => KEYS.map((k) => String(r[k] ?? "")).join("\u0000")).join("\n");

const TABS: [string, string][] = [["근태", "근태현황"], ["도제", "일학습병행(도제)"], ["휴가일정", "휴가일정"], ["휴일근무", "휴일 근태"]];

export default function ReportEditor(p: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ReportRow[]>(p.saved);
  const [tab, setTab] = useState("근태");
  const [msg, setMsg] = useState<Res>(null);
  const [pending, start] = useTransition();
  const cap = useRef<HTMLDivElement>(null);
  const [shot, setShot] = useState("");
  const [mail, setMail] = useState({ to: p.mail.to, cc: p.mail.cc, subject: p.mail.subject, greeting: p.mail.greeting, ok: false });

  // 부서·직급을 비우면 명단의 부서, 최근 직급으로 채운다
  const final = useMemo(() => {
    const ord: Record<string, number> = {};
    return rows.filter((r) => r.name.trim()).map((r) => ({
      ...r, dept: r.dept || p.deptOf[r.name] || "", rank: r.rank || p.ranks[r.name] || "",
      ord: (ord[r.section] = (ord[r.section] ?? 0) + 1),
    }));
  }, [rows, p.deptOf, p.ranks]);
  const dirty = norm(final) !== norm(p.saved);
  const noType = final.filter((r) => r.section === "근태" && !r.types).map((r) => r.name);
  const html = useMemo(() => renderReportHtml(p.day, final), [p.day, final]);

  const hol = useMemo(() => {
    const s = new Set(p.holidayDates);
    rows.filter((r) => r.section === "휴일근무").forEach((r) => splitReportTypes(r.types).forEach((t) => t.length === 10 && s.add(t)));
    return [...s].sort();
  }, [rows, p.holidayDates]);

  const idx = rows.map((r, i) => [r, i] as const).filter(([r]) => r.section === tab);
  const set = (i: number, patch: Partial<ReportRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const toggleType = (i: number, t: string) => {
    const cur = splitReportTypes(rows[i].types);
    set(i, { types: (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(",") });
  };
  const run = (fn: () => Promise<Res>, refresh = true) => start(async () => {
    const r = await fn();
    setMsg(r);
    if (r?.ok && refresh) router.refresh();
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
            else setRows((rs) => [...pre, ...rs.filter((r) => r.section !== "근태")]);
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
              {l} ({rows.filter((r) => r.section === k && r.name).length})
            </button>
          ))}
        </div>
        <div className="tbl-wrap">
          <table className="tbl edit">
            <thead><tr>
              <th>성명</th><th>부서</th><th>직급</th>
              {tab === "근태" && <><th>근태 (여러 개 가능)</th><th>근무지·사유</th><th>시간·내용</th><th>비고</th></>}
              {tab === "도제" && <><th>출근 완료</th><th>비고란</th></>}
              {tab === "휴가일정" && <><th>출근예정</th><th>휴가 일정</th></>}
              {tab === "휴일근무" && <>{hol.map((d) => <th key={d}>{dayLabel(d)}</th>)}<th>작업내용·근무지</th><th>비고</th></>}
              <th />
            </tr></thead>
            <tbody>
              {idx.map(([r, i]) => (
                <tr key={i}>
                  <td>{nameSelect(i, r)}</td>
                  <td>{text(i, "dept", p.deptOf[r.name] ?? "", 80)}</td>
                  <td>{text(i, "rank", p.ranks[r.name] ?? "", 60)}</td>
                  {tab === "근태" && <>
                    <td style={{ whiteSpace: "normal", minWidth: 260 }}>
                      {TYPES.map((t) => (
                        <label key={t} style={{ display: "inline-flex", gap: 3, marginRight: 8, fontSize: ".82rem" }}>
                          <input type="checkbox" checked={splitReportTypes(r.types).includes(t)} onChange={() => toggleType(i, t)} />{t}
                        </label>
                      ))}
                    </td>
                    <td>{text(i, "title", "예: 김포발전소, 개인사유", 160)}</td>
                    <td>{text(i, "detail", "예: 08:30~13:30", 140)}</td>
                    <td>{text(i, "note")}</td>
                  </>}
                  {tab === "도제" && <><td>{text(i, "value", "예: 10/23(금) 또는 -")}</td><td>{text(i, "note", "", 280)}</td></>}
                  {tab === "휴가일정" && <><td>{text(i, "value", "예: 10/30(금)")}</td><td>{text(i, "note", "예: 10/29(목) 1일 연차", 280)}</td></>}
                  {tab === "휴일근무" && <>
                    {hol.map((d) => (
                      <td key={d} style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={splitReportTypes(r.types).includes(d)} onChange={() => {
                          const cur = splitReportTypes(r.types);
                          set(i, { types: hol.filter((x) => (x === d ? !cur.includes(d) : cur.includes(x))).join(",") });
                        }} />
                      </td>
                    ))}
                    <td>{text(i, "title", "예: 에쓰엔 / 신공장 페인트 작업", 200)}</td><td>{text(i, "note")}</td>
                  </>}
                  <td><button className="btn sm danger" onClick={() => remove(i)} title="행 삭제">삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => setRows((rs) => [...rs, blank(tab)])}>+ 행 추가</button>
          <span className="caption" style={{ margin: 0 }}>
            {tab === "근태" && "같은 출장지·사유가 이어지는 사람은 같은 내용을 적어 주세요."}
            {tab === "휴일근무" && "근무한 휴일 날짜에 체크하세요. 기본으로 직전 주말과 최근 공휴일이 표시됩니다."}
          </span>
        </div>
      </div>

      {noType.length > 0 && <div className="msg warn" style={{ marginTop: 12 }}>근태 종류가 비어 있는 사람: {noType.join(", ")}</div>}
      <div className="row" style={{ margin: "12px 0" }}>
        <button className="btn primary" disabled={pending || (!dirty && p.isSaved)}
          onClick={() => run(() => saveReportAction(p.day, final))}>저장</button>
        <button className="btn" disabled={pending || !dirty} onClick={() => setRows(p.saved)}>편집 취소</button>
        <details className="pop left">
          <summary className="btn" aria-disabled={!p.isSaved}>보고서 삭제</summary>
          {p.isSaved && (
            <div className="pop-body">
              <p>{dayLabel(p.day)} 보고서를 지웁니다. 근태 판정은 근태현황 파일 기준으로 돌아갑니다.</p>
              <button className="btn danger" disabled={pending || !p.canDelete} onClick={() => run(() => deleteReportAction(p.day))}>
                삭제</button>
              {!p.canDelete && <p className="caption">작성자나 관리자만 지울 수 있습니다.</p>}
            </div>
          )}
        </details>
        {dirty && <span style={{ color: "#e07b00" }}>저장하지 않은 변경 사항이 있습니다.</span>}
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
        {(dirty || !p.isSaved) && <div className="msg warn" style={{ marginTop: 10 }}>저장된 보고서만 보낼 수 있습니다. 먼저 <b>저장</b>해 주세요.</div>}
        <label className="row" style={{ gap: 6, margin: "10px 0" }}>
          <input type="checkbox" checked={mail.ok} onChange={(e) => setMail({ ...mail, ok: e.target.checked })} />
          위 받는 사람·참조에게 저장된 보고서를 보냅니다.
        </label>
        <button className="btn primary" disabled={pending || !p.mail.configured || !mail.ok || !mail.to.trim() || dirty || !p.isSaved}
          onClick={() => run(() => sendReportMail(p.day, mail.to, mail.cc, mail.subject, mail.greeting))}>
          {pending ? "보내는 중..." : "메일 보내기"}</button>
      </div>
    </>
  );
}
