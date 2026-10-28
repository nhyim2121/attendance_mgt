"""실제 캡스 월별 파일 형식 테스트 (이름은 가짜)."""
import pandas as pd

from core.loader import apply_header, combine_records, find_record_sheet, guess_mapping, normalize

CAPS_HEADER = ["요일", "발생일자", "발생시각", "이름", "근무형태", "구분", "모드", "인증", "근무지", "비고"]


def caps_raw(rows):
    return pd.DataFrame([CAPS_HEADER] + [list(r) for r in rows])


def test_mapping_on_caps_header():
    m = guess_mapping(CAPS_HEADER)
    assert m["date"] == "발생일자"
    assert m["time"] == "발생시각"
    assert m["name"] == "이름"
    assert m["mode"] == "모드"  # '구분'(항상 '일반')이 아니라 '모드'
    assert m["auth"] == "인증"
    assert m["work_type"] == "근무형태"
    assert m["place"] == "근무지"
    assert m["note"] == "비고"
    assert m["datetime"] is None and m["dept"] is None and m["emp_id"] is None


def test_mapping_jan_header_without_gubun_and_with_inwon():
    cols = ["요일", "발생일자", "발생시각", "이름", "근무형태", "모드", "인증", "근무지", "인원"]
    m = guess_mapping(cols)
    assert m["mode"] == "모드" and m["note"] == "인원"


def test_find_record_sheet_prefers_biggest_valid_sheet():
    raw = caps_raw([("화", "2026-09-01", f"08:0{i}:00", "가나다", "", "일반", "출근", "카드", "", "")
                    for i in range(6)])
    personal = pd.DataFrame([  # 수작업 직원별 시트: B2 제목, B4 헤더
        [None, None, None, None, None],
        [None, "생산팀 가나다", None, None, None],
        [None, None, None, None, None],
        [None, "요일", "발생일자", "발생시각", "이름"],
        [None, "화", "2026-09-01", "08:00:00", "가나다"],
    ])
    memo = pd.DataFrame([["ABB 출퇴근 관련"], ["메모"]])
    assert find_record_sheet({"abb": memo, "가나다": personal, "9월 전체": raw}) == ("9월 전체", 0)


def test_normalize_caps_rows_and_blank_rows():
    raw = caps_raw([
        ("화", "2026-09-01", "06:47:28", "가나다", "", "일반", "출근", "카드", "", ""),
        (None, None, None, None, None, None, None, None, None, None),  # 7월 파일의 빈 행
        ("화", "2026-09-01", "17:30:37", "가나다", "정상(17:30)", "일반", "퇴근", "1:N 지문", "", ""),
    ])
    out, dropped = normalize(apply_header(raw, 0), guess_mapping(CAPS_HEADER))
    assert len(out) == 2 and dropped == 0
    assert list(out["모드"]) == ["출근", "퇴근"]
    assert out["근무형태"].iloc[1] == "정상(17:30)"
    assert out["직원"].iloc[0] == "가나다"
    assert out["요일"].iloc[0] == "화"


def test_combine_removes_duplicates_across_files():
    raw = caps_raw([("화", "2026-09-01", "08:00:00", "가나다", "", "일반", "출근", "카드", "", "")])
    a, _ = normalize(apply_header(raw, 0), guess_mapping(CAPS_HEADER))
    assert len(combine_records([a, a.copy()])) == 1
