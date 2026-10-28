"""홈 대시보드: 출근/지각/미출근/휴가 카드, 출퇴근 누락, 관리 필요 직원, 근로시간 리포트, 휴가 현황."""
import streamlit as st

from core import charts, ui
from core.analytics import (attention, daily_headcount, day_snapshot, leave_status, missing_rows, month_status,
                            work_hours_report)
from core.config import WEEKDAYS_KR
from core.state import (compute_days, get_leaves, get_roster, period_label, require_records, sidebar_filters,
                        sidebar_rule)

records = require_records()
rule = sidebar_rule()
filtered = sidebar_filters(records, key="dash")
if filtered.empty:
    st.warning("필터 조건에 맞는 기록이 없습니다.")
    st.stop()

roster = get_roster()
days = compute_days(filtered, rule)
report = work_hours_report(days, rule, roster)
label = period_label(filtered)


def day_label(d) -> str:
    return f"{d.month}월 {d.day}일 ({WEEKDAYS_KR[d.weekday()]})"


# ------------------------------------------------------------------ 상단
left, right = st.columns([4, 1], vertical_alignment="bottom")
with left:
    ui.topbar("홈", f"기간 <b>{label}</b> &nbsp;·&nbsp; 총 직원수: <b>{days['직원'].nunique()}</b>")
workdays = sorted(days.loc[~days["휴일"], "일자"].unique(), reverse=True)
if not workdays:
    st.info("선택한 기간에 근무일이 없습니다.")
    st.stop()
with right:
    base = st.selectbox("기준일", workdays, format_func=day_label, key="dash_base")

snap = day_snapshot(days, base)
missing = missing_rows(days)
work = days[~days["휴일"]]

# ------------------------------------------------------------------ 1행: 카드 · 출퇴근 누락 · 관리 필요
c1, c2, c3 = st.columns([1.15, 1, 1], gap="medium")
with c1:
    st.markdown(ui.kpi_cards([
        ("출근", snap["출근"], ui.BLUE, day_label(base)),
        ("지각", snap["지각"], ui.RED, f"기간 누적 {int(days['지각'].sum())}건"),
        ("미출근", snap["미출근"], ui.ORANGE, f"기간 누적 {int((work['상태'] == '기록 없음').sum())}일"),
        ("휴가", snap["휴가"], ui.GREEN, f"기간 누적 {days['휴가일수'].sum():g}일"),
    ]), unsafe_allow_html=True)

with c2:
    with st.container(key="card_missing"):
        st.markdown('<p class="card-title">출퇴근 누락</p>', unsafe_allow_html=True)
        st.markdown(ui.missing_list(missing), unsafe_allow_html=True)
        if len(missing):
            with st.popover(f"전체 보기 ({len(missing)})", width="stretch"):
                view = missing.assign(일자=missing["일자"].map(day_label)).drop(columns=["요일"])
                st.dataframe(view, hide_index=True, width="stretch", height=420)

with c3:
    with st.container(key="card_attn"):
        st.markdown('<p class="card-title">관리가 필요한 직원</p>', unsafe_allow_html=True)
        outsiders = []
        if roster is not None and not roster.empty:
            lo, hi = filtered["일자"].min(), filtered["일자"].max()
            in_period = records[(records["일자"] >= lo) & (records["일자"] <= hi)]
            outsiders = sorted(set(in_period["이름"]) - set(roster["이름"]))
        groups = attention(days, report, outsiders)
        st.markdown(ui.attention_list([(k, len(v)) for k, v in groups]), unsafe_allow_html=True)
        with st.popover("상세 보기", width="stretch"):
            for k, v in groups:
                st.markdown(f"**{k}** ({len(v)})  \n" + (", ".join(v) if v else "-"))

st.write("")

# ------------------------------------------------------------------ 2행: 리포트 현황 · 휴가 현황
r1, r2 = st.columns([1.3, 1], gap="medium")
with r1:
    with st.container(key="card_report"):
        st.markdown('<p class="card-title">리포트 현황</p>', unsafe_allow_html=True)
        sort_labels = {"연장근로(h)": "연장근로", "휴일근로(h)": "휴일근로", "실제근로(h)": "실제근로", "주의": "주의 먼저"}
        sort_key = st.segmented_control("정렬", list(sort_labels), default="연장근로(h)",
                                        format_func=sort_labels.get, label_visibility="collapsed", key="rep_sort")
        sort_key = sort_key or "연장근로(h)"
        if sort_key == "주의":
            rep = report.assign(_w=report["주의사유"] != "").sort_values(["_w", "연장근로(h)"], ascending=False)
            col = "연장근로(h)"
        else:
            rep, col = report.sort_values(sort_key, ascending=False), sort_key
        st.markdown(ui.report_table(rep, col), unsafe_allow_html=True)
        st.caption("소정근로 = 평일 수 × 8h · 실제근로 = 퇴근 − 출근(08:30 이전은 08:30) − 휴게 1h · "
                   "▲ 주의 직원 (마우스를 올리면 사유)")
        with st.popover(f"전체 보기 ({len(report)})", width="stretch"):
            full = rep.drop(columns=["_w"], errors="ignore").copy()
            for c in ("소정근로(h)", "실제근로(h)", "연장근로(h)", "휴일근로(h)"):
                full[c] = full[c].map(ui.hm)
            st.dataframe(full, hide_index=True, width="stretch")

with r2:
    with st.container(key="card_leave"):
        top, cfg = st.columns([3, 1], vertical_alignment="center")
        top.markdown(f'<p class="card-title">휴가 현황 <span class="muted">({base.year}년 1/1 ~ '
                     f'{base.month}/{base.day})</span></p>', unsafe_allow_html=True)
        with cfg.popover("기준", width="stretch"):
            st.number_input("연차 기준일수", 1.0, 30.0, 15.0, step=1.0, key="leave_allot")
        allot = float(st.session_state.get("leave_allot", 15.0))
        leaves = get_leaves()
        if leaves is None:
            st.info("파일 업로드에서 근태현황 파일을 올리면 표시됩니다.")
        else:
            ls = leave_status(leaves, report["직원"].tolist(), base)
            st.markdown(ui.leave_bars(ls, allot), unsafe_allow_html=True)
            with st.popover(f"전체 보기 ({len(ls)})", width="stretch"):
                st.dataframe(ls.assign(남은연차=(allot - ls["연차사용"]).clip(lower=0)),
                             hide_index=True, width="stretch")

# ------------------------------------------------------------------ 추이
with st.expander("추이 그래프 (일별 인원 · 월별 상태)"):
    st.plotly_chart(charts.headcount_line(daily_headcount(work)), width="stretch")
    ms = month_status(days)
    if ms["월"].nunique() > 1:
        st.plotly_chart(charts.status_by_month(ms), width="stretch")
