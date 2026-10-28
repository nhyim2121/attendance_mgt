"""일일 근태현황 보고서·일일 현황판·메일 테스트 (가짜 이름, 임시 DB)."""
from datetime import date

import pandas as pd
import pytest

from core import mailer, store
from core.analytics import board_counts, build_days, daily_board
from core.config import HOLIDAYS_2026, WorkRule
from core.daily import (merge_leaves, prefill_from_leaves, render_report_html, report_to_leaves, summary_text,
                        weekend_before)
from core.hiworks import LEAVE_COLUMNS
from tests.test_analytics_splitter import _mini

DAY = date(2026, 10, 26)  # 월요일


def _rows():
    return pd.DataFrame([
        {"섹션": "근태", "순서": 1, "부서": "생산팀", "직급": "대리", "성명": "가나다", "유형": "연차",
         "제목": "개인사유", "상세": "10/26(월)~28(수) 3일", "값": "", "비고": ""},
        {"섹션": "근태", "순서": 2, "부서": "생산팀", "직급": "대리", "성명": "라마바", "유형": "반차",
         "제목": "오전반차", "상세": "08:30~13:30", "값": "", "비고": ""},
        {"섹션": "근태", "순서": 3, "부서": "생산팀", "직급": "차장", "성명": "사아자", "유형": "출장",
         "제목": "김포발전소", "상세": "신품 전동기 납품", "값": "", "비고": ""},
        {"섹션": "근태", "순서": 4, "부서": "영업팀", "직급": "이사", "성명": "차카타", "유형": "출장",
         "제목": "김포발전소", "상세": "신품 전동기 납품", "값": "", "비고": ""},
        {"섹션": "도제", "순서": 1, "부서": "생산팀", "직급": "도제", "성명": "파하가", "유형": "", "제목": "",
         "상세": "", "값": "-", "비고": "10/21(수)~10/30(금) 출근 예정"},
        {"섹션": "휴가일정", "순서": 1, "부서": "관리팀", "직급": "사원", "성명": "나다라", "유형": "", "제목": "",
         "상세": "", "값": "10/30(금)", "비고": "10/29(목) 1일 연차"},
        {"섹션": "휴일근무", "순서": 1, "부서": "품질팀", "직급": "부장", "성명": "다라마", "유형": "2026-10-24,2026-10-25",
         "제목": "에쓰엔", "상세": "", "값": "", "비고": "온도상승시험"},
    ])


@pytest.fixture()
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("CAPS_DB", str(tmp_path / "t.sqlite"))


def test_report_crud(db):
    store.save_report(DAY, _rows(), "kim")
    assert store.report_days() == [DAY]
    back = store.load_report_rows(DAY)
    assert len(back) == 7 and set(back["섹션"]) == {"근태", "도제", "휴가일정", "휴일근무"}
    # 수정: 한 줄 지우고 저장하면 통째로 교체
    store.save_report(DAY, _rows().iloc[1:], "lee")
    assert len(store.load_report_rows(DAY)) == 6
    assert store.report_info(DAY)["작성자"] == "lee"
    store.log_mail(DAY, "제목", "a@x.co.kr", "", "성공", "lee")
    assert store.report_info(DAY)["발송자"] == "lee"
    store.delete_report(DAY)
    assert store.report_days() == [] and store.load_report_rows(DAY).empty


def test_report_to_leaves_and_merge():
    rows = _rows().assign(일자=DAY)
    lv = report_to_leaves(rows)
    assert set(zip(lv["이름"], lv["유형"])) == {("가나다", "연차"), ("라마바", "반차"), ("사아자", "출장"),
                                              ("차카타", "출장"), ("다라마", "휴일근무")}
    assert set(lv.loc[lv["유형"] == "휴일근무", "일자"]) == {date(2026, 10, 24), date(2026, 10, 25)}
    file_lv = pd.DataFrame([
        (DAY, "가나다", "", "", "반차", "옛 내용", "", "s"),        # 보고서가 있는 날 -> 보고서가 우선
        (date(2026, 10, 23), "가나다", "", "", "연차", "", "", "s"),  # 다른 날 -> 유지
    ], columns=LEAVE_COLUMNS)
    merged = merge_leaves(file_lv, rows, [DAY])
    got = set(zip(merged["일자"], merged["이름"], merged["유형"]))
    assert (DAY, "가나다", "반차") not in got and (DAY, "가나다", "연차") in got
    assert (date(2026, 10, 23), "가나다", "연차") in got


