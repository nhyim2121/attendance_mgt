"""캡스 엑셀/CSV 읽기, 헤더 행 찾기, 열 매핑, 표준 형식으로 정리."""
from __future__ import annotations

import datetime as dt
import io
import re

import pandas as pd

from .config import COLUMN_ALIASES, STANDARD_COLUMNS, WEEKDAYS_KR


# ---------------------------------------------------------------- 파일 읽기
def read_raw(data: bytes, filename: str) -> dict[str, pd.DataFrame]:
    """파일의 모든 시트를 헤더 없이(header=None) 읽는다. {시트명: DataFrame}"""
    name = filename.lower()
    buf = io.BytesIO(data)

    if name.endswith(".csv"):
        for enc in ("utf-8-sig", "cp949"):
            try:
                return {"CSV": pd.read_csv(io.BytesIO(data), header=None, encoding=enc)}
            except UnicodeDecodeError:
                continue
        raise ValueError("CSV 인코딩을 인식할 수 없습니다 (UTF-8, CP949만 지원).")

    if name.endswith(".xls"):
        try:
            return pd.read_excel(buf, sheet_name=None, header=None, engine="xlrd")
        except Exception:
            # 일부 출입관리 프로그램은 HTML 표를 .xls 확장자로 저장한다.
            try:
                tables = pd.read_html(io.BytesIO(data), header=None)
            except Exception as exc:
                raise ValueError(f"엑셀 파일을 읽을 수 없습니다: {exc}") from exc
            return {f"표{i + 1}": t for i, t in enumerate(tables)}

    return pd.read_excel(buf, sheet_name=None, header=None, engine="openpyxl")


# ---------------------------------------------------------------- 열 이름 매칭
def _norm(value) -> str:
    return re.sub(r"\s+", "", str(value)).lower()


def _has_korean(text: str) -> bool:
    return bool(re.search(r"[가-힣]", text))


def _match_field(header: str) -> str | None:
    h = _norm(header)
    for fld, aliases in COLUMN_ALIASES.items():
        if any(h == _norm(a) for a in aliases):
            return fld
    for fld, aliases in COLUMN_ALIASES.items():
        if any(_has_korean(a) and _norm(a) in h for a in aliases):
            return fld
    return None


def detect_header_row(raw: pd.DataFrame, max_scan: int = 30) -> int:
    """제목/조회조건 줄을 건너뛰고 실제 헤더 행 번호를 찾는다."""
    best_row, best_score = 0, 0
    for i in range(min(max_scan, len(raw))):
        cells = [c for c in raw.iloc[i].tolist() if pd.notna(c) and str(c).strip()]
        score = sum(1 for c in cells if _match_field(c) is not None)
        if score > best_score:
            best_row, best_score = i, score
    return best_row if best_score >= 2 else 0


def apply_header(raw: pd.DataFrame, header_row: int) -> pd.DataFrame:
    """header_row 행을 열 이름으로 쓰고 그 아래를 데이터로 만든다."""
    cols: list[str] = []
    seen: dict[str, int] = {}
    for i, c in enumerate(raw.iloc[header_row].tolist()):
        name = str(c).strip() if pd.notna(c) and str(c).strip() else f"열{i + 1}"
        name = re.sub(r"\s+", " ", name)
        if name in seen:
            seen[name] += 1
            name = f"{name}_{seen[name]}"
        else:
            seen[name] = 0
        cols.append(name)

    df = raw.iloc[header_row + 1 :].copy()
    df.columns = cols
    df = df.dropna(how="all").dropna(axis=1, how="all")
    return df.reset_index(drop=True)


def guess_mapping(columns) -> dict[str, str | None]:
    """열 이름을 보고 표준 필드에 맞는 열을 추측한다 (별칭 순서가 우선순위)."""
    mapping: dict[str, str | None] = {f: None for f in COLUMN_ALIASES}
    used: set[str] = set()
    for exact in (True, False):
        for fld, aliases in COLUMN_ALIASES.items():
            if mapping[fld] is not None:
                continue
            for alias in aliases:
                a = _norm(alias)
                if not exact and not _has_korean(alias):
                    continue
                hit = next((c for c in columns if c not in used
                            and (_norm(c) == a if exact else a in _norm(c))), None)
                if hit is not None:
                    mapping[fld] = hit
                    used.add(hit)
                    break
    return mapping


def _is_valid_mapping(m: dict[str, str | None]) -> bool:
    has_time = bool(m.get("datetime")) or (bool(m.get("date")) and bool(m.get("time")))
    return has_time and bool(m.get("name") or m.get("emp_id"))


