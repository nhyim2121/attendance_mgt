/** 화면 머리 배너 (통합 디자인): 영역 색 그라데이션 · 홈 › 영역 › 묶음 · 큰 제목(+형광펜) · 설명 · 표지 이모지 · 오른쪽 버튼.
 *  href로 메뉴(src/lib/대시/menu.ts)에서 영역·묶음·이름·설명·이모지를 찾아 채우므로, 화면에서는 보통 href만 주면 된다.
 *  기타·입찰 화면처럼 직접 배너를 그리는 화면은 쓰지 않는다. */
import Link from "next/link";
import { areaOfPath, emojiOf, MENU, type MenuArea, type MenuItem } from "@/lib/대시/menu";

function find(href: string): { area?: MenuArea; group?: string; item?: MenuItem } {
  const path = href.split(/[?#]/)[0];
  for (const a of MENU) for (const g of a.groups) for (const it of g.items) {
    if (it.href === href || it.href.split(/[?#]/)[0] === path) return { area: a, group: g.label, item: it };
  }
  for (const a of MENU) for (const g of a.groups) for (const it of g.items) {
    if (it.also?.includes(path)) return { area: a, group: g.label };
  }
  return { area: MENU.find((a) => a.key === areaOfPath(path)) };
}

export default function PageHead({ href, title, mark, desc, emoji, children, className = "" }: {
  href: string;                 // 메뉴에 있는 이 화면 주소 (예: "/daily")
  title?: React.ReactNode;      // 없으면 메뉴 이름
  mark?: React.ReactNode;       // 제목 뒤 형광펜 (예: 날짜·연도)
  desc?: React.ReactNode;       // 없으면 메뉴 설명
  emoji?: string;               // 없으면 메뉴 이모지
  children?: React.ReactNode;   // 오른쪽 아래 버튼·고르기
  className?: string;
}) {
  const { area, group, item } = find(href);
  const color = area?.color ?? "#0c3994";
  const icon = emoji ?? (item ? emojiOf(item.href) : area ? emojiOf(area.key) : "📄");
  const text = desc ?? item?.desc;
  return (
    <header className={`u-hello ar u-ph ${className}`} style={{ ["--c" as string]: color }}>
      <span className="u-date noprint">
        <Link href="/">홈</Link>
        {area && <> › <Link href={area.dash}>{area.label}</Link></>}
        {group && <> › {group}</>}
      </span>
      <h1>{title ?? item?.label ?? ""}{mark != null && mark !== "" && <> <mark>{mark}</mark></>}</h1>
      {text && <p>{text}</p>}
      {children && <div className="u-ph-act noprint">{children}</div>}
      <span className="u-cover noprint" aria-hidden>{icon}</span>
    </header>
  );
}