def test_prefill_and_weekend():
    file_lv = pd.DataFrame([
        (DAY, "가나다", "생산팀", "대리", "반반차", "개인사유\n14:00~17:30", "", "s"),
        (DAY, "가나다", "생산팀", "대리", "외출", "개인사유\n14:00~17:30", "", "s"),
    ], columns=LEAVE_COLUMNS)
    pre = prefill_from_leaves(file_lv, DAY)
    assert len(pre) == 1 and pre.iloc[0]["유형"] == "반반차,외출" and pre.iloc[0]["상세"] == "14:00~17:30"
    assert weekend_before(DAY) == [date(2026, 10, 24), date(2026, 10, 25)]


def test_render_cards_and_tables():
    from core.daily import report_counts
    rows = _rows()
    assert report_counts(rows) == {"휴가": 2, "외출": 0, "출장·교육": 2, "휴일·연장": 1}
    html = render_report_html(DAY, rows)
    for text in ("2026년 10월 26일(월) 근태현황", "근태 현황", "휴가 일정", "휴일·연장", "일학습병행(도제)",
                 "10/24(토)", "김포발전소", "신품 전동기 납품", "10/30(금)"):
        assert text in html
    assert html.count("김포발전소") == 2          # 칸 합치기 없이 사람마다 표시
    assert "border-top:4px solid" in html          # 요약 카드
    assert "display:grid" not in html              # 메일에서 깨지는 CSS 안 씀
    assert summary_text(DAY, rows) == "연차 1, 반차 1, 출장 2"


def test_render_escapes_and_empty():
    rows = pd.DataFrame([{"섹션": "근태", "부서": "<b>", "직급": "", "성명": "<script>x</script>", "유형": "연차",
                          "제목": "a & b", "상세": "", "값": "", "비고": ""}])
    html = render_report_html(DAY, rows)
    assert "<script>" not in html and "&lt;script&gt;" in html and "a &amp; b" in html
    empty = render_report_html(DAY, pd.DataFrame(columns=["섹션"]))
    assert "특이사항이 없습니다" in empty


def test_daily_board_counts():
    recs = _mini([
        ("2026-10-26", "08:10:00", "출근자", "출근"), ("2026-10-26", "17:40:00", "출근자", "퇴근"),
        ("2026-10-26", "08:50:00", "지각자", "출근"),
        ("2026-10-23", "08:00:00", "결근자", "출근"), ("2026-10-23", "17:30:00", "결근자", "퇴근"),
        ("2026-10-23", "08:00:00", "가나다", "출근"),
    ])
    lv = report_to_leaves(_rows().assign(일자=DAY))
    rule = WorkRule()
    days = build_days(recs, lv, rule, HOLIDAYS_2026)
    staff = [(n, "생산팀") for n in ("출근자", "지각자", "결근자", "가나다")]
    board = daily_board(days, lv, staff, DAY, rule, now=pd.Timestamp("2026-10-26 15:00"))
    g = dict(zip(board["직원"], board["구분"]))
    assert g == {"출근자": "퇴근", "지각자": "근무 중", "결근자": "기록 없음", "가나다": "휴가"}
    c = board_counts(board)
    assert (c["출근"], c["퇴근"], c["지각"], c["기록 없음"], c["휴가"], c["근무 중"]) == (2, 1, 1, 1, 1, 1)
    assert "미출근" not in c


def test_mail_helpers(tmp_path):
    good, bad = mailer.parse_addresses("a@x.co.kr, b@y.com; 잘못된주소\nA@x.co.kr")
    assert good == ["a@x.co.kr", "b@y.com", "A@x.co.kr"] and bad == ["잘못된주소"]
    assert mailer.load_config(tmp_path / "none.toml") is None
    p = tmp_path / "s.toml"
    p.write_text('[hiworks_mail]\nuser = "me@x.co.kr"\npassword = "pw"\n', encoding="utf-8")
    cfg = mailer.load_config(p)
    assert cfg["host"] == "smtps.hiworks.com" and cfg["port"] == 465
    msg = mailer.build_message(cfg, "[근태현황] 10/26(월)", "<b>표</b>", "표", ["a@x.co.kr"], ["c@x.co.kr"])
    assert msg["To"] == "a@x.co.kr" and msg["Cc"] == "c@x.co.kr" and "관리팀" in msg["From"]
    assert msg.get_body(("html",)).get_content().count("<b>표</b>") == 1


def test_send_uses_ssl_and_login(monkeypatch):
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, context=None, timeout=None):
            sent["addr"] = (host, port)

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def login(self, u, p):
            sent["login"] = u

        def send_message(self, m):
            sent["subject"] = m["Subject"]

    monkeypatch.setattr(mailer.smtplib, "SMTP_SSL", FakeSMTP)
    cfg = {"host": "smtps.hiworks.com", "port": 465, "user": "me@x.co.kr", "password": "pw", "sender_name": "관리팀"}
    mailer.send(cfg, "제목", "<p>x</p>", "x", ["a@x.co.kr"], [])
    assert sent == {"addr": ("smtps.hiworks.com", 465), "login": "me@x.co.kr", "subject": "제목"}
    with pytest.raises(ValueError):
        mailer.send(cfg, "제목", "", "", [], [])


