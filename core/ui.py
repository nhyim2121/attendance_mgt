"""대시보드 화면 스타일과 HTML 조각 (근태 SaaS 대시보드 형태)."""
from __future__ import annotations

from html import escape

import pandas as pd
import streamlit as st

NAVY = "#1f3a68"
BLUE, RED, ORANGE, GREEN, GRAY = "#2563c9", "#d42a2a", "#e07b00", "#1f8a3b", "#9aa3af"

APP_NAME = "근태관리통합시스템"
FONT = "'Paperlogy', 'Malgun Gothic', sans-serif"

_CSS = f"""
<style>
@font-face {{ font-family: 'Paperlogy'; font-weight: 400; src: url('/app/static/fonts/Paperlogy-400.ttf') format('truetype'); font-display: swap; }}
@font-face {{ font-family: 'Paperlogy'; font-weight: 500; src: url('/app/static/fonts/Paperlogy-500.ttf') format('truetype'); font-display: swap; }}
@font-face {{ font-family: 'Paperlogy'; font-weight: 600; src: url('/app/static/fonts/Paperlogy-600.ttf') format('truetype'); font-display: swap; }}
@font-face {{ font-family: 'Paperlogy'; font-weight: 700; src: url('/app/static/fonts/Paperlogy-700.ttf') format('truetype'); font-display: swap; }}
@font-face {{ font-family: 'Paperlogy'; font-weight: 800; src: url('/app/static/fonts/Paperlogy-800.ttf') format('truetype'); font-display: swap; }}
html, body, .stApp, .stApp button, .stApp input, .stApp textarea, .stApp select,
.stMarkdown, .stMarkdown p, .stCaption, table, th, td {{ font-family: {FONT}; }}
.stApp {{ background: #f3f5f9; }}
.block-container {{ padding-top: 1.6rem; max-width: 1400px; }}
h1 {{ font-weight: 800 !important; letter-spacing: -0.02em; color: #1f2937; }}

/* 왼쪽 메뉴 */
[data-testid="stSidebar"] {{ background: {NAVY}; }}
[data-testid="stSidebarNav"]::before {{
  content: "{APP_NAME}"; display: block; font-family: {FONT}; font-weight: 800; font-size: 1.22rem;
  color: #ffffff; letter-spacing: -0.02em; padding: 2px 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,.12); margin-bottom: 10px;
}}
[data-testid="stSidebar"] * {{ color: #e6ecf5; }}
[data-testid="stSidebarNavLink"] {{ border-radius: 4px; padding: 6px 10px; }}
[data-testid="stSidebarNavLink"]:hover {{ background: rgba(255,255,255,.08); }}
[data-testid="stSidebarNavLink"][aria-current="page"] {{ background: {BLUE}; }}
[data-testid="stSidebarNavLink"] span {{ color: #f4f7fb !important; font-weight: 500; }}
[data-testid="stSidebarNavSeparator"] {{ border-color: rgba(255,255,255,.15); }}
[data-testid="stSidebar"] input, [data-testid="stSidebar"] textarea,
[data-testid="stSidebar"] [data-baseweb="select"] *, [data-testid="stSidebar"] [data-baseweb="input"] *,
[data-testid="stSidebar"] [data-baseweb="tag"] * {{ color: #1f2937 !important; }}
[data-testid="stSidebar"] [data-testid="stExpander"] details {{ border-color: rgba(255,255,255,.2); }}
[data-testid="stSidebar"] button[kind="secondary"] {{ background: rgba(255,255,255,.10);
  border: 1px solid rgba(255,255,255,.35); }}
[data-testid="stSidebar"] button[kind="secondary"]:hover {{ background: rgba(255,255,255,.2); }}
[data-testid="stSidebar"] button[kind="secondary"] * {{ color: #f4f7fb !important; }}

/* 카드 */
[class*="st-key-card"] {{
  background: #fff; border-radius: 6px; padding: 18px 18px 12px;
  box-shadow: 0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04);
}}
.card-title {{ font-size: 1.05rem; font-weight: 700; color: #1f2937; margin: 0 0 10px; }}
.topbar {{ display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px; }}
.topbar h2 {{ margin:0; font-size:1.5rem; color:#1f2937; }}
.topbar .meta {{ color:#374151; font-size:1rem; }}
.topbar .meta b {{ font-size:1.15rem; }}

/* KPI */
.kpi-grid {{ display:grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
.kpi {{ background:#fff; border-top: 4px solid var(--c); border-radius: 2px; text-align:center;
        padding: 20px 8px 14px; box-shadow: 0 1px 3px rgba(15,23,42,.10); }}
.kpi-label {{ color: var(--c); font-weight: 700; font-size: .95rem; }}
.kpi-num {{ color: var(--c); font-weight: 800; font-size: 2.6rem; line-height: 1.25; }}
.kpi-sub {{ color: #6b7280; font-size: .78rem; }}

/* 목록·표 */
.list-table, .report {{ width:100%; border-collapse: collapse; font-size: .88rem; color:#1f2937;
                        border: none !important; margin: 0; }}
.list-table tr, .report tr {{ background: transparent !important; border: none !important; }}
.list-table td, .report td, .report th {{ border: none !important; border-bottom: 1px solid #eef0f4 !important; }}
.report th {{ border-bottom: 2px solid #e5e7eb !important; }}
.list-table td {{ padding: 7px 4px; white-space: nowrap; }}
.list-table td.st {{ color: {RED}; text-align:right; font-weight:600; white-space:nowrap; }}
.list-table td.dt {{ color:#374151; white-space:nowrap; }}
.report th {{ text-align:left; font-weight:600; color:#374151; padding: 8px 6px; border-bottom: 2px solid #e5e7eb; }}
.report th.sort {{ color: {BLUE}; }}
.report td {{ padding: 7px 6px; border-bottom: 1px solid #eef0f4; white-space: nowrap; }}
.report td.warn {{ color: {RED}; }}
.tri {{ color: {RED}; margin-right: 4px; }}
.attn td {{ padding: 8px 4px; white-space: normal; }}
.attn td:last-child {{ white-space: nowrap; width: 1%; }}
.badge {{ display:inline-block; min-width: 26px; text-align:center; border-radius: 4px; padding: 2px 6px;
          font-size: .82rem; background: #e8ebf0; color:#6b7280; }}
.badge.on {{ background: {BLUE}; color: #fff; }}
.chev {{ color:#374151; padding-left: 10px; }}
.bar {{ height: 6px; background:#e5e7eb; border-radius: 3px; width: 100%; min-width: 80px; }}
.bar > div {{ height: 6px; border-radius: 3px; background: {GREEN}; }}
.bar.alt > div {{ background: #5b8def; }}
.num {{ color:#4b5563; font-size:.82rem; white-space:nowrap; padding-left: 8px; }}
.muted {{ color:#9ca3af; }}

/* 일일 현황 */
.kpi-row {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 14px; }}
.kpi-row .kpi-num {{ font-size: 2.3rem; }}
.board {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }}
.board-col {{ background:#fff; border-radius:6px; border-top:4px solid var(--c); padding:12px 12px 8px;
              box-shadow: 0 1px 3px rgba(15,23,42,.08); }}
.board-col h4 {{ margin:0 0 8px; font-size:1rem; font-weight:800; color: var(--c); }}
.board-col h4 span {{ color:#6b7280; font-weight:600; font-size:.85rem; margin-left:4px; }}
.chip {{ display:flex; justify-content:space-between; gap:8px; padding:6px 8px; margin-bottom:6px;
         background:#f6f8fb; border-radius:4px; font-size:.86rem; color:#1f2937; }}
.chip small {{ color:#6b7280; white-space:nowrap; }}
</style>
"""


