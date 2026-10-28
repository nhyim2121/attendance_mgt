"""일일 현황: 그날 캡스 출퇴근 내역을 올리면 출근·퇴근·지각·휴가·출장·휴일·연장 인원을 자동 집계."""
from datetime import date, datetime, timedelta

import pandas as pd
import streamlit as st

from core import store, ui
from core.analytics import board_counts, daily_board
from core.auth import current_user
from core.config import WEEKDAYS_KR
from core.loader import load_caps_file
from core.state import compute_days, get_holidays, get_leaves, get_records, get_roster, sidebar_rule, staff_on

st.title("일일 현황")
rule = sidebar_rule()
user = current_user()

if msg := st.session_state.pop("daily_msg", None):
    st.success(msg)

# ------------------------------------------------------------------ 오늘 캡스 파일 올리기
with st.expander("오늘 캡스 출퇴근 내역 올리기", expanded=get_records() is None, icon=":material/upload_file:"):
    st.caption("캡스에서 내려받은 그날(또는 며칠치) 출입기록 파일을 올리면 바로 집계됩니다. "
               "이미 올린 기록은 중복으로 쌓이지 않으니 하루에 여러 번 올려도 됩니다.")
    up = st.file_uploader("캡스 파일", type=["xls", "xlsx", "csv"], accept_multiple_files=True,
                          key="daily_upload", label_visibility="collapsed")
    if st.button("저장하고 집계", type="primary", disabled=not up):
        msgs = []
        for f in up:
            try:
                recs, info = load_caps_file(f.getvalue(), f.name)
                added = store.save_caps(recs, info, user["아이디"])
                msgs.append(f"{f.name}: 새 기록 {added:,}건 ({info['기간']})")
                st.session_state["daily_day"] = max(recs["일자"])
            except Exception as exc:
                st.error(f"{f.name}: {exc}")
        if msgs:
            st.session_state["daily_msg"] = "  \n".join(msgs)
            st.rerun()

records = get_records()
if records is None:
    st.info("아직 캡스 기록이 없습니다. 위에서 파일을 올려 주세요.")
    st.stop()

# ------------------------------------------------------------------ 기준일
roster = get_roster()
today = date.today()
last_day = records["일자"].max()
default = st.session_state.get("daily_day", today if today <= last_day else last_day)
c1, c2, _ = st.columns([1, 1, 3], vertical_alignment="bottom")
day = c1.date_input("기준일", default, max_value=max(today, last_day), key="daily_pick", format="YYYY-MM-DD")
c2.caption(f"캡스 기록: {last_day:%Y-%m-%d}까지")

# 대상 인원: 직원 관리에 등록되어 그날 재직 중인 사람 (입사일~퇴사일)
staff_list = staff_on(day, records)
if not staff_list:
    st.warning(f"{day}에 재직 중인 직원이 없습니다. **직원 관리**에서 직원을 등록해 주세요.")
    st.stop()
names = {n for n, _ in staff_list}
window = records[(records["일자"] >= day - timedelta(days=60)) & (records["일자"] <= day) & records["직원"].isin(names)]

holidays = get_holidays()
is_holiday = day.weekday() not in rule.workdays or day in holidays
days = compute_days(window, rule)
now = pd.Timestamp(datetime.now()) if day == today else None
board = daily_board(days, get_leaves(), staff_list, day, rule, now, holiday=is_holiday)
cnt = board_counts(board)
has_day = (records["일자"] == day).any()

label = f"{day.month}월 {day.day}일 ({WEEKDAYS_KR[day.weekday()]})"
hol_tag = f" &nbsp;·&nbsp; <span style='color:#b45309'>{holidays.get(day, '주말')} (휴일)</span>" if is_holiday else ""
ui.topbar(label, f"재직 <b>{len(staff_list)}</b>명{hol_tag}" + ("" if has_day else
          " &nbsp;·&nbsp; <span style='color:#d42a2a'>이 날짜의 캡스 기록이 아직 없습니다</span>"))

st.markdown(ui.kpi_row([
    ("출근", cnt["출근"], ui.BLUE, f"재직 {len(staff_list)}명 중" if not is_holiday else "휴일 출근"),
    ("퇴근", cnt["퇴근"], "#4b5563", f"근무 중 {cnt['근무 중']}명" if now is not None else "퇴근 태그 기준"),
    ("지각", cnt["지각"], ui.RED, f"{rule.start:%H:%M} 이후 출근"),
    ("휴가", cnt["휴가"], ui.GREEN, "연차·반차·반반차·공가·외출"),
    ("출장·교육", cnt["출장·교육"], "#6d28d9", "외근 포함"),
    ("휴일·연장", cnt["휴일근무"] + cnt["연장근무"], "#b45309",
     f"휴일 {cnt['휴일근무']} · 연장 {cnt['연장근무']}"),
]), unsafe_allow_html=True)
st.write("")


def hm(ts) -> str:
    return "" if pd.isna(ts) else ts.strftime("%H:%M")


came = board[board["출근"].notna()].sort_values("출근")
went = board[board["퇴근"].notna()].sort_values("퇴근")
late = board[board["지각"]]
extra = board[(board["구분"] == "휴일근무") | board["연장"]]
groups = [
    ("출근", ui.BLUE, [(r.직원, hm(r.출근)) for r in came.itertuples()]),
    ("퇴근", "#4b5563", [(r.직원, hm(r.퇴근)) for r in went.itertuples()]),
    ("지각", ui.RED, [(r.직원, r.출근.strftime("%H:%M:%S")) for r in late.itertuples() if pd.notna(r.출근)]),
    ("휴가", ui.GREEN, [(r.직원, r.근태) for r in board[board["구분"] == "휴가"].itertuples()]),
    ("출장·교육", "#6d28d9", [(r.직원, r.근태내용 or r.근태) for r in board[board["구분"] == "출장·교육"].itertuples()]),
    ("휴일·연장근무", "#b45309", [(r.직원, ("연장 " if r.연장 else "") + (r.근태내용 or ("휴일근무" if r.구분 == "휴일근무" else "")))
                                for r in extra.itertuples()]),
]
st.markdown(ui.board_html(groups), unsafe_allow_html=True)
# ------------------------------------------------------------------ 직원별 표
st.write("")
with st.container(key="card_daily_table"):
    st.markdown('<p class="card-title">직원별 출퇴근</p>', unsafe_allow_html=True)
    shown = board[board["구분"] != "휴무"] if is_holiday else board  # 휴일엔 쉬는 사람은 빼고
    if is_holiday:
        st.caption(f"휴일이라 출근하지 않은 {int((board['구분'] == '휴무').sum())}명은 표에서 뺐습니다.")
    view = shown.assign(출근=shown["출근"].map(hm), 퇴근=shown["퇴근"].map(hm))[
        ["부서", "직원", "출근", "퇴근", "상태", "근태", "근태내용"]].rename(columns={"근태내용": "근무지·사유"})
    st.dataframe(view, hide_index=True, width="stretch", height=min(38 * len(view) + 40, 760))
