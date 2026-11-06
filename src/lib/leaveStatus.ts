/** 하이웍스 '휴가현황(종류별)' 내보내기 (YYYYMMDDhhmmss_휴가현황(종류별).xls) 읽기와 연차 현황에 반영.
 *
 * 첫 시트: '휴가현황(종류별)_2026_전직원'
 *   이름 | 아이디 | 사번 | 입사일 | 계정 상태 | 올해 생성 | 생성내역(정기·포상·기타) | 사용현황(연차·포상·월차·경조사·반반차·공가·외출·반차·병가) | 잔여
 * 나머지 시트: '2026-01' ~ '2026-12' 월별 사용현황 (같은 열에서 생성·잔여만 없음)
 * 사용 일수는 모두 '일' 단위 (외출 1시간 = 0.125일). 결재 완료된 앞날의 휴가도 이미 사용에 들어 있다.
 * 하이웍스 잔여 = 올해 생성 − (연차·포상·월차·반차·반반차·외출). 경조사·공가·병가는 빼지 않는다.
 */
import type { Grid, Sheets } from "./excel";
import { type DateStr, isDateStr, makeDate } from "./time";
import type { LeaveBalance, LeavePolicy } from "./vacation";

/** 하이웍스 사용현황 열 이름 -> 사이트 휴가 유형 */
const USE_COLS: Record<string, string> = {
  연차: "연차", 포상: "포상", 월차: "월차", 경조사: "경조휴가", 반반차: "반반차", 공가: "공가", 외출: "외출", 반차: "반차", 병가: "병가",
};
/** 하이웍스가 잔여에서 빼는 유형 */
export const HW_DEDUCT = ["연차", "포상", "월차", "반차", "반반차", "외출"];

export interface HwStatus {
  fy: number;
  name: string;
  loginId: string;
  empNo: string;
  joinDate: DateStr | null;
  state: string; // 계정 상태
  granted: number; // 올해 생성
  grant: { 정기: number; 포상: number; 기타: number };
  used: Record<string, number>; // 유형별 사용 일수 (사이트 유형 이름)
  remain: number;
  months: Record<string, Record<string, number>>; // 'YYYY-MM' -> 유형별 사용 일수
  exportedAt: string; // 'YYYY-MM-DD HH:MM' (파일 이름의 내려받은 시각, 없으면 올린 시각)
  edited?: string; // 연차 현황에서 직접 고친 사람·시각 (고친 적 없으면 빈 값)
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, "").trim());
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const r4 = (x: number) => Math.round(x * 10000) / 10000;

/** 머리 두 줄(위: 묶음 이름, 아래: 세부 열)을 찾아 열 번호를 돌려준다 */
function header(g: Grid): { row: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(g.length - 1, 10); i++) {
    const top = g[i].map(text);
    if (top[0] !== "이름" || !top.includes("사용현황")) continue;
    const sub = g[i + 1].map(text);
    const col: Record<string, number> = {};
    top.forEach((h, c) => { if (h && !(h in col)) col[h] = c; });
    // 생성내역·사용현황 아래 세부 열 (같은 이름 '포상'이 두 번 나오므로 묶음 범위 안에서 찾는다)
    const span = (group: string, names: string[], prefix: string) => {
      const start = col[group];
      if (start === undefined) return;
      for (let c = start; c < sub.length; c++) {
        if (c > start && top[c]) break; // 다음 묶음
        if (names.includes(sub[c])) col[prefix + sub[c]] = c;
      }
    };
    span("생성내역", ["정기", "포상", "기타"], "생성:");
    span("사용현황", Object.keys(USE_COLS), "사용:");
    return { row: i + 1, col };
  }
  return null;
}

function joinDay(v: unknown): DateStr | null {
  const s = String(v ?? "").trim();
  if (isDateStr(s)) return s;
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(s);
  return m ? makeDate(+m[1], +m[2], +m[3]) : null;
}

