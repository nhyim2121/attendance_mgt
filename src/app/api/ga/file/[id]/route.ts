/** 총무 첨부 파일 보기·내려받기 (관리자만). PDF·이미지는 브라우저에서 바로 연다. */
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { loadFileData } from "@/lib/총무/mail";

const INLINE = /^(application\/pdf|image\/(png|jpeg|gif|webp|bmp))$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("로그인이 필요합니다.", { status: 401 });
  if (u.role !== "관리자") return new Response("볼 수 없는 파일입니다.", { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("잘못된 주소입니다.", { status: 400 });
  const a = await loadFileData(id);
  if (!a) return new Response("파일이 없습니다.", { status: 404 });
  const inline = INLINE.test(a.mime) && req.nextUrl.searchParams.get("download") === null;
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": INLINE.test(a.mime) ? a.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="file"; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
