/** 날짜·시각 다루기.
 *
 * 출입일시는 시간대 없는 현지 시각이다. 서버 시간대에 흔들리지 않도록
 * 'YYYY-MM-DD' 문자열(일자)과 UTC 기준 밀리초(Ts, 현지 시각을 UTC로 취급)만 쓴다.
 */
import { WEEKDAYS_KR } from "./config";

export type DateStr = string; // 'YYYY-MM-DD'
export type Ts = number; // 현지 시각을 UTC로 본 밀리초

const DAY_MS = 86_400_000;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function makeDate(y: number, m: number, d: number): DateStr | null {
  const t = Date.UTC(y, m - 1, d);
  const x = new Date(t);
  if (x.getUTCFullYear() !== y || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d) return null;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function isDateStr(s: unknown): s is DateStr {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateParts(s) !== null;
}

function dateParts(s: DateStr): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  return makeDate(y, mo, d) ? [y, mo, d] : null;
}

export function dayMs(s: DateStr): number {
  const [y, m, d] = dateParts(s)!;
  return Date.UTC(y, m - 1, d);
}

export function ts(day: DateStr, seconds = 0): Ts {
  return dayMs(day) + seconds * 1000;
}

export function tsDate(t: Ts): DateStr {
  const x = new Date(t);
  return `${pad(x.getUTCFullYear(), 4)}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

/** 'HH:MM:SS' */
export function tsTime(t: Ts): string {
  const x = new Date(t);
  return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`;
}

export function tsHM(t: Ts | null | undefined): string {
  return t == null ? "" : tsTime(t).slice(0, 5);
}

/** 'YYYY-MM-DD HH:MM:SS' (DB 저장용) */
export function tsString(t: Ts): string {
  return `${tsDate(t)} ${tsTime(t)}`;
}

/** DB의 'YYYY-MM-DDTHH:MM:SS' 또는 'YYYY-MM-DD HH:MM:SS' -> Ts */
export function parseTs(s: string): Ts {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) throw new Error(`잘못된 일시: ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/** 자정 이후 분 */
export function minutesOf(t: Ts): number {
  const x = new Date(t);
  return x.getUTCHours() * 60 + x.getUTCMinutes();
}

/** 자정 이후 초 */
export function secondsOf(t: Ts): number {
  return Math.floor((((t % DAY_MS) + DAY_MS) % DAY_MS) / 1000);
}

/** 월=0 ... 일=6 */
export function weekday(s: DateStr): number {
  return (new Date(dayMs(s)).getUTCDay() + 6) % 7;
}

export function weekdayKr(s: DateStr): string {
  return WEEKDAYS_KR[weekday(s)];
}

export function addDays(s: DateStr, n: number): DateStr {
  return tsDate(dayMs(s) + n * DAY_MS);
}

export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((dayMs(b) - dayMs(a)) / DAY_MS);
}

export function monthOf(s: DateStr): string {
  return s.slice(0, 7);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 분 -> 'HH:MM' */
export function hhmm(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** 'HH:MM' -> 분 */
export function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}

/** '8:30', '08:30:15' -> 자정 이후 초. 빈 값·잘못된 값은 null. */
export function parseClock(text: string | null | undefined): number | null {
  if (text == null) return null;
  const parts = String(text).trim().split(":");
  if (![2, 3].includes(parts.length) || !parts.every((p) => /^\d+$/.test(p.trim()))) return null;
  const [h, m, s = 0] = parts.map(Number);
  if (h > 23 || m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

const KST = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** 시각 -> 'YYYY-MM-DD HH:MM:SS' 한국 시각 */
function kst(d: Date): string {
  const p = Object.fromEntries(KST.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** 서버 PC 기준 오늘 (한국 시각) */
export function todayKst(): DateStr {
  return nowKst().slice(0, 10);
}

/** 'YYYY-MM-DD HH:MM:SS' 한국 시각 */
export function nowKst(): string {
  return kst(new Date());
}

/** timestamptz 문자열 -> 'MM-DD HH:MM' (한국 시각) */
export function shortKst(iso: string | null | undefined): string {
  return iso ? kst(new Date(iso)).slice(5, 16) : "";
}

/** timestamptz 문자열 -> 'YYYY-MM-DD HH:MM:SS' (한국 시각) */
export function fullKst(iso: string | null | undefined): string {
  return iso ? kst(new Date(iso)) : "";
}

/** '10/26(월)' 또는 '2026년 10월 26일(월)' */
export function dayLabel(d: DateStr, year = false): string {
  const [y, m, day] = dateParts(d)!;
  return year ? `${y}년 ${m}월 ${day}일(${weekdayKr(d)})` : `${m}/${day}(${weekdayKr(d)})`;
}

/** '10월 26일 (월)' */
export function dayLabelLong(d: DateStr): string {
  const [, m, day] = dateParts(d)!;
  return `${m}월 ${day}일 (${weekdayKr(d)})`;
}
