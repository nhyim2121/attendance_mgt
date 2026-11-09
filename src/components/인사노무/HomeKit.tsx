/** 홈 대시보드 공용 조각: 선 아이콘, 아이콘이 붙은 요약 숫자 (근태 홈·휴가 홈). */
const ICONS = {
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 13.6c2.8.2 5 2.2 5 5" /></>,
  in: <><path d="M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8" /><path d="M3 12h11" /><path d="m10 8 4 4-4 4" /></>,
  beach: <><path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z" /><path d="M12 12v9" /><path d="M8 21h8" /></>,
  plane: <><path d="M3 14l18-7-6 14-3-6-9-1Z" /></>,
  swap: <><path d="M4 8h13l-3-3" /><path d="M20 16H7l3 3" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></>,
  bars: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  flow: <><path d="M4 6h16M6 12h12M9 18h6" /></>,
  org: <><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="2" y="16" width="6" height="5" rx="1" /><rect x="16" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M5 16v-4h14v4" /></>,
  chart: <><path d="M3 20h18" /><path d="m4 16 5-6 4 3 7-8" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  clip: <><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></>,
  pie: <><path d="M12 3v9h9a9 9 0 1 1-9-9Z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15Z" /></>,
  week: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2" /></>,
};
export type IconName = keyof typeof ICONS;
export function Ico({ name }: { name: IconName }) {
  return (
    <span className="ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg></span>
  );
}
export function Stat({ icon, label, value, unit, sub }: { icon: IconName; label: string; value: React.ReactNode; unit?: string; sub?: string }) {
  return (
    <div className="hstat">
      <Ico name={icon} />
      <div><div className="hstat-l">{label}</div><div className="hstat-v">{value}<small>{unit}</small></div>
        {sub && <div className="hstat-s">{sub}</div>}</div>
    </div>
  );
}
