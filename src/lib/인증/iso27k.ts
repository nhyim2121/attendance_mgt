/** ISO/IEC 27001:2022 업무실적문서 (2026-11-23, 관리자만). 서버 전용.
 *
 *  양식: 데이터/iso27001/template.hwpx (W:\김도아\10_ISO27001(정보보호)\10-1. 실적문서\★ ISO-IEC27001-2022 업무실적문서.hwpx 사본.
 *  IP 관리대장 등 사내 정보가 있어 저장소에는 올리지 않는다). 양식 한 장 = 그 파일 본문의 문단 범위(FORMS의 sec·from·to).
 *  양식 파일을 바꾸면 범위가 달라질 수 있으니 FORMS를 다시 맞춘다 (scratchpad의 hwpx_chunks.py 같은 방식으로 문단 번호 확인).
 *
 *  작성한 문서 = iso_docs 한 줄: data.v = { 칸 id: 고친 글 }, data.rows = { 표 id: 늘린 줄 수 }.
 *  화면은 양식을 그대로 그려 칸마다 바로 적게 하고, 내려받기는 양식 파일에 적은 글만 바꿔 넣은 한글 파일(.hwpx)이다. */
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { createClient } from "../supabase/server";
import type { DateStr } from "../time";
import { attr, clone, isEl, kid, kids, parse, setAttr, unesc, walk, write, esc, type XEl } from "./hwpxml";

// ---------------------------------------------------------------- 양식 목록
export interface IsoForm { key: string; code: string; title: string; group: string; cycle: string; sec: number; from: number; to: number }
const F = (key: string, title: string, group: string, cycle: string, from: number, to: number, sec = 0, code = key.replace(/b$/, "")): IsoForm =>
  ({ key, code: `SN-ISP-${code}`, title, group, cycle, sec, from, to });

export const GROUPS = ["조직·점검", "자산·변경", "운영·사고·외부업체", "인적 보안·교육", "문서 관리", "기술 보안", "성과 평가", "개선"] as const;

export const FORMS: IsoForm[] = [
  F("401-01", "이해관계자 파악표", "조직·점검", "매년", 33, 41),
  F("401-02", "부서별 자체 보안점검표", "조직·점검", "매월", 41, 55),
  F("503-01", "장비 변경 관리대장", "자산·변경", "대장", 55, 63),
  F("601-01", "변경작업 요청서", "자산·변경", "건별", 63, 75),
  F("601-02", "서버 보안패치 관리대장", "자산·변경", "대장", 75, 80),
  F("601-03", "침해사고 발생 및 조치결과 보고서", "운영·사고·외부업체", "건별", 80, 87),
  F("603-01", "침해사고 훈련 계획서", "운영·사고·외부업체", "매년", 87, 114),
  F("603-01b", "IT재해복구 결과보고서", "운영·사고·외부업체", "건별", 114, 121),
  F("604-01", "외부업체 보안점검표", "운영·사고·외부업체", "건별", 121, 128),
  F("606-01", "외부업체 계약만료 보안점검표", "운영·사고·외부업체", "계약 끝날 때", 128, 149),
  F("606-01b", "개인정보처리 위탁 실태점검표", "운영·사고·외부업체", "매년", 149, 172),
  F("606-02", "출입관리대장", "운영·사고·외부업체", "대장", 172, 180),
  F("702-01", "보호구역 내 작업절차", "운영·사고·외부업체", "게시", 180, 210),
  F("702-01b", "정보보호교육 결과 보고서", "인적 보안·교육", "교육 때", 210, 216),
  F("703-01", "정보보호 교육 설문서", "인적 보안·교육", "교육 때", 216, 235),
  F("703-02", "정보보호 교육계획서", "인적 보안·교육", "매년", 235, 244),
  F("703-03", "정보보호 교육 참석자 명단", "인적 보안·교육", "교육 때", 244, 255),
  F("703-03b", "정보보호 서약서 (입사 시)", "인적 보안·교육", "입사 때", 255, 260),
  F("704-01", "정보보호 서약서 (외부자용)", "인적 보안·교육", "출입 때", 260, 266),
  F("704-02", "정보보호 서약서 (퇴직자용)", "인적 보안·교육", "퇴사 때", 266, 269),
  F("704-03", "정보자산 반납 확인서 (퇴직자용)", "인적 보안·교육", "퇴사 때", 269, 274),
  F("704-04", "문서 제·개정 심의서", "문서 관리", "개정 때", 274, 279),
  F("705-01", "문서배포처 대장", "문서 관리", "대장", 279, 283),
  F("705-02", "문서파일 목록", "문서 관리", "대장", 283, 286),
  F("705-03", "사외규격 관리대장", "문서 관리", "대장", 286, 290),
  F("705-04", "개인계정 권한 신청서", "기술 보안", "건별", 290, 293),
  F("801-01", "IP 관리대장 (네트워크 구성도)", "기술 보안", "바뀔 때", 293, 299),
  F("801-02", "VPN 계정사용 신청서", "기술 보안", "건별", 299, 303),
  F("801-03", "VPN 사용현황 검토 결과", "기술 보안", "반기", 303, 307),
  F("801-04", "방화벽 VPN 사용자 리스트", "기술 보안", "바뀔 때", 307, 310),
  F("801-05", "암호화키 관리대장", "기술 보안", "대장", 310, 314),
  F("802-01", "응용프로그램 보안성 검토 체크리스트", "기술 보안", "도입 때", 314, 346),
  F("804-01", "개인정보 수집·이용 동의서", "인적 보안·교육", "입사 때", 346, 352),
  F("805-01", "내부심사 실시계획 통보서", "성과 평가", "매년", 352, 354),
  F("902-01", "내부심사 일정표", "성과 평가", "매년", 354, 357),
  F("902-02", "내부심사 결과보고서", "성과 평가", "매년", 357, 400),
  F("903-01", "경영검토보고서", "성과 평가", "매년", 400, 403),
  F("1001-01", "시정 및 예방조치 요구서", "개선", "건별", 403, 406),
  F("1001-02", "시정조치 관리대장", "개선", "대장", 0, 3, 1),
  F("1002-01", "개선 추진 계획서", "개선", "건별", 0, 3, 2),
  F("1002-02", "개선 추진 실적 보고서", "개선", "건별", 3, 6, 2),
];
export const formOf = (key: string) => FORMS.find((f) => f.key === key);

