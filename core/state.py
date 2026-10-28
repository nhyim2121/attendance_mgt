"""여러 페이지가 함께 쓰는 데이터(공용 저장소)와 사이드바 위젯."""
from __future__ import annotations

from datetime import date, time

import pandas as pd
import streamlit as st

from . import store
from .analytics import build_days
from .config import HOLIDAYS_2026, WEEKDAYS_KR, WorkRule
from .daily import merge_leaves, rank_map
from .employees import active_names, apply_employees, employment, is_employed, seed_from


# ---------------------------------------------------------------- 데이터 (공용 저장소)
def apply_roster(records: pd.DataFrame, roster: pd.DataFrame | None) -> pd.DataFrame:
    """명단의 부서를 출입기록에 채운다 (캡스 원본에는 부서가 없음)."""
    if roster is None or roster.empty or records is None:
        return records
    dept = roster.set_index("이름")["부서"]
    out = records.copy()
    mapped = out["이름"].map(dept)
    out["부서"] = mapped.where(mapped.notna() & (mapped != ""), out["부서"])
    return out


@st.cache_data(show_spinner="데이터를 불러오는 중...", max_entries=3)
def _load_all(ver: int, db: str):
    file_roster = store.load_roster()
    emps = store.load_employees()
    # 명단 = 직원 명부(입사·퇴사 관리)가 있으면 그것, 없으면 근태현황 파일의 '명단' 시트
    roster = (emps[["순서", "부서", "이름"]].reset_index(drop=True) if len(emps) else file_roster)
    records = apply_employees(apply_roster(store.load_records(), file_roster), emps)
    # 근태 = 근태현황 파일 + 사이트 일일 보고서 (보고서가 있는 날은 보고서 우선)
    leaves = merge_leaves(store.load_leaves(), store.load_report_rows(), store.report_days())
    return records, roster, leaves, store.load_overrides(), emps


def _ensure_employees() -> None:
    """직원 명부가 비어 있으면 근태현황 '명단'으로 한 번 채운다."""
    if st.session_state.get("_emp_checked"):
        return
    st.session_state["_emp_checked"] = True
    if store.load_employees().empty:
        roster = store.load_roster()
        if not roster.empty:
            ranks = rank_map(store.load_leaves(), store.load_report_rows())
            store.save_employees(seed_from(roster, None, ranks), "자동(명단)")


def _data():
    _ensure_employees()
    return _load_all(store.version(), str(store.db_path()))


def get_records() -> pd.DataFrame | None:
    r = _data()[0]
    return None if r.empty else r


def get_roster() -> pd.DataFrame | None:
    r = _data()[1]
    return None if r.empty else r


def get_employees() -> pd.DataFrame:
    return _data()[4]


def get_leaves() -> pd.DataFrame | None:
    r = _data()[2]
    return None if r.empty else r


def get_overrides() -> pd.DataFrame:
    return _data()[3]


def require_records() -> pd.DataFrame:
    """데이터가 없으면 안내 후 페이지 실행을 멈춘다."""
    df = get_records()
    if df is None or df.empty:
        st.info("아직 저장된 캡스 기록이 없습니다. **파일 업로드**에서 캡스 파일을 올려 주세요.")
        st.page_link("views/0_파일_업로드.py", label="파일 업로드로 이동", icon=":material/upload_file:")
        st.stop()
    st.sidebar.caption(f"캡스 기록 {len(df):,}건 · {df['일자'].min():%Y.%m.%d}~{df['일자'].max():%m.%d}")
    if get_leaves() is not None:
        st.sidebar.caption(f"하이웍스 근태 {len(get_leaves()):,}건 · 기입 {len(get_overrides()):,}건")
    return df


# ---------------------------------------------------------------- 기준 설정 (공용)
def _rule_to_dict(r: WorkRule) -> dict:
    return {"start": r.start.strftime("%H:%M"), "end": r.end.strftime("%H:%M"), "grace_min": r.grace_min,
            "workdays": list(r.workdays), "overtime_min": r.overtime_min, "round_min": r.round_min,
            "label_all": r.label_all}


