/** 직무기술서 엑셀 내려받기: ?id=<직무 id> 한 장, 없으면 전체. 관리자만. */
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { buildJobsXlsx, loadJobs, loadUnits } from "@/lib/인사노무/jobdescData";
import { todayKst } from "@/lib/time";

export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || u.role !== "관리자") return new Response("볼 수 없습니다.", { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  const [{ jobs }, { units }] = await Promise.all([loadJobs(), loadUnits()]);
  const pick = id ? jobs.filter((j) => j.id === id) : jobs;
  if (!pick.length) return new Response("없는 직무기술서입니다.", { status: 404 });
  const body = await buildJobsXlsx(pick, units);
  const name = `직무기술서_${pick.length === 1 ? pick[0].name.replace(/[\\/:*?"<>|]/g, "_") : "전체"}_${todayKst()}.xlsx`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="jobdesc.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
