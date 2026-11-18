"use client";
/** 왼쪽 사이드바 (2026-11-18): 대분류 = 대시보드 · 회사 정보 · 업무분장 · 업무 영역(인사노무~기타) · 시스템 설정.
 *  디자인 = B 두 칸 (2026-11-19 사용자 선택): 왼쪽 남색 줄에 대분류 아이콘, 누르면 오른쪽 칸에 그 메뉴.
 *  담당자(입찰 공유 계정)는 입찰관리·비밀번호 변경만 보인다. */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { areaOfPath, emojiOf, isOn, menuFor, type MenuItem } from "@/lib/대시/menu";

const KEEP = ["month", "from", "to", "dept", "all", "fy", "asof"]; // 인사노무 화면끼리 기간·부서 유지
interface Group { label: string; items: MenuItem[] }
interface Cat { key: string; label: string; short: string; emoji: string; color: string; href?: string; groups: Group[]; sec: "top" | "work" | "sys" }

function buildCats(admin: boolean, bid: boolean, areas: string[] | null): Cat[] {
  if (!admin) {
    const shown = menuFor(admin, areas);
    return [
      ...(bid ? [{ key: "bid", label: "입찰관리", short: "입찰", emoji: "⚖️", color: "#0e7490", href: "/bid", groups: [], sec: "work" as const }] : []),
      ...shown.map((a) => ({ key: a.key, label: a.label, short: a.label, emoji: emojiOf(a.key), color: a.color, sec: "work" as const,
        groups: [{ label: "", items: [{ href: a.dash, label: `${a.label} 대시보드` }] }, ...a.groups.filter((g) => g.label !== "업무분장")] })),
      { key: "sys", label: "비밀번호 변경", short: "비밀번호", emoji: "🔑", color: "#475569", href: "/users", groups: [], sec: "sys" },
    ];
  }
  const all = menuFor(admin, areas);
  const duties: Group[] = all.flatMap((a) => a.groups.filter((g) => g.label === "업무분장").map((g) => ({ label: a.label, items: g.items })));
  const work: Cat[] = all.map((a) => ({
    key: a.key, label: a.label, short: a.key === "ehs" ? "환경안전" : a.label, emoji: emojiOf(a.key), color: a.color, sec: "work",
    groups: [
      { label: "", items: [{ href: a.dash, label: `${a.label} 대시보드`, exact: true }] },
      ...a.groups.filter((g) => g.label !== "업무분장" && !(a.key === "hr" && g.label === "관리")),
    ],
  }));
  return [
    { key: "home", label: "통합 대시보드", short: "홈", emoji: "🏠", color: "#0c3994", href: "/", groups: [], sec: "top" },
    { key: "company", label: "회사 정보", short: "회사", emoji: "🏢", color: "#0c3994", href: "/company", groups: [], sec: "top" },
    { key: "duties", label: "업무분장", short: "업무분장", emoji: "🧩", color: "#7c3aed", groups: duties, sec: "top" },
    ...work,
    { key: "sys", label: "시스템 설정", short: "설정", emoji: "⚙️", color: "#475569", sec: "sys", groups: [{ label: "", items: [
      { href: "/users", label: "사용자·권한", desc: "계정, 영역별 읽기·등록·수정·삭제" },
      { href: "/settings", label: "근무 기준·공휴일" },
      { href: "/upload", label: "데이터 관리", desc: "캡스·하이웍스 파일 올리기, 내려받기" },
    ] }] },
  ];
}

/** 지금 주소가 속한 대분류 */
function catOf(cats: Cat[], path: string): string {
  for (const c of cats) {
    if (c.href && (c.href === "/" ? path === "/" : path === c.href || path.startsWith(`${c.href}/`))) return c.key;
    if (c.key === "duties" || c.key === "sys") if (c.groups.some((g) => g.items.some((it) => isOn(it, path)))) return c.key;
  }
  const a = areaOfPath(path);
  return cats.some((c) => c.key === a) ? a : "";
}

export default function Sidebar({ admin, bid, areas, who, logout }: {
  admin: boolean; bid: boolean; areas: string[] | null; who: React.ReactNode; logout: React.ReactNode;
}) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  KEEP.forEach((k) => sp.get(k) && keep.set(k, sp.get(k)!));
  const qs = keep.toString();
  const cats = buildCats(admin, bid, areas);
  const cur = catOf(cats, path);

  const [pick, setPick] = useState(cur);          // 오른쪽 칸에 펼쳐 볼 대분류 (누르기만 하면 화면은 그대로)
  useEffect(() => { setPick(cur); }, [cur]);
  const link = (it: MenuItem, area: string) => (area === "hr" && qs && !it.href.includes("#") ? `${it.href}?${qs}` : it.href);
  const Items = ({ c }: { c: Cat }) => (
    <div className="sb-items">
      {c.groups.map((g, i) => (
        <div key={`${g.label}${i}`} className="sb-grp">
          {g.label && <div className="sb-gl">{g.label}</div>}
          {g.items.map((it) => (
            <Link key={it.href} href={link(it, c.key)} title={it.desc} className={`sb-it${isOn(it, path) ? " on" : ""}`}>
              <span className="em">{emojiOf(it.href)}</span><span className="t">{it.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
  const Foot = () => (
    <div className="sb-foot">
      <div className="sb-who">{who}{logout}</div>
    </div>
  );
  const pc = cats.find((c) => c.key === pick) ?? cats.find((c) => c.groups.length) ?? cats[0];
  return (
      <nav className="sb sb-b" aria-label="메뉴">
        <div className="sb-rail">
          <Link href={admin ? "/" : "/bid"} className="sb-mark" title="처음 화면">SN</Link>
          {cats.map((c, i) => {
            const cls = `sb-ico${pc.key === c.key ? " pick" : ""}${cur === c.key ? " cur" : ""}`;
            const inner = <><span className="ch">{c.emoji}</span><span className="t">{c.short}</span></>;
            const gap = i > 0 && cats[i - 1].sec !== c.sec;
            return (
              <div key={c.key} className={gap ? "sb-gap" : undefined}>
                {c.href ? <Link href={c.href} className={cls} title={c.label}>{inner}</Link>
                  : <button type="button" className={cls} title={c.label} onClick={() => setPick(c.key)}>{inner}</button>}
              </div>
            );
          })}
        </div>
        <div className="sb-panel">
          <div className="sb-ptitle"><span>{pc.emoji}</span>{pc.label}</div>
          <div className="sb-scroll">
            {pc.groups.length ? <Items c={pc} /> : <Link href={pc.href ?? "/"} className="sb-it on"><span className="t">{pc.label} 열기</span></Link>}
          </div>
          <Foot />
        </div>
      </nav>
  );
}
