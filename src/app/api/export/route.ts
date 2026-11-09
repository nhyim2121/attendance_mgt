/** 직원별 시트 엑셀·ZIP 내려받기. 주소의 필터(월·부서·직원)는 화면과 같다. */
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { buildWorkbook, buildZip } from "@/lib/인사노무/splitter";
import { sheetData, summaryRows } from "../../(app)/(hr)/sheets/compute";

export async function GET(req: NextRequest) {
  if (!(await currentUser())) return new Response("로그인이 필요합니다.", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const d = await sheetData(sp);
  if (d.empty) return new Response("선택한 조건에 맞는 기록이 없습니다.", { status: 404 });

  let body: Buffer, name: string, type: string;
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (sp.kind === "one") {
    // 근태 기입 화면: 직원 한 명의 그 달 시트 하나
    const emp = String(sp.emp ?? "");
    if (!d.emps.includes(emp)) return new Response("그 직원의 기록이 없습니다.", { status: 404 });
    body = await buildWorkbook({
      records: d.f!.records.filter((r) => r.emp === emp), days: d.days, employees: [emp], rule: d.rule, label: d.label, includeRaw: false,
    });
    [name, type] = [`${d.label} ${emp} 근태.xlsx`, XLSX];
  } else if (sp.kind === "zip") {
    body = await buildZip(d.f!.records, d.days, d.emps, d.rule, d.label);
    [name, type] = [`${d.label} 직원별 근태.zip`, "application/zip"];
  } else {
    body = await buildWorkbook({
      records: d.f!.records, days: d.days, employees: d.emps, rule: d.rule, summary: summaryRows(d.summary), label: d.label,
    });
    [name, type] = [`${d.label} 근태현황.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
  }
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="export"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
