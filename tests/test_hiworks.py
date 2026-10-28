"""근태현황(하이웍스 정리) 파일 파싱 테스트."""
from datetime import date

import pandas as pd

from core.hiworks import parse_daily_sheet, parse_hiworks, parse_roster, sheet_date

N = None


def daily_raw():
    #        A  B(구분) C(부서)   D(직급) E(성명)  F연차 G반차 H반반차 I외출 J출장 K근무지 L비고
    return pd.DataFrame([
        [N, N, N, N, N, N, N, N, N, N, N, N],
        [N, "구분", "부서", "직급", "성명", "근  태  현  황", N, N, N, N, "근무지\n(목적지/사유/시간)", "비고"],
        [N, N, N, N, N, "연차", "반차", "반반차", "외출", "출장", N, N],
        [N, 1, "영업팀", "이사", "가나다", "o", N, N, N, N, "개인사유", N],
        [N, 2, N, N, N, N, N, N, N, "o", "신승에너지\n회사소개", "10/15(목) 근태"],
        [N, 3, N, "부장", "라마바", N, N, "o ", "O", N, "개인사유\n15:30~17:30", N],
        [N, N, N, N, N, N, N, N, N, N, N, N],
        [N, 4, "생산팀", "도제", "사아자", "OFF-JT(학교)", N, N, N, N, N, N],
        [N, N, N, N, N, "o", N, N, N, N, N, N],  # 표 아래 낙서
        [N, "일학습병행(도제) 관련", N, N, N, N, N, N, N, N, N, N],
        [N, 1, "생산팀", "도제", "차카타", "o", N, N, N, N, N, N],  # 참고 표: 읽지 않음
    ])


def test_sheet_date():
    assert sheet_date("26.10.27(화)") == date(2026, 10, 27)
    assert sheet_date("26..04.22(수)") == date(2026, 4, 22)
    assert sheet_date("26.08.07(금") == date(2026, 8, 7)
    assert sheet_date("26.08.03참고") is None
    assert sheet_date("26.04.04~04.05(주말)") is None
    assert sheet_date("명단") is None


def test_parse_daily_sheet():
    recs = pd.DataFrame(parse_daily_sheet(daily_raw(), date(2026, 10, 16), "26.10.16(금)"))
    got = set(zip(recs["일자"], recs["이름"], recs["유형"]))
    assert got == {
        (date(2026, 10, 16), "가나다", "연차"),
        (date(2026, 10, 15), "가나다", "출장"),  # 비고의 '10/15(목) 근태'
        (date(2026, 10, 16), "라마바", "반반차"),
        (date(2026, 10, 16), "라마바", "외출"),
        (date(2026, 10, 16), "사아자", "OFF-JT(학교)"),
    }
    assert recs.loc[recs["이름"] == "라마바", "부서"].iloc[0] == "영업팀"  # 병합된 부서 칸
    assert "차카타" not in set(recs["이름"])


def test_parse_roster_and_workbook():
    roster_raw = pd.DataFrame([[N, N, N], ["구분", "부서", "성명"], [1, "품질팀", "가나다"], [2, "생산팀", "라마바"]])
    roster = parse_roster(roster_raw)
    assert list(roster["이름"]) == ["가나다", "라마바"]

    r, leaves, skipped = parse_hiworks({"명단": roster_raw, "26.10.16(금)": daily_raw(),
                                        "26.04.04~04.05(주말)": pd.DataFrame([[1]])})
    assert len(r) == 2
    assert len(leaves) == 5
    assert skipped == ["26.04.04~04.05(주말)"]


def test_holiday_work_table_with_merged_content():
    from datetime import datetime
    from core.hiworks import parse_holiday_tables
    raw = pd.DataFrame([
        [N, "휴일근무 관련", N, N, N, N, N, N],
        [N, "구분", "부서", "직급", "성명", "근무일자", N, "작업내용"],
        [N, N, N, N, N, datetime(2026, 9, 12), datetime(2026, 9, 13), N],
        [N, 1, "품질팀", "부장", "가나다", "o", N, "에쓰엔\n온도상승시험"],
        [N, 2, N, "과장", "라마바", "o", "o", N],
        [N, 3, "생산팀", "과장", "사아자", N, "o", "신공장\n페인트 작업"],
    ])
    recs = pd.DataFrame(parse_holiday_tables(raw, date(2026, 9, 14)))
    got = set(zip(recs["일자"], recs["이름"], recs["내용"].str.split("\n").str[0]))
    assert got == {
        (date(2026, 9, 12), "가나다", "에쓰엔"),
        (date(2026, 9, 12), "라마바", "에쓰엔"),
        (date(2026, 9, 13), "라마바", "에쓰엔"),
        (date(2026, 9, 13), "사아자", "신공장"),
    }
    assert set(recs["유형"]) == {"휴일근무"}


def test_merged_content_carried_for_same_type():
    raw = daily_raw()
    raw.iloc[5, 10] = N  # 라마바 내용 비움 -> 유형이 달라서 위 내용을 가져오지 않음
    recs = pd.DataFrame(parse_daily_sheet(raw, date(2026, 10, 16)))
    assert recs.loc[recs["이름"] == "라마바", "내용"].iloc[0] == ""


def test_numeric_helper_values_are_not_types():
    raw = daily_raw()
    raw.iloc[3, 6] = "5"    # 가나다 반차 칸에 보조 숫자
    raw.iloc[5, 9] = "0"    # 라마바 출장 칸에 'o' 대신 '0'
    recs = pd.DataFrame(parse_daily_sheet(raw, date(2026, 10, 16)))
    assert "5" not in set(recs["유형"])
    assert ("라마바", "출장") in set(zip(recs["이름"], recs["유형"]))