def test_weekend_board_and_holiday_work():
    sat = date(2026, 10, 24)
    recs = _mini([("2026-10-24", "08:10:00", "주말출근", "출근"), ("2026-10-24", "15:00:00", "주말출근", "퇴근"),
                  ("2026-10-23", "08:00:00", "쉬는사람", "출근"), ("2026-10-23", "08:00:00", "현장근무", "출근")])
    rows = pd.DataFrame([{"섹션": "근태", "부서": "생산팀", "직급": "", "성명": "현장근무", "유형": "휴일근무",
                          "제목": "신공장", "상세": "08:30~17:30", "값": "", "비고": ""}]).assign(일자=sat)
    lv = report_to_leaves(rows)
    rule = WorkRule()
    days = build_days(recs, lv, rule, HOLIDAYS_2026)
    staff = [(n, "생산팀") for n in ("주말출근", "쉬는사람", "현장근무")]
    board = daily_board(days, lv, staff, sat, rule, holiday=True)
    assert dict(zip(board["직원"], board["구분"])) == {"주말출근": "휴일근무", "쉬는사람": "휴무", "현장근무": "휴일근무"}
    c = board_counts(board)
    assert c["휴일근무"] == 2 and c["대상"] == 2 and c["출근"] == 1
    # 캡스 기록 없이 휴일근무를 올린 사람은 직원별 시트에 '휴일근무'와 근무지로 남는다
    from core.splitter import employee_rows
    r = employee_rows(days[days["직원"] == "현장근무"], recs, rule)
    sat_row = r[r["발생일자"] == "2026-10-24"].iloc[0]
    assert sat_row["발생시각"] == "휴일근무" and sat_row["근무지"] == "신공장"


def test_overtime_type_sets_work_label():
    recs = _mini([("2026-10-26", "08:20:00", "가나다", "출근"), ("2026-10-26", "20:05:00", "가나다", "퇴근")])
    rows = pd.DataFrame([{"섹션": "근태", "부서": "생산팀", "직급": "", "성명": "가나다", "유형": "연장근무",
                          "제목": "권선작업", "상세": "17:30~20:00", "값": "", "비고": ""}]).assign(일자=DAY)
    lv = report_to_leaves(rows)
    days = build_days(recs, lv, WorkRule(), HOLIDAYS_2026)
    from core.splitter import employee_rows
    r = employee_rows(days, recs, WorkRule())
    assert list(r["근무형태"]) == ["", "연장(20:00)"]
    board = daily_board(days, lv, [("가나다", "생산팀")], DAY, WorkRule())
    assert board_counts(board)["연장근무"] == 1


def test_employee_registry(db):
    from core.employees import active_names, apply_employees, employment, is_employed
    emps = pd.DataFrame([
        {"이름": "재직자", "캡스이름": "", "사번": "", "부서": "생산팀", "직급": "대리", "입사일": None, "퇴사일": None, "비고": ""},
        {"이름": "퇴사자", "캡스이름": "", "사번": "", "부서": "품질팀", "직급": "", "입사일": date(2026, 1, 1),
         "퇴사일": date(2026, 9, 30), "비고": ""},
        {"이름": "신입", "캡스이름": "신입A", "사번": "", "부서": "관리팀", "직급": "", "입사일": pd.Timestamp("2026-10-19"),
         "퇴사일": pd.NaT, "비고": ""},
    ])
    assert store.save_employees(emps, "kim") == 3
    back = store.load_employees()
    assert back.loc[back["이름"] == "신입", "입사일"].iloc[0] == date(2026, 10, 19)
    assert back.loc[back["이름"] == "신입", "퇴사일"].iloc[0] is None
    assert active_names(back, DAY, DAY) == ["재직자", "신입"]
    assert active_names(back, date(2026, 9, 1), date(2026, 9, 30)) == ["재직자", "퇴사자"]
    spans = employment(back)
    assert is_employed(spans["퇴사자"], date(2026, 9, 30)) and not is_employed(spans["퇴사자"], date(2026, 10, 1))
    recs = _mini([("2026-10-26", "08:00:00", "신입A", "출근")])
    out = apply_employees(recs, back)
    assert out["이름"].iloc[0] == "신입" and out["직원"].iloc[0] == "신입" and out["부서"].iloc[0] == "관리팀"
    with pytest.raises(ValueError):
        store.save_employees(pd.concat([emps, emps.iloc[:1]]), "kim")
