/** ISO 27001 실적문서를 한글 파일(.hwpx)로 내려받기 (관리자만): 양식 파일에 적은 글만 바꿔 넣는다 */
import { currentUser } from "@/lib/auth";
import * as iso from "@/lib/인증/iso27k";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("로그인이 필요합니다.", { status: 401 });
  if (u.role !== "관리자") return new Response("관리자만 내려받을 수 있습니다.", { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("잘못된 주소입니다.", { status: 400 });
  const doc = await iso.loadDoc(id);
  const form = doc && iso.formOf(doc.form);
  if (!doc || !form) return new Response("문서가 없습니다.", { status: 404 });
  if (!(await iso.templateReady())) return new Response("양식 파일(데이터/iso27001/template.hwpx)이 없습니다.", { status: 500 });
  const bytes = await iso.exportHwpx(form, doc.data, doc.title || form.title);
  const name = `${form.key.replace(/b$/, "")} ${doc.title || form.title} (${doc.day}).hwpx`.replace(/[\\/:*?"<>|]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename="iso.hwpx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
