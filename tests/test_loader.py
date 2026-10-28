from datetime import datetime, time

import pandas as pd

from core.loader import _to_date, _to_seconds, apply_header, detect_header_row, guess_mapping, normalize


def _raw_with_title():
    return pd.DataFrame([
        ["출입기록 조회", None, None, None, None],
        ["조회기간: 2026-09-01 ~ 2026-09-30", None, None, None, None],
        [None, None, None, None, None],
        ["출입일자", "출입시간", "사원번호", "성명", "부서"],
        ["2026-09-01", "08:55:10", 1001.0, "김민준", "관리팀"],
        ["2026-09-01", "18:10:00", 1001.0, "김민준", "관리팀"],
        ["합계", None, None, None, None],
    ])


def test_detect_header_skips_title_rows():
    assert detect_header_row(_raw_with_title()) == 3


def test_guess_mapping_split_date_time():
    table = apply_header(_raw_with_title(), 3)
    m = guess_mapping(table.columns)
    assert m["date"] == "출입일자"
    assert m["time"] == "출입시간"
    assert m["emp_id"] == "사원번호"
    assert m["name"] == "성명"
    assert m["dept"] == "부서"
    assert m["datetime"] is None


def test_normalize_drops_footer_and_formats_id():
    table = apply_header(_raw_with_title(), 3)
    out, dropped = normalize(table, guess_mapping(table.columns))
    assert len(out) == 2
    assert dropped == 1  # '합계' 행
    assert out["직원"].iloc[0] == "김민준(1001)"
    assert out["출입일시"].iloc[0] == pd.Timestamp("2026-09-01 08:55:10")


def test_normalize_single_datetime_column():
    df = pd.DataFrame({"발생일시": ["2026-09-01 오후 6:05:00", datetime(2026, 9, 2, 8, 30)],
                       "이름": ["이서연", "이서연"]})
    out, dropped = normalize(df, guess_mapping(df.columns))
    assert dropped == 0
    assert list(out["출입일시"]) == [pd.Timestamp("2026-09-01 18:05"), pd.Timestamp("2026-09-02 08:30")]


def test_time_and_date_variants():
    assert _to_seconds("085512") == 8 * 3600 + 55 * 60 + 12
    assert _to_seconds(0.5) == 12 * 3600
    assert _to_seconds(time(7, 1, 2)) == 7 * 3600 + 62
    assert _to_seconds("오전 12:10") == 600
    assert _to_seconds("25:00") is None
    assert _to_date("2026.9.1") == pd.Timestamp("2026-09-01")
    assert _to_date("20260901") == pd.Timestamp("2026-09-01")
    assert _to_date("2026년 9월 1일") == pd.Timestamp("2026-09-01")