def get_rule() -> WorkRule:
    d = store.get_setting("rule")
    if not d:
        return WorkRule()
    return WorkRule(start=time.fromisoformat(d["start"]), end=time.fromisoformat(d["end"]),
                    grace_min=int(d["grace_min"]), workdays=tuple(d["workdays"]),
                    overtime_min=int(d["overtime_min"]), round_min=int(d["round_min"]),
                    label_all=bool(d["label_all"]))


def get_holidays() -> dict[date, str]:
    d = store.get_setting("holidays")
    if d is None:
        return dict(HOLIDAYS_2026)
    return {date.fromisoformat(k): v for k, v in d.items()}


def _parse_holidays(text: str) -> dict[date, str]:
    out: dict[date, str] = {}
    for line in text.splitlines():
        parts = line.strip().split(maxsplit=1)
        if not parts:
            continue
        try:
            d = date.fromisoformat(parts[0])
        except ValueError:
            continue
        out[d] = parts[1] if len(parts) > 1 else "휴일"
    return out


def sidebar_rule() -> WorkRule:
    """사이드바에서 근무 기준·공휴일을 설정한다 (모든 페이지에서 유지)."""
    cur = get_rule()
    with st.sidebar.expander("⏰ 근무 기준", expanded=False):
        start = st.time_input("출근 기준", cur.start, step=600)
        end = st.time_input("퇴근 기준", cur.end, step=600)
        grace = st.number_input("지각 유예(분)", 0, 120, cur.grace_min, step=5)
        overtime = st.number_input("연장 표기 기준(퇴근 기준 + 분)", 0, 240, cur.overtime_min, step=10,
                                   help="이 시각 이후 퇴근하면 근무형태를 '연장(HH:MM)'으로 적습니다.")
        round_min = st.selectbox("연장·휴일 시각 단위(분)", [10, 15, 30, 60],
                                 index=[10, 15, 30, 60].index(cur.round_min))
        days = st.multiselect("근무 요일", options=list(range(7)), default=list(cur.workdays),
                              format_func=lambda d: WEEKDAYS_KR[d])
        label_all = st.checkbox("평범한 날에도 근무형태 기입", cur.label_all,
                                help="끄면 수작업 시트처럼 휴일·연장·출장 등 특이한 날만 근무형태를 적습니다.")
    with st.sidebar.expander("📅 공휴일", expanded=False):
        text = "\n".join(f"{d.isoformat()} {n}" for d, n in sorted(get_holidays().items()))
        edited = st.text_area("한 줄에 하나씩: YYYY-MM-DD 이름", text, height=220,
                              help="회사 휴무일(예: 2026-05-04 회사휴무)도 여기에 추가하세요.")
    rule = WorkRule(start=start or time(8, 30), end=end or time(17, 30), grace_min=int(grace),
                    workdays=tuple(days), overtime_min=int(overtime), round_min=int(round_min),
                    label_all=bool(label_all))
    # 바뀌었으면 공용 설정에 저장 (모든 담당자에게 같은 기준 적용)
    if rule != cur:
        store.set_setting("rule", _rule_to_dict(rule))
        st.toast("근무 기준을 저장했습니다 (모든 사용자 공통).")
    hol = _parse_holidays(edited)
    if hol != get_holidays():
        store.set_setting("holidays", {d.isoformat(): n for d, n in sorted(hol.items())})
        st.toast("공휴일을 저장했습니다 (모든 사용자 공통).")
    return rule


