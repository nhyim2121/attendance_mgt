"""직원별 시트로 나눈 엑셀/ZIP 만들기 (수작업 양식과 같은 모양)."""
import streamlit as st

from core.analytics import employee_summary
from core.splitter import build_workbook, build_zip, employee_rows
from core.state import compute_days, get_roster, period_label, require_records, sidebar_filters, sidebar_rule

st.title("직원별 시트")

records = require_records()
rule = sidebar_rule()
filtered = sidebar_filters(records, key="split")
if filtered.empty:
    st.warning("필터 조건에 맞는 기록이 없습니다.")
    st.stop()

days = compute_days(filtered, rule)
roster = get_roster()
summary = employee_summary(days, roster)
label = period_label(filtered)

all_emps = list(summary["직원"])
picked = st.multiselect("포함할 직원 (비우면 전체, 명단 순서)", all_emps, placeholder="전체 직원")
emps = picked or all_emps
summary_sel = summary[summary["직원"].isin(emps)]

c1, c2, c3, c4 = st.columns(4)
c1.metric("기간", label)
c2.metric("직원 수", f"{len(emps)}명")
c3.metric("지각 / 조퇴", f"{summary_sel['지각'].sum()} / {summary_sel['조퇴'].sum()}건")
c4.metric("기록 없음", f"{summary_sel['기록 없음'].sum()}일", help="평일인데 출입기록과 하이웍스 근태가 모두 없는 날")

st.subheader("직원별 요약")
st.dataframe(summary_sel, width="stretch", hide_index=True)

# 선택 조건이 바뀌면 이전에 만든 파일은 버린다
signature = (tuple(emps), len(filtered), label, repr(rule))
if st.session_state.get("split_signature") != signature:
    st.session_state["split_signature"] = signature
    st.session_state.pop("xlsx_bytes", None)
    st.session_state.pop("zip_bytes", None)

# ------------------------------------------------------------------ 다운로드
st.subheader("다운로드")
d1, d2 = st.columns(2)
with d1:
    st.markdown(f"**{label} 근태현황.xlsx**  \n[{label} 전체] 원본 + [요약] + 직원별 시트")
    if st.button("엑셀 만들기", key="mk_xlsx"):
        with st.spinner("엑셀 파일을 만드는 중..."):
            st.session_state["xlsx_bytes"] = build_workbook(
                filtered, days, emps, rule, summary=summary_sel, label=label)
    if "xlsx_bytes" in st.session_state:
        st.download_button("⬇️ 엑셀 내려받기", st.session_state["xlsx_bytes"],
                           file_name=f"{label} 근태현황.xlsx",
                           mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
with d2:
    st.markdown("**직원별 개별 파일 (ZIP)**  \n직원마다 엑셀 파일 1개씩, 개인 확인용")
    if st.button("ZIP 만들기", key="mk_zip"):
        with st.spinner("ZIP 파일을 만드는 중..."):
            st.session_state["zip_bytes"] = build_zip(filtered, days, emps, rule, label=label)
    if "zip_bytes" in st.session_state:
        st.download_button("⬇️ ZIP 내려받기", st.session_state["zip_bytes"],
                           file_name=f"{label} 직원별 근태.zip", mime="application/zip")

st.caption("근무형태는 특이한 날만 적습니다: "
           f"퇴근 기준+{rule.overtime_min}분 이후면 '연장(시각)', 주말·공휴일은 '휴일(시각)', "
           "출장·교육 날 채운 시각은 '정상출근/정상퇴근'. 근무기록이 없거나 출근·퇴근 중 하나만 있는 날은 "
           "날짜·요일만 적고 비워 둡니다. 조출 등 승인 기반 항목은 파일에서 직접 고쳐 주세요.")

# ------------------------------------------------------------------ 미리보기
st.subheader("시트 미리보기")
emp = st.selectbox("직원", emps)
d = days[days["직원"] == emp]
st.markdown(f"**{d['부서'].iloc[0]} {emp}**" if len(d) else f"**{emp}**")
st.dataframe(employee_rows(d, filtered, rule), width="stretch", hide_index=True, height=520)