// ---------------------------------------------------------------- 양식 파일
const TEMPLATE = join(process.cwd(), "데이터", "iso27001", "template.hwpx");
const HP = "hp:";
interface Styles { char: Map<string, { pt: number; bold: boolean; color: string }>; para: Map<string, string>; fill: Map<string, BorderFill> }
interface BorderFill { bg?: string; l: string; r: string; t: string; b: string }
interface Tpl { bytes: Buffer; zip: JSZip; secs: { head: string; root: XEl }[]; styles: Styles; margin: { l: number; r: number; t: number; b: number } }
let cache: { at: number; tpl: Promise<Tpl> } | null = null;

export async function templateReady(): Promise<boolean> {
  try { await readFile(TEMPLATE); return true; } catch { return false; }
}

async function template(): Promise<Tpl> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.tpl;
  const tpl = (async () => {
    const bytes = await readFile(TEMPLATE);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)![0] - +b.match(/\d+/)![0]);
    const secs = await Promise.all(names.map(async (n) => parse(await zip.file(n)!.async("string"))));
    const header = parse(await zip.file("Contents/header.xml")!.async("string")).root;
    const styles: Styles = { char: new Map(), para: new Map(), fill: new Map() };
    const line = (e?: XEl) => {
      if (!e || attr(e, "type") === "NONE") return "none";
      const mm = parseFloat(attr(e, "width") ?? "0.12");
      return `${Math.max(1, Math.round(mm * 3.78 * 10) / 10)}px ${attr(e, "type") === "DOUBLE_SLIM" ? "double" : attr(e, "type")?.startsWith("DASH") ? "dashed" : attr(e, "type") === "DOT" ? "dotted" : "solid"} ${attr(e, "color") ?? "#000"}`;
    };
    for (const e of walk(header)) {
      if (e.tag === "hh:charPr") styles.char.set(attr(e, "id")!, { pt: +(attr(e, "height") ?? 1000) / 100, bold: !!kid(e, "hh:bold"), color: attr(e, "textColor") ?? "#000000" });
      else if (e.tag === "hh:paraPr") styles.para.set(attr(e, "id")!, attr(kid(e, "hh:align") ?? e, "horizontal") ?? "JUSTIFY");
      else if (e.tag === "hh:borderFill") {
        const brush = [...walk(e)].find((x) => x.tag === "hc:winBrush");
        const face = brush && attr(brush, "faceColor");
        styles.fill.set(attr(e, "id")!, {
          bg: face && face !== "none" && face.toUpperCase() !== "#FFFFFF" ? face : undefined,
          l: line(kid(e, "hh:leftBorder")), r: line(kid(e, "hh:rightBorder")), t: line(kid(e, "hh:topBorder")), b: line(kid(e, "hh:bottomBorder")),
        });
      }
    }
    const m = [...walk(secs[0].root)].find((x) => x.tag === HP + "margin");
    const u = (k: string) => Math.round(+(attr(m ?? secs[0].root, k) ?? 0) / 75);
    return { bytes, zip, secs, styles, margin: { l: u("left"), r: u("right"), t: u("top"), b: u("bottom") } };
  })();
  cache = { at: Date.now(), tpl };
  tpl.catch(() => { cache = null; });
  return tpl;
}

