/** 지원사업 자료 요청 한 건의 첨부를 ZIP 하나로 (회신 메일에 붙이기용). 관리자만. 파일 이름: '01_자료 이름_원래 파일명' */
import type { NextRequest } from "next/server";
import JSZip from "jszip";
import { currentUser } from "@/lib/auth";
import * as store from "@/lib/대장/store";
import { readReqs, reqRef } from "@/lib/총무/grants";
import { loadFileData, loadFiles } from "@/lib/총무/mail";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);

export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || u.role !== "관리자") return new Response("볼 수 없습니다.", { status: 403 });
  const id = Number(req.nextUrl.searchParams.get("id")), rid = String(req.nextUrl.searchParams.get("rq") ?? "");
  const row = id ? await store.loadRow(id) : null;
  const rq = row?.book === "grants" ? readReqs(row.data).find((x) => x.id === rid) : undefined;
  if (!row || !rq) return new Response("없는 자료 요청입니다.", { status: 404 });
  const files = await loadFiles(`${store.rowRef(id)}/rq-${rid}/`);
  const zip = new JSZip();
  let n = 0;
  for (const [i, it] of rq.items.entries()) {
    for (const f of files.get(reqRef(id, rid, it.name)) ?? []) {
      const data = await loadFileData(f.id);
      if (!data) continue;
      zip.file(`${String(i + 1).padStart(2, "0")}_${safe(it.name)}_${safe(f.fileName)}`, data.data);
      n++;
    }
  }
  if (!n) return new Response("첨부한 자료가 없습니다.", { status: 404 });
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const name = `${safe(rq.title)}_${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="files.zip"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
