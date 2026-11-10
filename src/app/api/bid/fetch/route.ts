/** 입찰 공고 자동 불러오기 (사이트 감시기 자동실행/run-server.mjs가 2시간마다 부른다).
 *  로그인 대신 머리글 x-cron-key = .env.local BID_CRON_KEY 로 확인하고, service role로 저장한다. */
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { loadWatch, saveFetchLog } from "@/lib/총무/bidStore";
import { fetchG2b, hasG2bKey } from "@/lib/총무/g2b";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: NextRequest) {
  const want = process.env.BID_CRON_KEY ?? "";
  if (!want || !same(req.headers.get("x-cron-key") ?? "", want)) return new Response("권한이 없습니다.", { status: 403 });
  if (!hasG2bKey()) return Response.json({ ok: false, message: "공공데이터포털 인증키가 없어 건너뜁니다." });
  const sb = createAdminClient();
  const at = new Date().toISOString();
  try {
    const r = await fetchG2b(await loadWatch(sb), sb, 2);
    const message = `새 공고 ${r.added}건 · 확인 ${r.seen}건 · 일정 갱신 ${r.updated}건`;
    await saveFetchLog({ at, ok: true, message, added: r.added, seen: r.seen, by: "자동" }, sb);
    return Response.json({ ok: true, message });
  } catch (e) {
    const message = (e as Error).message;
    await saveFetchLog({ at, ok: false, message, added: 0, seen: 0, by: "자동" }, sb);
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