// ---------------------------------------------------------------- 화면에 그릴 모양
export interface PB { k: "p"; id: string; text: string; edit: boolean; align: string; pt: number; bold: boolean; color: string }
export interface Cell { id: string; r: number; c: number; rs: number; cs: number; h: number; bg?: string; bd: [string, string, string, string]; va: string; align: string; pt: number; bold: boolean; text: string; edit: boolean; blocks: Block[] }
export interface TB { k: "t"; id: string; cols: number[]; rows: Cell[][]; addRow: boolean; align: string }
export type Block = PB | TB;
export interface Sheet { margin: Tpl["margin"]; blocks: Block[] }
export interface IsoData { v: Record<string, string>; rows: Record<string, number> }

/** 문단 글자 (탭은 공백 4칸, 줄바꿈은 \n) */
function paraText(p: XEl): string {
  let s = "";
  for (const r of kids(p, HP + "run")) for (const t of kids(r, HP + "t")) for (const k of t.kids) {
    if (!isEl(k)) s += unesc(k);
    else if (k.tag === HP + "tab") s += "    ";
    else if (k.tag === HP + "lineBreak") s += "\n";
  }
  return s;
}
const tablesIn = (p: XEl) => kids(p, HP + "run").flatMap((r) => kids(r, HP + "tbl"));

/** 문단·표·칸에 id를 붙여 찾기 쉽게: 맨 위 문단 = "번호", 표 = "번호.t순서", 칸 = "표id:행,열", 칸 안 표 = "칸id.p문단.t순서" */
type Node = { kind: "p"; el: XEl } | { kind: "t"; el: XEl } | { kind: "c"; el: XEl };
function index(ps: XEl[], from: number): Map<string, Node> {
  const m = new Map<string, Node>();
  const tbl = (t: XEl, id: string) => {
    m.set(id, { kind: "t", el: t });
    for (const tr of kids(t, HP + "tr")) for (const tc of kids(tr, HP + "tc")) {
      const a = kid(tc, HP + "cellAddr")!;
      const cid = `${id}:${attr(a, "rowAddr")},${attr(a, "colAddr")}`;
      m.set(cid, { kind: "c", el: tc });
      kids(kid(tc, HP + "subList") ?? tc, HP + "p").forEach((p, j) => {
        m.set(`${cid}.p${j}`, { kind: "p", el: p }); // 안에 표가 있는 칸은 문단마다 따로 적는다
        tablesIn(p).forEach((t2, k) => tbl(t2, `${cid}.p${j}.t${k}`));
      });
    }
  };
  ps.forEach((p, i) => {
    const id = String(from + i);
    m.set(id, { kind: "p", el: p });
    tablesIn(p).forEach((t, k) => tbl(t, `${id}.t${k}`));
  });
  return m;
}

/** 마지막 줄을 복사해 늘릴 수 있는 표인가 (마지막 줄이 칸을 다 채우고 세로로 합친 칸이 없음) */
function canGrow(t: XEl): boolean {
  const rows = kids(t, HP + "tr");
  const last = rows[rows.length - 1];
  if (!last || rows.length < 3) return false;
  const tcs = kids(last, HP + "tc");
  const span = (tc: XEl, k: string) => +(attr(kid(tc, HP + "cellSpan") ?? tc, k) ?? 1);
  return tcs.every((tc) => span(tc, "rowSpan") === 1) && tcs.reduce((s, tc) => s + span(tc, "colSpan"), 0) === +(attr(t, "colCnt") ?? 0);
}
function growTable(t: XEl, n: number) {
  const rows = kids(t, HP + "tr");
  const last = rows[rows.length - 1];
  const cnt = +(attr(t, "rowCnt") ?? rows.length);
  for (let k = 0; k < n; k++) {
    const tr = clone(last);
    for (const tc of kids(tr, HP + "tc")) {
      setAttr(kid(tc, HP + "cellAddr")!, "rowAddr", String(cnt + k));
      const txt = kids(kid(tc, HP + "subList") ?? tc, HP + "p").map(paraText).join("\n").trim();
      setCellText(tc, /^\d+$/.test(txt) ? String(+txt + k + 1) : "");
    }
    t.kids.push(tr);
  }
  setAttr(t, "rowCnt", String(cnt + n));
}

