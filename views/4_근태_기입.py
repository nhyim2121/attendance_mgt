"""근태 기입: 직원·월을 골라 날짜별 출퇴근 시각, 근무형태(조출·연장 등), 근무지, 비고를 직접 기입·수정."""
import calendar
from datetime import date

import pandas as pd
import streamlit as st

from core import store
from core.analytics import parse_clock
from core.auth import current_user
from core.config import WEEKDAYS_KR
from core.splitter import employee_rows
from core.state import compute_days, get_overrides, get_roster, require_records, sidebar_rule

st.title("근태 기입")
st.caption("캡스·하이웍스로 채워지지 않은 조출·연장·출장 시각이나 근무지, 비고를 직접 적습니다. "
           "저장하면 대시보드와 직원별 시트(엑셀)에 바로 반영되고, 누가 언제 고쳤는지 남습니다.")

records = require_records()
rule = sidebar_rule()
user = current_user()
roster = get_roster()

if msg := st.session_state.pop("edit_msg", None):
    st.success(msg)

# ------------------------------------------------------------------ 대상 선택
months = sorted(pd.to_datetime(records["일자"]).dt.strftime("%Y-%m").unique(), reverse=True)
names = list(roster["이름"]) if roster is not None else sorted(records["직원"].unique())
names = [n for n in names if n in set(records["직원"])]
c1, c2, _ = st.columns([1, 1, 2])
month = c1.selectbox("월", months, key="edit_month")
emp = c2.selectbox("직원", names, key="edit_emp")

y, m = map(int, month.split("-"))
month_recs = records[pd.to_datetime(records["일자"]).dt.strftime("%Y-%m") == month]
days = compute_days(month_recs, rule)
mine = days[days["직원"] == emp]
rows = employee_rows(mine, month_recs, rule) if len(mine) else pd.DataFrame(columns=["발생일자"])
status = mine.set_index("일자")["상태"].to_dict() if len(mine) else {}

# 날짜별 한 줄로 정리 (달력의 모든 날짜)
TIME_RE = r"^$|^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$"
base = []
for day in range(1, calendar.monthrange(y, m)[1] + 1):
    d = date(y, m, day)
    r = rows[rows["발생일자"] == d.isoformat()]
    ins = r[r["모드"] == "출근"] if len(r) else r
    outs = r[r["모드"] == "퇴근"] if len(r) else r
    first = r.iloc[0] if len(r) else None
    base.append({
        "일자": d.isoformat(), "요일": WEEKDAYS_KR[d.weekday()],
        "상태": status.get(d, "휴일" if d.weekday() >= 5 else ""),
        "출근": ins["발생시각"].iloc[0] if len(ins) else "",
        "출근 근무형태": ins["근무형태"].iloc[0] if len(ins) else "",
        "퇴근": outs["발생시각"].iloc[0] if len(outs) else "",
        "퇴근 근무형태": outs["근무형태"].iloc[0] if len(outs) else "",
        "근무지": first["근무지"] if first is not None else "",
        "비고": first["비고"] if first is not None else "",
    })
base = pd.DataFrame(base)
ov = get_overrides()
ov_mine = ov[(ov["직원"] == emp) & (pd.to_datetime(ov["일자"]).dt.strftime("%Y-%m") == month)]
edited_by = {d.isoformat(): f"{u} {t[5:16]}" for d, u, t in zip(ov_mine["일자"], ov_mine["수정자"], ov_mine["수정일시"])}
base["수정"] = base["일자"].map(lambda d: edited_by.get(d, ""))

# ------------------------------------------------------------------ 편집 표
dept = mine["부서"].iloc[0] if len(mine) else ""
st.markdown(f"**{dept} {emp}** · {y}년 {m}월")
edited = st.data_editor(
    base, key=f"editor_{emp}_{month}", hide_index=True, width="stretch", height=38 * len(base) + 40,
    disabled=["일자", "요일", "상태", "수정"],
    column_config={
        "일자": st.column_config.TextColumn(width="small"),
        "요일": st.column_config.TextColumn(width=40),
        "상태": st.column_config.TextColumn(width="small"),
        "출근": st.column_config.TextColumn("출근 시각", help="예: 08:00 또는 08:00:00. 비우면 기록 없음",
                                          validate=TIME_RE, width="small"),
        "퇴근": st.column_config.TextColumn("퇴근 시각", validate=TIME_RE, width="small"),
        "출근 근무형태": st.column_config.TextColumn(help="예: 조출(08:00), 정상출근(08:30)", width="small"),
        "퇴근 근무형태": st.column_config.TextColumn(help="예: 연장(20:00), 휴일(17:30)", width="small"),
        "근무지": st.column_config.TextColumn(width="medium"),
        "비고": st.column_config.TextColumn(width="medium"),
        "수정": st.column_config.TextColumn("최근 수정", width="small"),
    },
)

FIELD_MAP = {"출근": "출근", "출근 근무형태": "출근근무형태", "퇴근": "퇴근", "퇴근 근무형태": "퇴근근무형태",
             "근무지": "근무지", "비고": "비고"}
changes, bad = [], []
for (_, old), (_, new) in zip(base.iterrows(), edited.iterrows()):
    ch = {}
    for col, fld in FIELD_MAP.items():
        a, b = str(old[col] or "").strip(), str(new[col] or "").strip()
        if a != b:
            if col in ("출근", "퇴근") and b and parse_clock(b) is None:
                bad.append(f"{new['일자']} {col} '{b}'")
                continue
            if col in ("출근", "퇴근") and b and len(b.split(":")) == 2:
                b += ":00"
            ch[fld] = b
    if ch:
        changes.append({"직원": emp, "일자": date.fromisoformat(new["일자"]), **ch})

b1, b2, _ = st.columns([1, 1, 3])
if bad:
    st.error("시각 형식이 맞지 않습니다 (HH:MM): " + ", ".join(bad))
if b1.button(f"저장 ({len(changes)}일 변경)", type="primary", disabled=not changes or bool(bad), width="stretch"):
    store.save_overrides(changes, user["아이디"])
    st.session_state["edit_msg"] = f"{emp} {m}월: {len(changes)}일을 저장했습니다."
    st.rerun()

with b2.popover("수정 되돌리기", width="stretch", disabled=ov_mine.empty):
    picks = st.multiselect("원래 값(캡스·하이웍스)으로 되돌릴 날짜", sorted(ov_mine["일자"]),
                           format_func=lambda d: f"{d.month}/{d.day}({WEEKDAYS_KR[d.weekday()]})")
    if st.button("되돌리기", disabled=not picks):
        store.clear_overrides([(emp, d) for d in picks])
        st.session_state["edit_msg"] = f"{emp}: {len(picks)}일을 원래 값으로 되돌렸습니다."
        st.rerun()

st.caption("시각을 직접 넣은 행은 엑셀의 인증 칸에 '수기입력'으로 표시됩니다. "
           "근무형태를 비워 두면 기준에 따라 자동으로 적고, 지우고 저장하면 빈칸으로 고정됩니다.")
