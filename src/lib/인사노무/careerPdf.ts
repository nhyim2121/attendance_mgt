import "server-only";
/** 건강보험 자격득실확인서 · 고용보험 가입이력(자격이력내역서) PDF에서 사업장별 근무 기간을 뽑는다 (2026-11-19).
 *  글자가 든 PDF(공단에서 내려받은 원본)만 읽힌다. 스캔본은 빈 결과 → 화면에서 직접 적는다.
 *  PDF 글자 추출은 이 PC의 pdftotext(Git for Windows에 들어 있음)를 쓴다. 다른 위치면 환경변수 PDFTOTEXT. */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Career } from "./qualGrade";

const BIN = process.env.PDFTOTEXT || "C:\\Program Files\\Git\\ucrt64\\bin\\pdftotext.exe";

export async function pdfText(data: Uint8Array): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "qual-"));
  try {
    const f = path.join(dir, "in.pdf");
    await writeFile(f, data);
    return await new Promise<string>((ok, no) =>
      execFile(BIN, ["-layout", "-enc", "UTF-8", f, "-"], { maxBuffer: 8 << 20, timeout: 20000, encoding: "utf8" },
        (err, out) => (err ? no(new Error("PDF 글자를 읽지 못했습니다 (pdftotext).")) : ok(out))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const D = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g;
const iso = (m: RegExpMatchArray) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
const SKIP = /발급|출력|조회|인쇄|생년월일|주민|성\s*명|기간|페이지|확인|문의|위와|발행|신청|^\s*$/;

/** 줄마다 '사업장 이름 … 취득일 [상실일]'을 찾는다. 지역가입자·피부양자는 근무가 아니므로 뺀다. 같은 회사·기간은 하나로. */
export function parseCareers(text: string, ours: RegExp): Career[] {
  const out: Career[] = [];
  for (const line of text.split(/\r?\n/)) {
    const ds = [...line.matchAll(D)];
    if (!ds.length || /지역가입자|피부양자|임의계속/.test(line)) continue;
    const head = line.slice(0, ds[0].index).replace(/^\s*\d{1,3}\s+/, "").replace(/직장가입자|가입자구분|근로자|일용|상용/g, "").replace(/\s{2,}/g, " ").trim();
    if (!head || head.length < 2 || SKIP.test(head) || /^[\d\s.\-()]+$/.test(head)) continue;
    const from = iso(ds[0]), to = ds[1] ? iso(ds[1]) : "";
    if (to && to < from) continue;
    if (ours.test(head) || out.some((c) => c.company === head && c.from === from)) continue; // 당사 근무는 명부로 따로 센다
    out.push({ company: head.slice(0, 60), from, to, related: false }); // 관련 경력인지는 사람이 고른다
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}
