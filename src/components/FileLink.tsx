/** 근태 증빙 파일 링크 (새 탭에서 열기) */
import type { Attachment } from "@/lib/store";
import { shortKst } from "@/lib/time";

const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export default function FileLink({ a }: { a: Attachment }) {
  return (
    <a className="file" href={`/api/attachment/${a.id}`} target="_blank" rel="noreferrer" title={`${a.title} · ${a.uploadedBy} ${shortKst(a.createdAt)}`}>
      📎 {a.fileName} <small>{kb(a.size)}</small>
    </a>
  );
}
