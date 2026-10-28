"""일일 근태현황 보고서: 사이트에서 등록·수정·삭제하는 하루치 보고서와 그 변환·표 그리기.

섹션
- 근태     : 부서 | 직급 | 성명 | 유형(연차·반차·반반차·외출·공가·출장·교육, 여러 개) | 제목(목적지/사유) | 상세(시간 등) | 비고
- 도제     : 일학습병행(도제) 관련 — 성명 | 값(출근 완료) | 비고(비고란)
- 휴가일정 : 성명 | 값(출근예정) | 비고(휴가 일정)
- 휴일근무 : 성명 | 유형(근무한 휴일 날짜들, 'YYYY-MM-DD,YYYY-MM-DD') | 제목(작업내용/근무지) | 비고
"""
from __future__ import annotations

from datetime import date, timedelta
from html import escape

import pandas as pd

from .config import WEEKDAYS_KR
from .hiworks import LEAVE_COLUMNS

SECTIONS = ["근태", "도제", "휴가일정", "휴일근무"]
LEAVE_TYPES = ["연차", "반차", "반반차", "외출", "공가", "출장", "교육", "휴일근무", "연장근무"]
FONT = "'Paperlogy','Malgun Gothic','맑은 고딕',sans-serif"


def day_label(d: date, year: bool = False) -> str:
    s = f"{d.month}/{d.day}({WEEKDAYS_KR[d.weekday()]})"
    return f"{d.year}년 {d.month}월 {d.day}일({WEEKDAYS_KR[d.weekday()]})" if year else s


def split_types(v) -> list[str]:
    if isinstance(v, (list, tuple)):
        return [str(x).strip() for x in v if str(x).strip()]
    return [t.strip() for t in str(v or "").split(",") if t.strip()]


# ---------------------------------------------------------------- 근태 판정용 변환
def report_to_leaves(rows: pd.DataFrame) -> pd.DataFrame:
    """보고서 행 -> 하이웍스 근태와 같은 형식 (근태 판정·직원별 시트에 쓰임)."""
    out = []
    for r in rows.to_dict("records"):
        content = "\n".join(x for x in (r.get("제목", ""), r.get("상세", "")) if x)
        if r["섹션"] == "근태":
            for t in split_types(r["유형"]):
                out.append({"일자": r["일자"], "이름": r["성명"], "부서": r["부서"], "직급": r["직급"], "유형": t,
                            "내용": content, "비고": r.get("비고", ""), "시트": "사이트"})
        elif r["섹션"] == "휴일근무":
            for t in split_types(r["유형"]):
                try:
                    d = date.fromisoformat(t)
                except ValueError:
                    continue
                out.append({"일자": d, "이름": r["성명"], "부서": r["부서"], "직급": r["직급"], "유형": "휴일근무",
                            "내용": content, "비고": r.get("비고", ""), "시트": "사이트"})
    return pd.DataFrame(out, columns=LEAVE_COLUMNS)


def merge_leaves(file_leaves: pd.DataFrame | None, rows: pd.DataFrame, report_days: list[date]) -> pd.DataFrame | None:
    """근태현황 파일 + 사이트 보고서. 사이트에 보고서가 있는 날은 사이트 내용이 우선한다."""
    site = report_to_leaves(rows) if rows is not None and not rows.empty else pd.DataFrame(columns=LEAVE_COLUMNS)
    if file_leaves is None or file_leaves.empty:
        return site if not site.empty else file_leaves
    days = set(report_days)
    hol_keys = set(zip(site.loc[site["유형"] == "휴일근무", "일자"], site.loc[site["유형"] == "휴일근무", "이름"]))
    keep = file_leaves[~(file_leaves["일자"].isin(days) & (file_leaves["유형"] != "휴일근무"))]
    keep = keep[~((keep["유형"] == "휴일근무") & pd.Series(list(zip(keep["일자"], keep["이름"])), index=keep.index)
                  .isin(hol_keys))]
    out = pd.concat([keep, site], ignore_index=True)
    return out.drop_duplicates(subset=["일자", "이름", "유형"], keep="last").sort_values(["일자", "이름"]).reset_index(drop=True)