function setParaText(p: XEl, text: string) {
  const runs = kids(p, HP + "run");
  if (!runs.length) p.kids.push({ tag: HP + "run", attrs: [["charPrIDRef", "0"]], kids: [], self: false });
  const all = kids(p, HP + "run");
  const target = all.find((r) => kid(r, HP + "t")) ?? all.find((r) => !r.kids.some((k) => isEl(k) && k.tag !== HP + "t")) ?? all[0];
  for (const r of all) r.kids = r.kids.filter((k) => !(isEl(k) && k.tag === HP + "t"));
  const parts: (string | XEl)[] = [];
  text.split("\n").forEach((line, i) => {
    if (i) parts.push({ tag: HP + "lineBreak", attrs: [], kids: [], self: true });
    if (line) parts.push(esc(line));
  });
  target.kids.push({ tag: HP + "t", attrs: [], kids: parts, self: !parts.length });
  p.kids = p.kids.filter((k) => !(isEl(k) && k.tag === HP + "linesegarray")); // 줄 나눔 정보는 한글이 다시 계산
}
function setCellText(tc: XEl, text: string) {
  const sub = kid(tc, HP + "subList") ?? tc;
  const ps = kids(sub, HP + "p");
  const first = ps.find((p) => !tablesIn(p).length);
  if (!first) return;
  sub.kids = sub.kids.filter((k) => !(isEl(k) && k.tag === HP + "p" && k !== first && !tablesIn(k).length));
  setParaText(first, text);
}

/** 양식 한 장의 문단 (줄 늘림 반영) */
async function formParas(form: IsoForm, rows: IsoData["rows"]) {
  const tpl = await template();
  const sec = tpl.secs[form.sec];
  const ps = kids(sec.root, HP + "p").slice(form.from, form.to).map(clone);
  const ix = index(ps, form.from);
  for (const [id, n] of Object.entries(rows ?? {})) {
    const node = ix.get(id);
    if (node?.kind === "t" && n > 0 && canGrow(node.el)) growTable(node.el, Math.min(n, 200));
  }
  return { tpl, sec, ps, ix: index(ps, form.from) };
}

