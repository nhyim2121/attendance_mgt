"""근태현황(하이웍스 신청서 정리) 파일 읽기.

파일 구조
- '명단' 시트: 구분 | 부서 | 성명
- 날짜별 일일보고 시트 (이름 예: '26.10.27(화)')
    헤더 1행: 구분 | 부서 | 직급 | 성명 | 근태현황 | ... | 근무지(목적지/사유/시간) | 비고
    헤더 2행:                          연차 | 반차 | 반반차 | 외출 | 공가 | 출장 | 교육 (시기별로 순서·종류 다름)
    데이터: 해당 칸에 'o' 표시. 부서 칸은 병합되어 비어 있을 수 있음.
    그 아래 '일학습병행 관련', '휴가일정 관련' 등 참고 표는 읽지 않는다.
"""
from __future__ import annotations

import re
from datetime import date

import pandas as pd

from .loader import _isna, read_raw

LEAVE_FLAGS = {"o", "○", "◯", "●", "v", "✓", "✔", "y"}
_SHEET_DATE = re.compile(r"^\s*(\d{2})\s*\.+\s*(\d{1,2})\s*\.\s*(\d{1,2})")
_NOTE_DATE = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})\s*\([월화수목금토일]\)\s*근태")
LEAVE_COLUMNS = ["일자", "이름", "부서", "직급", "유형", "내용", "비고", "시트"]


def _cell(v) -> str:
    return "" if _isna(v) else str(v).strip()


def _key(s: str) -> str:
    return re.sub(r"\s+", "", s)