# ---------------------------------------------------------------- 보고서 미리 채우기
def prefill_from_leaves(leaves: pd.DataFrame | None, day: date) -> pd.DataFrame:
    """근태현황 파일에 이미 적힌 그날 근태를 보고서 '근태' 섹션 행으로."""
    cols = ["섹션", "부서", "직급", "성명", "유형", "제목", "상세", "값", "비고"]
    if leaves is None or leaves.empty:
        return pd.DataFrame(columns=cols)
    lv = leaves[leaves["일자"] == day]
    rows = []
    for name, g in lv.groupby("이름", sort=False):
        types = [t for t in dict.fromkeys(g["유형"]) if t in LEAVE_TYPES or t == "외근"]
        if not types:
            continue
        lines = str(g["내용"].iloc[0]).split("\n")
        rows.append({"섹션": "근태", "부서": g["부서"].iloc[0], "직급": g["직급"].iloc[0], "성명": name,
                     "유형": ",".join(types), "제목": lines[0], "상세": " ".join(lines[1:]), "값": "",
                     "비고": g["비고"].iloc[0]})
    return pd.DataFrame(rows, columns=cols)


def rank_map(leaves: pd.DataFrame | None, rows: pd.DataFrame | None) -> dict[str, str]:
    """이름 -> 최근 직급 (근태현황 파일·보고서에서)."""
    out: dict[str, str] = {}
    for df, col in ((leaves, "이름"), (rows, "성명")):
        if df is None or df.empty:
            continue
        d = df[df["직급"].astype(str).str.strip() != ""].sort_values("일자")
        out.update(dict(zip(d[col], d["직급"])))
    return out


def weekend_before(day: date) -> list[date]:
    """보고일 직전 주말(토·일)."""
    d = day - timedelta(days=1)
    while d.weekday() < 5:
        d -= timedelta(days=1)
    sun = d if d.weekday() == 6 else d + timedelta(days=1)
    return [sun - timedelta(days=1), sun]


# ---------------------------------------------------------------- 보고서 그리기 (대시보드 스타일, 메일에도 쓰도록 인라인 스타일)
# 메일 프로그램은 CSS grid·외부 스타일을 무시하는 경우가 많아 표(table)와 인라인 스타일만 쓴다.
_INK, _SUB, _LINE, _BG = "#1f2937", "#6b7280", "#eef0f4", "#f3f5f9"
_TXT = f"font-family:{FONT};color:{_INK};"
_CELL = f"{_TXT}font-size:14px;padding:10px 12px;border-bottom:1px solid {_LINE};text-align:left;vertical-align:top;"
_HEAD = (f"{_TXT}font-size:13px;font-weight:700;color:#374151;background:{_BG};padding:9px 12px;text-align:left;"
         f"border-bottom:1px solid #e5e7eb;white-space:nowrap;")
_CARD = "background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;"

# 근태 종류별 배지 색 (글자색, 배경색)
BADGE = {
    "연차": ("#1f8a3b", "#e3f4e8"), "반차": ("#0f766e", "#dcf3f0"), "반반차": ("#0f766e", "#dcf3f0"),
    "외출": ("#c2410c", "#fdebdc"), "공가": ("#2563c9", "#e3ecfb"), "출장": ("#6d28d9", "#ede5fb"),
    "교육": ("#4338ca", "#e6e7fb"), "외근": ("#6d28d9", "#ede5fb"), "휴일근무": ("#b45309", "#fdf0d5"), "연장근무": ("#be123c", "#fde4ea"),
}
SECTION_TITLES = {"근태": "근태 현황", "도제": "일학습병행(도제)", "휴가일정": "휴가 일정", "휴일근무": "휴일 근무"}
# 요약 카드: (라벨, 색, 포함 유형)
SUMMARY_CARDS = [
    ("휴가", "#1f8a3b", {"연차", "반차", "반반차", "공가"}),
    ("외출", "#e07b00", {"외출"}),
    ("출장·교육", "#6d28d9", {"출장", "교육", "외근"}),
    ("휴일·연장", "#b45309", {"휴일근무", "연장근무"}),
]


