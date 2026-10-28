"""공용 저장소·로그인·기입값 반영 테스트 (임시 DB 사용)."""
from datetime import date

import pandas as pd
import pytest

from core import store
from core.analytics import build_days
from core.auth import check_password_rule, hash_password, verify_password
from core.config import HOLIDAYS_2026, WorkRule
from core.hiworks import LEAVE_COLUMNS
from core.splitter import employee_rows
from tests.test_analytics_splitter import _mini


@pytest.fixture()
def db(tmp_path, monkeypatch):
    p = tmp_path / "t.sqlite"
    monkeypatch.setenv("CAPS_DB", str(p))
    return p


def test_save_caps_dedup_and_reload(db):
    recs = _mini([("2026-09-01", "08:00:00", "가나다", "출근"), ("2026-09-01", "17:40:00", "가나다", "퇴근")])
    info = {"파일": "9월.xls", "원본 시트": "9월 전체", "기간": "2026-09-01 ~ 2026-09-01"}
    assert store.save_caps(recs, info, "admin") == 2
    assert store.save_caps(recs, info, "admin") == 0  # 같은 파일 다시 올려도 중복 없음
    back = store.load_records()
    assert len(back) == 2 and back["직원"].iloc[0] == "가나다"
    assert back["출입일시"].iloc[1] == pd.Timestamp("2026-09-01 17:40")
    hist = store.load_uploads()
    assert list(hist["새기록"]) == [0, 2]
    assert store.delete_upload(int(hist["id"].iloc[1])) == 2
    assert store.load_records().empty


def test_hiworks_replace_and_version(db):
    v0 = store.version()
    roster = pd.DataFrame([(1, "생산팀", "가나다")], columns=["순서", "부서", "이름"])
    lv = pd.DataFrame([(date(2026, 9, 2), "가나다", "생산팀", "", "연차", "개인사유", "", "s")], columns=LEAVE_COLUMNS)
    store.save_hiworks(roster, lv, "근태현황.xlsx", "admin")
    store.save_hiworks(roster, lv, "근태현황.xlsx", "admin")
    assert len(store.load_leaves()) == 1  # 교체이므로 1건
    assert store.load_leaves()["일자"].iloc[0] == date(2026, 9, 2)
    assert store.version() > v0


def test_overrides_merge_and_apply(db):
    store.save_overrides([{"직원": "가나다", "일자": date(2026, 9, 2), "출근": "08:00:00", "출근근무형태": "조출(08:00)"}], "kim")
    store.save_overrides([{"직원": "가나다", "일자": date(2026, 9, 2), "비고": "지게차 교육"}], "lee")
    ov = store.load_overrides()
    assert len(ov) == 1
    row = ov.iloc[0]
    assert (row["출근"], row["출근근무형태"], row["비고"], row["퇴근"]) == ("08:00:00", "조출(08:00)", "지게차 교육", None)
    assert row["수정자"] == "lee"

    recs = _mini([("2026-09-01", "08:20:00", "가나다", "출근"), ("2026-09-01", "17:35:00", "가나다", "퇴근"),
                  ("2026-09-02", "17:44:00", "가나다", "퇴근")])
    rule = WorkRule()
    days = build_days(recs, None, rule, HOLIDAYS_2026, ov)
    d2 = days[days["일자"] == date(2026, 9, 2)].iloc[0]
    assert d2["출근"] == pd.Timestamp("2026-09-02 08:00") and d2["출근출처"] == "수기입력"
    assert d2["상태"] == "정상"
    rows = employee_rows(days, recs, rule)
    r2 = rows[rows["발생일자"] == "2026-09-02"]
    assert list(r2["근무형태"]) == ["조출(08:00)", ""]
    assert list(r2["인증"]) == ["수기입력", "카드"]
    assert set(r2["비고"]) == {"지게차 교육"}

    store.clear_overrides([("가나다", date(2026, 9, 2))])
    assert store.load_overrides().empty


def test_override_on_blank_day_adds_row(db):
    recs = _mini([("2026-09-01", "08:20:00", "가나다", "출근"), ("2026-09-01", "17:35:00", "가나다", "퇴근")])
    store.save_overrides([{"직원": "가나다", "일자": date(2026, 9, 1), "퇴근": ""}], "kim")  # 퇴근 지움
    days = build_days(recs, None, WorkRule(), HOLIDAYS_2026, store.load_overrides())
    assert days.iloc[0]["상태"] == "퇴근 기록 없음"


def test_settings_roundtrip(db):
    store.set_setting("holidays", {"2026-05-04": "회사휴무"})
    assert store.get_setting("holidays") == {"2026-05-04": "회사휴무"}
    assert store.get_setting("nothing", 7) == 7


def test_password_hash_and_users(db):
    h = hash_password("abcd1234")
    assert verify_password("abcd1234", h) and not verify_password("abcd12345", h)
    assert hash_password("abcd1234") != h  # salt가 달라 해시도 다름
    assert check_password_rule("short1") and check_password_rule("12345678") and not check_password_rule("abcd1234")
    store.upsert_user("admin", "관리자", "관리자", h)
    store.upsert_user("admin", "김관리", "관리자", None)  # 비밀번호 유지하고 이름만 변경
    u = store.get_user("admin")
    assert u["이름"] == "김관리" and verify_password("abcd1234", u["해시"])
    with pytest.raises(ValueError):
        store.upsert_user("new", "새사람", "담당자", None)
    assert store.user_count() == 1