def sheet_date(name: str) -> date | None:
    """'26.10.27(화)' -> 2026-10-27. 기간·참고 시트는 None."""
    if "~" in name or "참고" in name:
        return None
    m = _SHEET_DATE.match(name)
    if not m:
        return None
    try:
        return date(2000 + int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def parse_roster(raw: pd.DataFrame) -> pd.DataFrame:
    """'명단' 시트 -> [순서, 부서, 이름]"""
    for i in range(min(10, len(raw))):
        row = [_key(_cell(v)) for v in raw.iloc[i]]
        if "부서" in row and ("성명" in row or "이름" in row):
            dc = row.index("부서")
            nc = row.index("성명") if "성명" in row else row.index("이름")
            rows = []
            for j in range(i + 1, len(raw)):
                name, dept = _cell(raw.iat[j, nc]), _cell(raw.iat[j, dc])
                if name:
                    rows.append((len(rows) + 1, dept, name))
            return pd.DataFrame(rows, columns=["순서", "부서", "이름"]).drop_duplicates("이름")
    return pd.DataFrame(columns=["순서", "부서", "이름"])


def _find_header(raw: pd.DataFrame) -> int | None:
    for i in range(min(15, len(raw) - 1)):
        row = [_key(_cell(v)) for v in raw.iloc[i]]
        if "성명" in row and any("근태" in c for c in row):
            return i
    return None


def parse_daily_sheet(raw: pd.DataFrame, day: date, sheet_name: str = "") -> list[dict]:
    """일일보고 시트 하나에서 첫 번째 근태현황 표의 기록을 읽는다."""
    hi = _find_header(raw)
    if hi is None:
        return []
    head = [_key(_cell(v)) for v in raw.iloc[hi]]
    sub = [_key(_cell(v)) for v in raw.iloc[hi + 1]]

    name_c = head.index("성명")
    dept_c = head.index("부서") if "부서" in head else None
    rank_c = head.index("직급") if "직급" in head else None
    content_c = next((i for i, c in enumerate(head)
                      if "목적지" in c or c.startswith("내용") or c.startswith("근무지")), None)
    note_c = head.index("비고") if "비고" in head else None
    num_c = dept_c - 1 if dept_c else None
    fixed = {name_c, dept_c, rank_c, content_c, note_c}
    type_cols = {c: label for c, label in enumerate(sub)
                 if label and c > name_c and c not in fixed and (content_c is None or c < content_c)}

    out: list[dict] = []
    prev_name = prev_dept = prev_rank = prev_content = ""
    prev_types: list[str] = []
    for j in range(hi + 2, len(raw)):
        cells = [_cell(v) for v in raw.iloc[j]]
        if not any(cells):
            continue
        num = cells[num_c] if num_c is not None else ""
        name = cells[name_c]
        if _key(name) in ("성명", "이름"):
            break  # 다음 표의 헤더
        if num and not re.fullmatch(r"\d+(\.0)?", num):
            break  # '휴가일정 관련' 같은 섹션 제목
        content = cells[content_c] if content_c is not None else ""
        note = cells[note_c] if note_c is not None else ""

        types = []
        for c, label in type_cols.items():
            v = cells[c] if c < len(cells) else ""
            if not v:
                continue
            if v.lower() in LEAVE_FLAGS or v in ("0", "0.0"):  # '0'은 'o' 오타
                types.append(label)
            elif re.fullmatch(r"[\d.]+", v):
                continue  # 3월 일부 시트의 보조 숫자(5, 6 등)는 근태가 아님
            else:
                types.append(v)  # 'OFF-JT(학교)' 같은 직접 입력 값
        dept = (cells[dept_c] if dept_c is not None else "") or prev_dept
        if name:
            rank = cells[rank_c] if rank_c is not None else ""
        else:
            if not (num or content):
                continue  # 표 아래 낙서 같은 값
            name, rank = prev_name, prev_rank
        if not content and types and types == prev_types:
            content = prev_content  # 같은 출장·교육 일행은 내용 칸이 병합되어 있음
        prev_name, prev_dept, prev_rank = name, dept, rank
        prev_types, prev_content = types, content
        if not name or not types:
            continue

        when = day
        m = _NOTE_DATE.search(note) or _NOTE_DATE.search(content)
        if m:  # 비고에 '10/15(목) 근태'처럼 늦게 올린 신청서
            try:
                when = date(day.year, int(m.group(1)), int(m.group(2)))
            except ValueError:
                pass
        for t in types:
            out.append({"일자": when, "이름": name, "부서": dept, "직급": rank, "유형": t,
                        "내용": content, "비고": note, "시트": sheet_name})
    return out


_MD = re.compile(r"^(\d{1,2})\s*/\s*(\d{1,2})\s*\(")


def _as_date(v, year: int) -> date | None:
    """헤더 칸의 날짜: 엑셀 날짜 값 또는 '10/17(토)' 형식."""
    if all(hasattr(v, a) for a in ("year", "month", "day")):  # datetime / Timestamp
        try:
            return date(v.year, v.month, v.day)
        except (TypeError, ValueError):
            return None
    m = _MD.match(_cell(v))
    if m:
        try:
            return date(year, int(m.group(1)), int(m.group(2)))
        except ValueError:
            return None
    return None


def parse_holiday_tables(raw: pd.DataFrame, day: date, sheet_name: str = "") -> list[dict]:
    """'휴일근무 관련' 표: 날짜 칸에 'o' -> 그날 휴일근무, 작업내용(병합 가능)은 근무지."""
    out: list[dict] = []
    n = len(raw)
    i = 0
    while i < n:
        head = [_key(_cell(v)) for v in raw.iloc[i]]
        if "성명" not in head:
            i += 1
            continue
        name_c = head.index("성명")
        date_cols: dict[int, date] = {}
        start = i + 1
        for r in (i, i + 1):
            if r >= n:
                continue
            for c, v in enumerate(raw.iloc[r]):
                d = _as_date(v, day.year) if c > name_c else None
                if d:
                    date_cols[c] = d
            if date_cols and r == i + 1:
                start = i + 2
            if date_cols:
                break
        content_c = next((c for c, h in enumerate(head)
                          if c > name_c and c not in date_cols and ("작업내용" in h or h == "비고" or h.startswith("내용"))), None)
        if not date_cols:  # 근태현황·휴가일정 표 등 날짜 칸이 없는 표
            i += 1
            continue
        dept_c = head.index("부서") if "부서" in head else None
        num_c = dept_c - 1 if dept_c else None
        prev_name = prev_content = prev_dept = ""
        j = start
        while j < n:
            cells = [_cell(v) for v in raw.iloc[j]]
            if not any(cells):
                j += 1
                continue
            num = cells[num_c] if num_c is not None else ""
            name = cells[name_c]
            if _key(name) in ("성명", "이름") or (num and not re.fullmatch(r"\d+(\.0)?", num)):
                break
            name = name or prev_name
            content = (cells[content_c] if content_c is not None else "") or prev_content
            dept = (cells[dept_c] if dept_c is not None else "") or prev_dept
            prev_name, prev_content, prev_dept = name, content, dept
            for c, d in date_cols.items():
                if c < len(cells) and cells[c].lower() in LEAVE_FLAGS and name:
                    out.append({"일자": d, "이름": name, "부서": dept, "직급": "", "유형": "휴일근무",
                                "내용": content, "비고": "", "시트": sheet_name})
            j += 1
        i = j
    return out


def parse_hiworks(sheets: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    """(명단, 근태기록, 건너뛴 시트 이름)"""
    roster = pd.DataFrame(columns=["순서", "부서", "이름"])
    records: list[dict] = []
    skipped: list[str] = []
    for name, raw in sheets.items():
        if "명단" in name:
            roster = parse_roster(raw)
            continue
        day = sheet_date(name)
        if day is None or raw.empty:
            skipped.append(name)
            continue
        records.extend(parse_daily_sheet(raw, day, name))
        records.extend(parse_holiday_tables(raw, day, name))
    leaves = pd.DataFrame(records, columns=LEAVE_COLUMNS)
    if not leaves.empty:
        leaves = leaves.drop_duplicates(subset=["일자", "이름", "유형"]).sort_values(["일자", "이름"])
        leaves = leaves.reset_index(drop=True)
    return roster, leaves, skipped


def load_hiworks_file(data: bytes, filename: str):
    return parse_hiworks(read_raw(data, filename))