def inject_css() -> None:
    st.markdown(_CSS, unsafe_allow_html=True)


def topbar(title: str, meta_html: str) -> None:
    st.markdown(f'<div class="topbar"><h2>{escape(title)}</h2><div class="meta">{meta_html}</div></div>',
                unsafe_allow_html=True)


def kpi_cards(items: list[tuple[str, int, str, str]]) -> str:
    """[(라벨, 숫자, 색, 보조문구)] -> 2x2 카드 HTML"""
    cells = "".join(
        f'<div class="kpi" style="--c:{c}"><div class="kpi-label">{escape(label)}</div>'
        f'<div class="kpi-num">{n:,}</div><div class="kpi-sub">{escape(sub)}</div></div>'
        for label, n, c, sub in items)
    return f'<div class="kpi-grid">{cells}</div>'


def missing_list(rows: pd.DataFrame, limit: int = 6) -> str:
    """출퇴근 누락: 직원 | 날짜(요일) | 상태"""
    if rows.empty:
        return '<p class="muted">누락된 출퇴근 기록이 없습니다.</p>'
    body = "".join(
        f'<tr><td>{escape(r["직원"])}</td><td class="dt">{r["일자"].month}월 {r["일자"].day}일 ({r["요일"]})</td>'
        f'<td class="st">{escape(r["표시"])}</td></tr>'
        for _, r in rows.head(limit).iterrows())
    return f'<table class="list-table">{body}</table>'