/** 화면용: 양식 모양 + 칸마다 양식에 적힌 글 */
export async function sheetOf(form: IsoForm, rows: IsoData["rows"] = {}): Promise<Sheet> {
  const { tpl, ps } = await formParas(form, rows);
  const st = tpl.styles;
  const look = (p?: XEl) => {
    const r = p && kids(p, HP + "run").find((x) => kid(x, HP + "t")) || (p && kid(p, HP + "run"));
    const c = st.char.get((r && attr(r, "charPrIDRef")) ?? "0") ?? { pt: 10, bold: false, color: "#000000" };
    return { align: st.para.get((p && attr(p, "paraPrIDRef")) ?? "0") ?? "JUSTIFY", pt: c.pt, bold: c.bold, color: c.color };
  };
  const table = (t: XEl, id: string): TB => {
    const colCnt = +(attr(t, "colCnt") ?? 1);
    const cols = Array<number>(colCnt).fill(0);
    const rows: Cell[][] = kids(t, HP + "tr").map((tr) => kids(tr, HP + "tc").map((tc) => {
      const a = kid(tc, HP + "cellAddr")!, sp = kid(tc, HP + "cellSpan"), sz = kid(tc, HP + "cellSz");
      const r = +(attr(a, "rowAddr") ?? 0), c = +(attr(a, "colAddr") ?? 0);
      const cs = +(attr(sp ?? tc, "colSpan") ?? 1), rs = +(attr(sp ?? tc, "rowSpan") ?? 1);
      const w = +(attr(sz ?? tc, "width") ?? 0) / 75;
      if (cs === 1 && c < colCnt && !cols[c]) cols[c] = w;
      const sub = kid(tc, HP + "subList");
      const cps = sub ? kids(sub, HP + "p") : [];
      const cid = `${id}:${r},${c}`;
      const blocks: Block[] = [];
      // 안에 표가 있는 칸: 문단과 표를 순서대로 (문단은 하나씩 적는 칸)
      if (cps.some((p) => tablesIn(p).length)) cps.forEach((p, j) => {
        const tx = paraText(p);
        if (!tablesIn(p).length || tx.trim()) blocks.push({ k: "p", id: `${cid}.p${j}`, text: tx, edit: !!tx.trim() && !tablesIn(p).length, ...look(p) });
        tablesIn(p).forEach((t2, k) => blocks.push(table(t2, `${cid}.p${j}.t${k}`)));
      });
      const bf = st.fill.get(attr(tc, "borderFillIDRef") ?? "") ?? { l: "1px solid #000", r: "1px solid #000", t: "1px solid #000", b: "1px solid #000" };
      const lk = look(cps.find((p) => paraText(p).trim()) ?? cps[0]);
      return {
        id: cid, r, c, rs, cs, h: Math.round(+(attr(sz ?? tc, "height") ?? 0) / 75), bg: bf.bg, bd: [bf.t, bf.r, bf.b, bf.l] as [string, string, string, string],
        va: (attr(sub ?? tc, "vertAlign") ?? "CENTER").toLowerCase(), ...lk,
        text: blocks.length ? "" : cps.map(paraText).join("\n"), edit: !blocks.length, blocks,
      };
    }));
    // 한 칸짜리가 없는 열은 합친 칸 너비를 나눠 채움
    for (const row of rows) for (const cell of row) if (cell.cs > 1) {
      const empty = Array.from({ length: cell.cs }, (_, i) => cell.c + i).filter((c) => c < colCnt && !cols[c]);
      const known = Array.from({ length: cell.cs }, (_, i) => cols[cell.c + i] || 0).reduce((s, x) => s + x, 0);
      const tw = +(attr(kid(kids(t, HP + "tr").flatMap((tr) => kids(tr, HP + "tc")).find((tc) => attr(kid(tc, HP + "cellAddr")!, "rowAddr") === String(cell.r) && attr(kid(tc, HP + "cellAddr")!, "colAddr") === String(cell.c))!, HP + "cellSz") ?? t, "width") ?? 0) / 75;
      for (const c of empty) cols[c] = Math.max(8, (tw - known) / empty.length);
    }
    return { k: "t", id, cols: cols.map((x) => Math.round(x || 40)), rows, addRow: canGrow(t), align: "center" };
  };
  const blocks: Block[] = [];
  ps.forEach((p, i) => {
    const id = String(form.from + i);
    const tbls = tablesIn(p);
    const text = paraText(p);
    if (!tbls.length || text.trim()) blocks.push({ k: "p", id, text, edit: !!text.trim() && !tbls.length, ...look(p) });
    tbls.forEach((t, k) => blocks.push(table(t, `${id}.t${k}`)));
  });
  return { margin: tpl.margin, blocks };
}

/** 양식에 적힌 글 (칸 id → 글): 저장할 때 바뀐 칸만 남기려고 */
export function textsOf(s: Sheet): Record<string, string> {
  const out: Record<string, string> = {};
  const go = (bs: Block[]) => bs.forEach((b) => {
    if (b.k === "p") { if (b.edit) out[b.id] = b.text; return; }
    // (칸 안 문단은 칸의 blocks로 들어 있음)
    for (const row of b.rows) for (const c of row) { if (c.edit) out[c.id] = c.text; go(c.blocks); }
  });
  go(s.blocks);
  return out;
}