def find_record_sheet(sheets: dict[str, pd.DataFrame]) -> tuple[str, int] | None:
    """여러 시트 중 출입 원본 기록 시트(행이 가장 많은 유효 시트)와 헤더 행을 찾는다.

    캡스 월별 파일은 원본 시트 이름이 'Sheet1', '3월 근태현황', '9월 전체' 등으로 제각각이고,
    직원별로 정리한 시트가 함께 들어 있으므로 행 수가 가장 많은 시트를 원본으로 본다.
    """
    best: tuple[str, int] | None = None
    best_rows = -1
    for name, raw in sheets.items():
        if raw.empty:
            continue
        hr = detect_header_row(raw)
        table = apply_header(raw, hr)
        if not _is_valid_mapping(guess_mapping(table.columns)):
            continue
        if len(table) > best_rows:
            best, best_rows = (name, hr), len(table)
    return best


# ---------------------------------------------------------------- 값 변환
def _isna(v) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return not v.strip() or v.strip().lower() == "nan"
    try:
        return bool(pd.isna(v))
    except (TypeError, ValueError):
        return False


def _to_seconds(v) -> int | None:
    """여러 형태의 시간 값을 자정 이후 초로 바꾼다."""
    if _isna(v):
        return None
    if isinstance(v, (dt.datetime, dt.time)):  # pd.Timestamp 포함
        return v.hour * 3600 + v.minute * 60 + v.second
    if isinstance(v, dt.timedelta):
        return int(v.total_seconds()) % 86400
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if 0 <= v < 1:  # 엑셀 시간 서식(하루의 비율)
            return round(v * 86400) % 86400
        v = str(int(v))

    s = str(v).strip()
    m = re.fullmatch(r"(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?", s, re.I)
    if m:
        ampm = (m.group(1) or m.group(5) or "").upper()
        h, mi, se = int(m.group(2)), int(m.group(3)), int(m.group(4) or 0)
        if ampm in ("오후", "PM") and h < 12:
            h += 12
        if ampm in ("오전", "AM") and h == 12:
            h = 0
    else:
        digits = re.sub(r"\D", "", s)
        if len(digits) == 14:  # YYYYMMDDHHMMSS
            digits = digits[8:]
        if len(digits) in (3, 4):
            digits = digits.zfill(4) + "00"
        elif len(digits) in (5, 6):
            digits = digits.zfill(6)
        else:
            return None
        h, mi, se = int(digits[:2]), int(digits[2:4]), int(digits[4:6])

    if h > 23 or mi > 59 or se > 59:
        return None
    return h * 3600 + mi * 60 + se


def _to_date(v) -> pd.Timestamp | None:
    """여러 형태의 날짜 값을 자정 Timestamp로 바꾼다."""
    if _isna(v):
        return None
    if isinstance(v, dt.datetime):
        return pd.Timestamp(v).normalize()
    if isinstance(v, dt.date):
        return pd.Timestamp(v)
    if isinstance(v, (int, float)) and not isinstance(v, bool) and 20000 < v < 80000:
        return pd.Timestamp("1899-12-30") + pd.Timedelta(days=int(v))  # 엑셀 일련번호

    s = str(v).strip()
    parts = [p for p in re.split(r"[-./년월일\s]+", s) if p]
    try:
        if len(parts) >= 3 and all(p.isdigit() for p in parts[:3]):
            y, mo, d = (int(p) for p in parts[:3])
            if y < 100:
                y += 2000
            return pd.Timestamp(year=y, month=mo, day=d)
        digits = re.sub(r"\D", "", s)
        if len(digits) >= 8:
            return pd.Timestamp(dt.datetime.strptime(digits[:8], "%Y%m%d"))
        if len(digits) == 6:
            return pd.Timestamp(dt.datetime.strptime(digits, "%y%m%d"))
    except ValueError:
        return None
    return None


def _to_timestamp(v) -> pd.Timestamp | None:
    """날짜와 시간이 한 열에 있는 값을 Timestamp로 바꾼다."""
    if _isna(v):
        return None
    if isinstance(v, dt.datetime):
        return pd.Timestamp(v)
    s = str(v).strip()
    if re.fullmatch(r"\d{14}", s):
        d, secs = _to_date(s[:8]), _to_seconds(s[8:])
    else:
        parts = s.split(None, 1)
        d = _to_date(parts[0])
        secs = _to_seconds(parts[1]) if len(parts) > 1 else 0
    if d is None or secs is None:
        return None
    return d + pd.Timedelta(seconds=secs)