# ---------------------------------------------------------------- 필터
def sidebar_filters(df: pd.DataFrame, key: str = "") -> pd.DataFrame:
    """사이드바의 기간·부서·명단 필터를 적용한 결과를 돌려준다."""
    st.sidebar.subheader("🔎 필터")
    out = df
    roster = get_roster()
    emps = get_employees()
    if roster is not None and not roster.empty:
        if st.sidebar.checkbox("등록된 직원만 (재직 기간)", value=True, key=f"only_roster{key}",
                               help="직원 관리에 등록된 사람만, 입사일~퇴사일 사이 기록만 봅니다. "
                                    "경비·외부 인원 등은 빠집니다."):
            out = out[out["이름"].isin(roster["이름"])]
            out = only_employed(out, emps)

    months = sorted(pd.to_datetime(out["일자"]).dt.strftime("%Y-%m").unique())
    choice = st.sidebar.selectbox("월", ["직접 선택"] + months[::-1], index=1 if months else 0, key=f"month{key}")
    if choice != "직접 선택":
        out = out[pd.to_datetime(out["일자"]).dt.strftime("%Y-%m") == choice]
    else:
        dmin, dmax = out["일자"].min(), out["일자"].max()
        picked = st.sidebar.date_input("기간", (dmin, dmax), min_value=dmin, max_value=dmax, key=f"range{key}")
        if isinstance(picked, (tuple, list)) and len(picked) == 2:
            start, end = picked
        else:
            start = end = picked[0] if isinstance(picked, (tuple, list)) else picked
        out = out[(out["일자"] >= start) & (out["일자"] <= end)]

    depts = sorted(d for d in out["부서"].unique() if d)
    if depts:
        chosen = st.sidebar.multiselect("부서", depts, placeholder="전체", key=f"dept{key}")
        if chosen:
            out = out[out["부서"].isin(chosen)]
    return out


def period_label(df: pd.DataFrame) -> str:
    """파일 이름·시트 이름에 쓸 기간 표시 (한 달이면 '9월')."""
    if df.empty:
        return ""
    d = pd.to_datetime(df["일자"])
    if d.dt.strftime("%Y-%m").nunique() == 1:
        return f"{d.iloc[0].month}월"
    return f"{d.min():%m.%d}~{d.max():%m.%d}"


def leaves_in(leaves: pd.DataFrame | None, records: pd.DataFrame) -> pd.DataFrame | None:
    """필터된 기간 안의 하이웍스 근태만."""
    if leaves is None or leaves.empty or records.empty:
        return leaves
    lo, hi = records["일자"].min(), records["일자"].max()
    return leaves[(leaves["일자"] >= lo) & (leaves["일자"] <= hi)]


@st.cache_data(show_spinner="근태를 계산하는 중...", max_entries=30)
def cached_days(records: pd.DataFrame, leaves: pd.DataFrame | None, rule: WorkRule,
                holidays: tuple[tuple[date, str], ...], overrides: pd.DataFrame) -> pd.DataFrame:
    return build_days(records, leaves, rule, dict(holidays), overrides)


def compute_days(records: pd.DataFrame, rule: WorkRule) -> pd.DataFrame:
    hol = tuple(sorted(get_holidays().items()))
    return cached_days(records, leaves_in(get_leaves(), records), rule, hol, get_overrides())


def only_employed(records: pd.DataFrame, emps: pd.DataFrame | None) -> pd.DataFrame:
    """입사일 전·퇴사일 뒤의 기록을 뺀다 (명부에 날짜가 없으면 그대로)."""
    spans = employment(emps)
    if not spans or records.empty:
        return records
    keep = [is_employed(spans.get(n), d) for n, d in zip(records["이름"], records["일자"])]
    return records[keep]


def staff_on(day: date, records: pd.DataFrame | None = None) -> list[tuple[str, str]]:
    """기준일에 재직 중인 직원 [(직원, 부서)] (명부 순서). 명부가 없으면 최근 60일 출입자."""
    emps = get_employees()
    if emps is not None and not emps.empty:
        names = active_names(emps, day, day)
        dept = dict(zip(emps["이름"], emps["부서"]))
        return [(n, dept.get(n, "")) for n in names]
    if records is None or records.empty:
        return []
    from datetime import timedelta
    w = records[(records["일자"] >= day - timedelta(days=60)) & (records["일자"] <= day)]
    w = w.drop_duplicates("직원")
    return list(zip(w["직원"], w["부서"]))