/** 파일 이름 '20261105114941_휴가현황(종류별).xls' -> '2026-11-05 11:49' */
export function exportTime(filename: string): string | null {
  const m = /(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\d{2}/.exec(filename);
  return m && makeDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : null;
}

/** 휴가현황(종류별) 파일 -> 직원별 현황. 형식이 아니면 오류. */
export function parseLeaveStatus(sheets: Sheets, filename: string, now: string): { fy: number; rows: HwStatus[] } {
  const first = sheets.find(([, g]) => g.some((r) => /휴가현황/.test(text(r[0]))));
  if (!first) throw new Error("하이웍스 '휴가현황(종류별)' 파일이 아닙니다 (제목 '휴가현황(종류별)_2026_전직원'이 없음).");
  const g = first[1];
  const title = g.map((r) => text(r[0])).find((t) => /휴가현황/.test(t)) ?? "";
  const fy = Number(/_(\d{4})_/.exec(title)?.[1] ?? /(20\d{2})/.exec(title)?.[1]);
  if (!fy) throw new Error(`연도를 찾을 수 없습니다 (제목: ${title}).`);
  const h = header(g);
  if (!h || h.col["올해생성"] === undefined || h.col["잔여"] === undefined) {
    throw new Error("열 이름(이름·올해 생성·생성내역·사용현황·잔여)을 찾을 수 없습니다.");
  }
  const exportedAt = exportTime(filename) ?? now;
  const out = new Map<string, HwStatus>();
  for (const r of g.slice(h.row + 1)) {
    const name = text(r[h.col["이름"]]);
    if (!name) continue;
    const used: Record<string, number> = {};
    for (const [hw, t] of Object.entries(USE_COLS)) {
      const c = h.col[`사용:${hw}`];
      if (c !== undefined && num(r[c])) used[t] = r4(num(r[c]));
    }
    const gc = (k: string) => (h.col[`생성:${k}`] === undefined ? 0 : num(r[h.col[`생성:${k}`]]));
    out.set(name, {
      fy, name, loginId: text(r[h.col["아이디"]]), empNo: text(r[h.col["사번"]]), joinDate: joinDay(r[h.col["입사일"]]),
      state: text(r[h.col["계정상태"]]), granted: r4(num(r[h.col["올해생성"]])),
      grant: { 정기: gc("정기"), 포상: gc("포상"), 기타: gc("기타") }, used, remain: r4(num(r[h.col["잔여"]])), months: {}, exportedAt,
    });
  }
  if (!out.size) throw new Error("직원 행이 없습니다.");
  // 월별 시트 'YYYY-MM'
  for (const [sheet, mg] of sheets) {
    const month = /^(\d{4})-(\d{2})$/.exec(sheet.trim()) ? sheet.trim() : /\((\d{4}-\d{2})\)/.exec(text(mg[0]?.[0]))?.[1];
    if (!month) continue;
    const mh = header(mg);
    if (!mh) continue;
    for (const r of mg.slice(mh.row + 1)) {
      const s = out.get(text(r[mh.col["이름"]]));
      if (!s) continue;
      const u: Record<string, number> = {};
      for (const [hw, t] of Object.entries(USE_COLS)) {
        const c = mh.col[`사용:${hw}`];
        if (c !== undefined && num(r[c])) u[t] = r4(num(r[c]));
      }
      if (Object.keys(u).length) s.months[month] = u;
    }
  }
  return { fy, rows: [...out.values()] };
}

/** 하이웍스 기준 사용(잔여에서 빠지는) 일수 */
export const hwDeducted = (s: Pick<HwStatus, "used">) => r4(HW_DEDUCT.reduce((t, k) => t + (s.used[k] ?? 0), 0));

/** 잔여 = 생성 − 사용. 하이웍스 파일의 잔여 칸은 입사 1년 미만 직원이 쓴 '연차'(선사용)를 빼지 않아
 * 초과 사용이 마이너스로 안 보이므로(예: 생성 6 · 사용 8 인데 잔여 1) 쓰지 않는다.
 * 연차 현황 '숫자 수정'에서 잔여를 직접 넣은 줄만 그 값을 쓴다. */
export const hwRemain = (s: Pick<HwStatus, "used" | "granted" | "remain" | "edited">) => (s.edited ? s.remain : r4(s.granted - hwDeducted(s)));
/** 하이웍스 파일의 잔여 칸이 생성 − 사용과 다른지 */
export const hwRemainDiffers = (s: Pick<HwStatus, "used" | "granted" | "remain">) => Math.abs(s.granted - hwDeducted(s) - s.remain) > 0.001;

/** 사이트 계산 결과 (하이웍스 숫자로 바꾸기 전) */
export interface SiteCalc { total: number; used: number; planned: number; remain: number }

export type HwBalance = LeaveBalance & { hw?: HwStatus; site?: SiteCalc };

/** 연차 현황을 하이웍스 휴가현황 숫자로 바꾼다. 파일에 있는 사람만 (없는 사람은 사이트 계산 그대로).
 * 부여 = 올해 생성 (정기 = 연차 칸, 포상·기타 = 조정 칸), 사용 = 잔여에서 빠지는 유형 합 (앞날 결재 포함),
 * 잔여 = 하이웍스 잔여. 유형별 칸도 하이웍스 일수. 사이트 계산은 site에 남겨 비교에 쓴다. */
export function applyHwStatus(bal: LeaveBalance[], rows: HwStatus[], p: LeavePolicy): HwBalance[] {
  const by = new Map(rows.map((s) => [s.name, s]));
  return bal.map((b): HwBalance => {
    const s = by.get(b.name);
    if (!s) return b;
    const typeDays: Record<string, number> = {}, counts: Record<string, number> = {};
    for (const [t, d] of Object.entries(s.used)) {
      if (!d) continue;
      typeDays[t] = d;
      counts[t] = b.counts[t] || 1; // 건수는 사이트 기록 (없으면 1: 칸 표시용)
    }
    const used = hwDeducted(s);
    return {
      ...b, hw: s, site: { total: b.total, used: b.used, planned: b.planned, remain: b.remain },
      annual: s.grant.정기, annualNote: `하이웍스 정기 생성 ${s.grant.정기}일`, monthly: 0, monthlyLater: 0,
      adjust: r4(s.grant.포상 + s.grant.기타), expired: 0, expireLater: 0,
      total: s.granted, used, planned: 0, remain: hwRemain(s), typeDays, counts,
      outingHours: r4((s.used.외출 ?? 0) * p.outingHoursPerDay),
    };
  });
}
