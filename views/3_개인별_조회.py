"""직원 한 명의 출퇴근 흐름, 하이웍스 근태, 원본 기록."""
import streamlit as st

from core import charts
from core.analytics import employee_summary
from core.splitter import employee_rows
from core.state import compute_days, get_leaves, get_roster, require_records, sidebar_filters, sidebar_rule

st.title("출퇴근기록")

records = require_records()
rule = sidebar_rule()
filtered = sidebar_filters(records, key="person")
if filtered.empty:
    st.warning("필터 조건에 맞는 기록이 없습니다.")
    st.stop()

roster = get_roster()
names = list(employee_summary(compute_days(filtered, rule), roster)["직원"])
emp = st.selectbox("직원 선택 (입력해서 검색)", names)

mine = filtered[filtered["직원"] == emp]
days = compute_days(mine, rule)
s = employee_summary(days).iloc[0]

c = st.columns(7)
c[0].metric("부서", s["부서"] or "-")
c[1].metric("출근일수", f"{s['출근일수']}일")
c[2].metric("평균 출근", s["평균출근"] or "-")
c[3].metric("평균 퇴근", s["평균퇴근"] or "-")
c[4].metric("지각 / 조퇴", f"{s['지각']} / {s['조퇴']}")
c[5].metric("휴가 사용", f"{s['휴가사용(일)']:g}일")
c[6].metric("휴일근무", f"{s['휴일근무']}일")

st.subheader("날짜별 출퇴근 시각")
st.plotly_chart(charts.employee_timeline(days, rule), width="stretch")

tab1, tab2, tab3 = st.tabs(["근태현황 시트", "하이웍스 근태", "캡스 원본 기록"])
with tab1:
    st.dataframe(employee_rows(days, mine, rule), width="stretch", hide_index=True, height=520)
with tab2:
    leaves = get_leaves()
    if leaves is None:
        st.info("홈에서 근태현황 파일을 올리면 표시됩니다.")
    else:
        lo, hi = mine["일자"].min(), mine["일자"].max()
        mine_leaves = leaves[(leaves["이름"] == mine["이름"].iloc[0])
                             & (leaves["일자"] >= lo) & (leaves["일자"] <= hi)]
        st.dataframe(mine_leaves.drop(columns=["이름"]), width="stretch", hide_index=True)
with tab3:
    st.dataframe(mine.drop(columns=["출입일시", "직원"]), width="stretch", hide_index=True)