def attention_list(items: list[tuple[str, int]]) -> str:
    body = "".join(
        f'<tr><td>{escape(label)}</td><td style="text-align:right">'
        f'<span class="badge {"on" if n else ""}">{n}</span><span class="chev">›</span></td></tr>'
        for label, n in items)
    return f'<table class="list-table attn">{body}</table>'


def hm(hours: float) -> str:
    """시간(h) -> '129h 13m'"""
    if hours is None or pd.isna(hours):
        return "-"
    total = int(round(hours * 60))
    h, m = divmod(total, 60)
    return f"{h}h {m}m" if m else f"{h}h"


def report_table(df: pd.DataFrame, sort_col: str, limit: int = 10) -> str:
    """직원 | 소정근로 | 실제근로 | 연장근로 | 휴일근로 (주의 직원은 ▲)"""
    cols = [("소정근로(h)", "소정근로시간"), ("실제근로(h)", "실제 근로시간"),
            ("연장근로(h)", "연장근로시간"), ("휴일근로(h)", "휴일근로시간")]
    head = "<th>직원</th>" + "".join(
        f'<th class="{"sort" if c == sort_col else ""}">{label}{" ↓" if c == sort_col else ""}</th>'
        for c, label in cols)
    body = ""
    for _, r in df.head(limit).iterrows():
        tri = f'<span class="tri" title="{escape(r["주의사유"])}">▲</span>' if r["주의사유"] else ""
        tds = "".join(
            f'<td class="{"warn" if c in ("연장근로(h)", "휴일근로(h)") and r[c] > 0 else ""}">{hm(r[c])}</td>'
            for c, _ in cols)
        body += f"<tr><td>{tri}{escape(r['직원'])}</td>{tds}</tr>"
    return f'<table class="report"><tr>{head}</tr>{body}</table>'


def leave_bars(df: pd.DataFrame, allot: float, limit: int = 12) -> str:
    """직원 | 연차 막대 + 사용/기준 | 공가 막대 + 일수"""
    max_special = max(1.0, float(df["공가"].max()) if len(df) else 1.0)
    head = "<tr><th>직원</th><th>연차</th><th></th><th>공가·특별휴가</th><th></th></tr>"
    body = ""
    for _, r in df.head(limit).iterrows():
        p1 = min(100.0, r["연차사용"] / allot * 100) if allot else 0
        p2 = min(100.0, r["공가"] / max_special * 100)
        body += (f'<tr><td>{escape(r["이름"])}</td>'
                 f'<td style="width:38%"><div class="bar"><div style="width:{p1:.0f}%"></div></div></td>'
                 f'<td class="num">{r["연차사용"]:g} / {allot:g}</td>'
                 f'<td style="width:28%"><div class="bar alt"><div style="width:{p2:.0f}%"></div></div></td>'
                 f'<td class="num">{r["공가"]:g}일</td></tr>')
    return f'<table class="report">{head}{body}</table>'


def kpi_row(items: list[tuple[str, int, str, str]]) -> str:
    """한 줄 카드: [(라벨, 숫자, 색, 보조문구)]"""
    cells = "".join(
        f'<div class="kpi" style="--c:{c}"><div class="kpi-label">{escape(label)}</div>'
        f'<div class="kpi-num">{n:,}</div><div class="kpi-sub">{escape(sub)}</div></div>'
        for label, n, c, sub in items)
    return f'<div class="kpi-row">{cells}</div>'


def board_html(groups: list[tuple[str, str, list[tuple[str, str]]]]) -> str:
    """상태별 이름 칩: [(제목, 색, [(이름, 보조)])]"""
    cols = ""
    for title, color, people in groups:
        chips = "".join(f'<div class="chip"><span>{escape(n)}</span><small>{escape(sub)}</small></div>'
                        for n, sub in people) or '<div class="chip"><small>없음</small></div>'
        cols += (f'<div class="board-col" style="--c:{color}"><h4>{escape(title)}<span>{len(people)}명</span></h4>'
                 f'{chips}</div>')
    return f'<div class="board">{cols}</div>'