def _to_text(v) -> str:
    if _isna(v):
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))  # 엑셀이 사번 1001을 1001.0으로 읽는 경우
    return str(v).strip()


# ---------------------------------------------------------------- 정규화
def normalize(df: pd.DataFrame, mapping: dict[str, str | None]) -> tuple[pd.DataFrame, int]:
    """매핑을 적용해 표준 열을 가진 DataFrame을 만든다. (결과, 버린 행 수)"""
    m = {k: v for k, v in mapping.items() if v}

    if "datetime" in m:
        ts = pd.to_datetime(df[m["datetime"]].map(_to_timestamp), errors="coerce")
    elif "date" in m and "time" in m:
        dates = pd.to_datetime(df[m["date"]].map(_to_date), errors="coerce")
        secs = pd.to_numeric(df[m["time"]].map(_to_seconds), errors="coerce")
        ts = dates + pd.to_timedelta(secs, unit="s")
    else:
        raise ValueError("'출입일시' 열 또는 '일자'+'시간' 열을 지정해야 합니다.")

    if "name" not in m and "emp_id" not in m:
        raise ValueError("'이름' 또는 '사번' 열 중 하나는 지정해야 합니다.")

    def text(fld: str) -> pd.Series:
        if fld in m:
            return df[m[fld]].map(_to_text)
        return pd.Series([""] * len(df), index=df.index)

    out = pd.DataFrame(
        {
            "출입일시": ts,
            "사번": text("emp_id"),
            "이름": text("name"),
            "부서": text("dept"),
            "출입문": text("door"),
            "모드": text("mode"),
            "인증": text("auth"),
            "근무형태": text("work_type"),
            "근무지": text("place"),
            "비고": text("note"),
        },
        index=df.index,
    )

    bad = out["출입일시"].isna() | ((out["이름"] == "") & (out["사번"] == ""))
    return finalize_records(out[~bad].copy()), int(bad.sum())


def finalize_records(out: pd.DataFrame) -> pd.DataFrame:
    """출입일시·이름·사번 등 기본 열로부터 직원·일자·시간·요일 열을 만든다 (저장소에서 읽을 때도 사용)."""
    out = out.copy()
    for c in ("사번", "이름", "부서", "출입문", "모드", "인증", "근무형태", "근무지", "비고"):
        out[c] = out[c].fillna("").astype(str) if c in out else ""
    # 동명이인을 구분하기 위해 이름과 사번이 모두 있으면 "이름(사번)"으로 표시
    both = (out["이름"] != "") & (out["사번"] != "")
    out["직원"] = out["이름"].where(out["이름"] != "", out["사번"])
    out.loc[both, "직원"] = out.loc[both, "이름"] + "(" + out.loc[both, "사번"] + ")"
    out["일자"] = out["출입일시"].dt.date
    out["시간"] = out["출입일시"].dt.time
    out["요일"] = out["출입일시"].dt.day_of_week.map(lambda d: WEEKDAYS_KR[d])
    return out[STANDARD_COLUMNS].sort_values(["출입일시", "직원"]).reset_index(drop=True)


def load_caps_file(data: bytes, filename: str) -> tuple[pd.DataFrame, dict]:
    """캡스 파일 하나를 읽어 표준 출입기록과 처리 정보를 돌려준다."""
    sheets = read_raw(data, filename)
    found = find_record_sheet(sheets)
    if found is None:
        raise ValueError(f"{filename}: 출입기록 시트를 찾지 못했습니다 (발생일자·발생시각·이름 열 필요).")
    sheet, header_row = found
    table = apply_header(sheets[sheet], header_row)
    mapping = guess_mapping(table.columns)
    records, dropped = normalize(table, mapping)
    info = {
        "파일": filename,
        "원본 시트": sheet,
        "기록 수": len(records),
        "제외 행": dropped,
        "기간": f"{records['일자'].min()} ~ {records['일자'].max()}" if len(records) else "-",
        "열 매핑": {k: v for k, v in mapping.items() if v},
    }
    return records, info


def combine_records(frames: list[pd.DataFrame]) -> pd.DataFrame:
    """여러 달 파일을 합치고, 같은 기록이 두 파일에 있으면 하나만 남긴다."""
    if not frames:
        return pd.DataFrame(columns=STANDARD_COLUMNS)
    out = pd.concat(frames, ignore_index=True)
    out = out.drop_duplicates(subset=["출입일시", "직원", "모드"])
    return out.sort_values(["출입일시", "직원"]).reset_index(drop=True)