// ---------------------------------------------------------------- 한글 파일로 내보내기
export async function exportHwpx(form: IsoForm, data: IsoData, title: string): Promise<Uint8Array> {
  const { tpl, sec, ps, ix } = await formParas(form, data.rows);
  for (const [id, val] of Object.entries(data.v ?? {})) {
    const node = ix.get(id);
    if (!node) continue;
    if (node.kind === "p" && !tablesIn(node.el).length) { if (paraText(node.el) !== val) setParaText(node.el, val); }
    else if (node.kind === "c") {
      const cur = kids(kid(node.el, HP + "subList") ?? node.el, HP + "p").filter((p) => !tablesIn(p).length).map(paraText).join("\n");
      if (cur !== val) setCellText(node.el, val);
    }
  }
  if (ps[0]) setAttr(ps[0], "pageBreak", "0");
  // 구역 첫 문단에는 용지·여백 설정(secPr)이 있어 늘 맨 앞에 둔다 (양식이 첫 문단부터가 아니면 설정만 떼어 붙임)
  const body = [...ps];
  if (form.from > 0) {
    const p0 = clone(kids(sec.root, HP + "p")[0]);
    for (const r of kids(p0, HP + "run")) r.kids = r.kids.filter((k) => !(isEl(k) && (k.tag === HP + "t" || k.tag === HP + "tbl")));
    p0.kids = p0.kids.filter((k) => !(isEl(k) && k.tag === HP + "linesegarray"));
    body.unshift(p0);
  }
  const root = { ...sec.root, kids: body } as XEl;
  const xml = `${sec.head}${write(root)}`;
  const out = await JSZip.loadAsync(tpl.bytes);
  for (const n of Object.keys(out.files)) if (/^Contents\/section\d+\.xml$/.test(n)) out.remove(n);
  out.file("Contents/section0.xml", xml);
  const hpf = (await out.file("Contents/content.hpf")!.async("string"))
    .replace(/<opf:item id="section[1-9]\d*"[^>]*\/>/g, "").replace(/<opf:itemref idref="section[1-9]\d*"[^>]*\/>/g, "")
    .replace(/<opf:title>[^<]*<\/opf:title>/, `<opf:title>${esc(title)}</opf:title>`);
  out.file("Contents/content.hpf", hpf);
  out.file("Preview/PrvText.txt", title);
  // mimetype은 압축하지 않고 맨 앞에 (hwpx 규칙)
  const mt = await out.file("mimetype")!.async("string");
  out.remove("mimetype");
  const fin = new JSZip();
  fin.file("mimetype", mt, { compression: "STORE" });
  for (const [n, f] of Object.entries(out.files)) if (!f.dir) fin.file(n, await f.async("uint8array"));
  return fin.generateAsync({ type: "uint8array", compression: "DEFLATE", mimeType: "application/hwp+zip" });
}

// ---------------------------------------------------------------- 작성한 문서 (DB)
export interface IsoDoc { id: number; form: string; day: DateStr; title: string; data: IsoData; updatedAt: string; updatedBy: string }
type Row = { id: number; form: string; day: string; title: string; data: IsoData | null; updated_at: string; updated_by: string };
const toDoc = (r: Row): IsoDoc => ({ id: r.id, form: r.form, day: r.day, title: r.title, data: { v: r.data?.v ?? {}, rows: r.data?.rows ?? {} }, updatedAt: r.updated_at, updatedBy: r.updated_by });
const COLS = "id, form, day, title, data, updated_at, updated_by";
function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data;
}

/** 목록 (data 빼고): 양식 하나 또는 전부 */
export async function listDocs(form?: string): Promise<Omit<IsoDoc, "data">[]> {
  const sb = await createClient();
  let q = sb.from("iso_docs").select("id, form, day, title, updated_at, updated_by");
  if (form) q = q.eq("form", form);
  const rows = (check(await q.order("day", { ascending: false }).order("id", { ascending: false }), "실적문서 목록 읽기") ?? []) as Omit<Row, "data">[];
  return rows.map((r) => ({ id: r.id, form: r.form, day: r.day, title: r.title, updatedAt: r.updated_at, updatedBy: r.updated_by }));
}
export async function loadDoc(id: number): Promise<IsoDoc | null> {
  const sb = await createClient();
  const r = check(await sb.from("iso_docs").select(COLS).eq("id", id).maybeSingle(), "실적문서 읽기");
  return r ? toDoc(r as Row) : null;
}
export async function createDoc(form: string, day: DateStr, title: string, data: IsoData, by: string): Promise<number> {
  const sb = await createClient();
  return (check(await sb.from("iso_docs").insert({ form, day, title, data, updated_by: by }).select("id").single(), "실적문서 만들기") as { id: number }).id;
}
export async function updateDoc(id: number, patch: Partial<{ day: DateStr; title: string; data: IsoData }>, by: string): Promise<void> {
  const sb = await createClient();
  check(await sb.from("iso_docs").update({ ...patch, updated_by: by, updated_at: new Date().toISOString() }).eq("id", id), "실적문서 저장");
}
export async function deleteDoc(id: number): Promise<void> {
  const sb = await createClient();
  check(await sb.from("iso_docs").delete().eq("id", id), "실적문서 삭제");
}