def badge(t: str) -> str:
    fg, bg = BADGE.get(t, ("#374151", "#eef0f4"))
    return (f'<span style="display:inline-block;{_TXT}font-size:12px;font-weight:700;color:{fg};background:{bg};'
            f'border-radius:10px;padding:2px 9px;margin:0 4px 2px 0;white-space:nowrap">{escape(t)}</span>')


def _two_line(title: str, detail: str) -> str:
    t = f'<div style="{_TXT}font-weight:700">{escape(title)}</div>' if title else ""
    d = f'<div style="{_TXT}font-size:13px;color:{_SUB};margin-top:2px">{escape(detail)}</div>' if detail else ""
    return t + d or f'<span style="color:{_SUB}">-</span>'


def _person(r) -> str:
    rank = f' <span style="{_TXT}font-size:12px;color:{_SUB}">{escape(r["직급"])}</span>' if r["직급"] else ""
    return f'<span style="{_TXT}font-weight:700">{escape(r["성명"])}</span>{rank}'


def _table(heads: list[tuple[str, str]], body_rows: list[list[str]]) -> str:
    """heads: [(제목, 너비)]"""
    head = "".join(f'<th style="{_HEAD}{f"width:{w};" if w else ""}">{h}</th>' for h, w in heads)
    body = "".join("<tr>" + "".join(f'<td style="{_CELL}">{c}</td>' for c in cells) + "</tr>" for cells in body_rows)
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" '
            f'style="border-collapse:collapse;width:100%">'f"<tr>{head}</tr>{body}</table>")


def _section(title: str, count: int, inner: str) -> str:
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;{_CARD}margin-top:14px">'
            f'<tr><td style="padding:16px 18px 6px">'
            f'<span style="{_TXT}font-size:16px;font-weight:800">{title}</span>'
            f'<span style="{_TXT}font-size:13px;color:{_SUB};margin-left:6px">{count}명</span></td></tr>'
            f'<tr><td style="padding:4px 18px 16px">{inner}</td></tr></table>')


def report_counts(rows: pd.DataFrame) -> dict[str, int]:
    """요약 카드 숫자 (사람 수). 휴일·연장은 근태 목록 + 휴일근무 표."""
    att = rows[rows["섹션"] == "근태"]
    out = {}
    for label, _, types in SUMMARY_CARDS:
        names = {r["성명"] for _, r in att.iterrows() if any(t in types for t in split_types(r["유형"]))}
        if label == "휴일·연장":
            names |= set(rows.loc[rows["섹션"] == "휴일근무", "성명"])
        out[label] = len(names)
    return out


