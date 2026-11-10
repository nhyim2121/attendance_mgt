/** 관련 사이트 바로가기 (새 창). big = 대시보드용 큰 버튼, 아니면 대장 화면 위쪽 한 줄. */
import type { Site } from "@/lib/인사노무/sites";

export default function SiteLinks({ sites, big = false }: { sites: Site[]; big?: boolean }) {
  if (!sites.length) return null;
  if (big) {
    return (
      <div className="u-sites">
        {sites.map((s) => <a key={s.name} href={s.url} target="_blank" rel="noreferrer"><b>{s.name} ↗</b><small>{s.sub}</small></a>)}
      </div>
    );
  }
  return (
    <div className="u-sitebar noprint">
      <b>🔗 관련 사이트</b>
      {sites.map((s) => <a key={s.name} href={s.url} target="_blank" rel="noreferrer" title={s.sub}>{s.name} ↗</a>)}
    </div>
  );
}
