import { DEFAULT_RULE, type WorkRule } from "@/lib/config";
import type { Cell, Grid } from "@/lib/excel";
import type { Leave } from "@/lib/hiworks";
import { applyHeader, type CapsRecord, guessMapping, normalize } from "@/lib/loader";

export const RULE: WorkRule = DEFAULT_RULE; // 08:30 ~ 17:30
export const HEADER = ["요일", "발생일자", "발생시각", "이름", "근무형태", "구분", "모드", "인증", "근무지", "비고"];

/** [일자, 시각, 이름, 모드] -> 표준 기록 (부서 지정) */
export function mini(rows: [string, string, string, string][], dept: string | ((n: string) => string) = "생산팀"):
  CapsRecord[] {
  const raw: Grid = [HEADER, ...rows.map(([d, t, n, m]) => ["", d, t, n, "", "일반", m, "카드", "", ""] as Cell[])];
  const { records } = normalize(applyHeader(raw, 0), guessMapping(HEADER));
  return records.map((r) => ({ ...r, dept: typeof dept === "function" ? dept(r.name) : dept }));
}

export function leave(day: string, name: string, dept: string, rank: string, type: string, content: string,
  note = "", sheet = ""): Leave {
  return { day, name, dept, rank, type, content, note, sheet };
}