def render_report_html(day: date, rows: pd.DataFrame, title: bool = True) -> str:
    """일일 근태현황 보고서 HTML (사이트 미리보기·이미지 저장·메일 본문 공용)."""
    rows = rows.copy() if rows is not None else pd.DataFrame(columns=["섹션"])
    for c in ["섹션", "부서", "직급", "성명", "유형", "제목", "상세", "값", "비고"]:
        if c not in rows:
            rows[c] = ""
    rows = rows.fillna("").astype({"부서": str, "직급": str, "성명": str})
    parts = [f'<div style="background:{_BG};padding:18px;{_TXT}max-width:920px">']

    if title:
        parts.append(f'<div style="{_TXT}font-size:22px;font-weight:800;letter-spacing:-0.02em">'
                     f'{day_label(day, year=True)} 근태현황</div>'
                     f'<div style="{_TXT}font-size:13px;color:{_SUB};margin:4px 0 14px">근태관리통합시스템</div>')

    # 요약 카드 (메일에서도 나란히 보이도록 표로)
    counts = report_counts(rows)
    cards = "".join(
        f'<td style="padding:0 6px;width:25%">'
        f'<div style="{_CARD}border-top:4px solid {color};text-align:center;padding:14px 6px 12px">'
        f'<div style="{_TXT}font-size:13px;font-weight:700;color:{color}">{label}</div>'
        f'<div style="{_TXT}font-size:30px;font-weight:800;color:{color};line-height:1.25">{counts[label]}</div>'
        f'<div style="{_TXT}font-size:11px;color:{_SUB}">명</div></div></td>'
        for label, color, _ in SUMMARY_CARDS)
    parts.append(f'<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 -6px">'
                 f'<tr>{cards}</tr></table>')

    # 근태 현황 (항상 표시)
    att = rows[rows["섹션"] == "근태"]
    if len(att):
        body = [[escape(r["부서"]), _person(r), "".join(badge(t) for t in split_types(r["유형"])),
                 _two_line(r["제목"], r["상세"]), escape(r["비고"])] for _, r in att.iterrows()]
        inner = _table([("부서", "80px"), ("성명", "110px"), ("근태", "130px"), ("근무지·사유", ""), ("비고", "110px")],
                       body)
    else:
        inner = f'<div style="{_TXT}color:{_SUB};padding:6px 0">오늘 근태 특이사항이 없습니다.</div>'
    parts.append(_section(SECTION_TITLES["근태"], len(att), inner))

    # 휴가 일정
    sub = rows[rows["섹션"] == "휴가일정"]
    if len(sub):
        body = [[escape(r["부서"]), _person(r),
                 f'<span style="{_TXT}font-weight:800;color:#d42a2a">{escape(r["값"])}</span>',
                 escape(r["비고"])] for _, r in sub.iterrows()]
        parts.append(_section(SECTION_TITLES["휴가일정"], len(sub),
                              _table([("부서", "80px"), ("성명", "110px"), ("출근 예정", "130px"), ("휴가 일정", "")],
                                     body)))

    # 휴일 근무
    sub = rows[rows["섹션"] == "휴일근무"]
    if len(sub):
        def days_badges(v):
            ds = sorted(date.fromisoformat(t) for t in split_types(v) if len(t) == 10 and t[4] == "-")
            return "".join(badge(day_label(d)) for d in ds) or "-"
        body = [[escape(r["부서"]), _person(r), days_badges(r["유형"]), _two_line(r["제목"], ""), escape(r["비고"])]
                for _, r in sub.iterrows()]
        parts.append(_section(SECTION_TITLES["휴일근무"], len(sub),
                              _table([("부서", "80px"), ("성명", "110px"), ("근무일", "150px"),
                                      ("작업내용·근무지", ""), ("비고", "120px")], body)))

    # 일학습병행(도제)
    sub = rows[rows["섹션"] == "도제"]
    if len(sub):
        body = [[escape(r["부서"]), _person(r), escape(r["값"]) or "-", escape(r["비고"])] for _, r in sub.iterrows()]
        parts.append(_section(SECTION_TITLES["도제"], len(sub),
                              _table([("부서", "80px"), ("성명", "110px"), ("출근 완료", "130px"), ("비고", "")], body)))

    parts.append("</div>")
    return "".join(parts)


def summary_text(day: date, rows: pd.DataFrame) -> str:
    """메일 제목·미리보기용 한 줄 요약: '연차 1, 반차 1, 출장 3'"""
    att = rows[rows["섹션"] == "근태"] if rows is not None and len(rows) else pd.DataFrame(columns=["유형"])
    counts: dict[str, int] = {}
    for v in att["유형"]:
        for t in split_types(v):
            counts[t] = counts.get(t, 0) + 1
    return ", ".join(f"{t} {counts[t]}" for t in LEAVE_TYPES + ["외근"] if t in counts) or "특이사항 없음"
