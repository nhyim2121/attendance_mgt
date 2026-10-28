"""파일 업로드: 캡스 월별 파일 + 근태현황(하이웍스) 파일을 공용 저장소에 저장."""
import pandas as pd
import streamlit as st

from core import store
from core.auth import current_user, is_admin
from core.hiworks import load_hiworks_file
from core.loader import load_caps_file
from core.state import get_leaves, get_records, get_roster, sidebar_rule

st.title("파일 업로드")
st.caption("올린 파일은 서버의 공용 저장소에 저장되어 관리팀 모두가 같은 데이터를 봅니다. "
           "같은 기록을 다시 올려도 중복으로 쌓이지 않습니다.")
sidebar_rule()
user = current_user()

if msg := st.session_state.pop("load_msg", None):
    st.success(msg)

# ------------------------------------------------------------------ 현재 저장된 데이터
records = get_records()
c = st.columns(4)
c[0].metric("캡스 기록", f"{0 if records is None else len(records):,}건")
c[1].metric("기간", "-" if records is None else f"{records['일자'].min():%Y.%m.%d}~{records['일자'].max():%m.%d}")
c[2].metric("명단", f"{0 if get_roster() is None else len(get_roster())}명")
c[3].metric("하이웍스 근태", f"{0 if get_leaves() is None else len(get_leaves()):,}건")

# ------------------------------------------------------------------ 업로드
left, right = st.columns(2, gap="large")
with left:
    with st.container(key="card_up_caps"):
        st.markdown('<p class="card-title">1. 캡스 출입기록 (월별 파일, 여러 개 가능)</p>', unsafe_allow_html=True)
        st.caption("예: `9월 근태현황.xls`. 원본 시트(Sheet1, 9월 전체 등)를 자동으로 찾습니다.")
        caps_files = st.file_uploader("캡스 파일", type=["xls", "xlsx", "csv"], accept_multiple_files=True,
                                      key="caps_upload", label_visibility="collapsed")
        if st.button("캡스 기록 저장", type="primary", disabled=not caps_files, key="save_caps"):
            msgs, errors = [], []
            with st.spinner("파일을 읽고 저장하는 중..."):
                for f in caps_files:
                    try:
                        recs, info = load_caps_file(f.getvalue(), f.name)
                        added = store.save_caps(recs, info, user["아이디"])
                        msgs.append(f"{f.name}: {len(recs):,}건 중 새 기록 {added:,}건 저장 ({info['기간']})")
                    except Exception as exc:
                        errors.append(f"{f.name}: {exc}")
            for e in errors:
                st.error(e)
            if msgs:
                st.session_state["load_msg"] = "  \n".join(msgs)
                st.rerun()

with right:
    with st.container(key="card_up_hw"):
        st.markdown('<p class="card-title">2. 근태현황 (하이웍스 정리 파일)</p>', unsafe_allow_html=True)
        st.caption("예: `근태현황(2026년~).xlsx`. 1월부터 누적된 파일이라 올릴 때마다 명단·근태를 새 파일로 교체합니다.")
        hw_file = st.file_uploader("근태현황 파일", type=["xlsx", "xls"], key="hw_upload",
                                   label_visibility="collapsed")
        if st.button("근태현황 저장", type="primary", disabled=hw_file is None, key="save_hw"):
            try:
                with st.spinner("근태현황 파일을 읽는 중... (시트가 많으면 1분 정도 걸립니다)"):
                    roster, leaves, skipped = load_hiworks_file(hw_file.getvalue(), hw_file.name)
                    store.save_hiworks(roster, leaves, hw_file.name, user["아이디"])
                note = f" (날짜 시트가 아니어서 건너뜀: {', '.join(skipped)})" if skipped else ""
                st.session_state["load_msg"] = f"{hw_file.name}: 명단 {len(roster)}명, 근태 {len(leaves):,}건 저장{note}"
                st.rerun()
            except Exception as exc:
                st.error(f"{hw_file.name}: {exc}")

# ------------------------------------------------------------------ 이력
st.write("")
with st.container(key="card_history"):
    st.markdown('<p class="card-title">업로드 이력</p>', unsafe_allow_html=True)
    hist = store.load_uploads()
    if hist.empty:
        st.caption("아직 올린 파일이 없습니다.")
    else:
        st.dataframe(hist.rename(columns={"id": "번호", "새기록": "새 기록"}), hide_index=True, width="stretch")

    if is_admin() and not hist.empty:
        with st.expander("데이터 삭제 (관리자)"):
            st.caption("잘못 올린 파일을 지울 때 씁니다. 근태현황은 새 파일을 다시 올리면 교체됩니다.")
            caps_hist = hist[hist["종류"] == "캡스"]
            col1, col2 = st.columns(2)
            with col1:
                if len(caps_hist):
                    names = caps_hist.set_index("id")["파일"]
                    pick = st.selectbox("업로드 번호로 지우기", caps_hist["id"].tolist(),
                                        format_func=lambda i: f"#{i} {names.get(i, '')}")
                    if st.button("이 업로드의 기록 삭제", key="del_upload"):
                        n = store.delete_upload(int(pick))
                        st.session_state["load_msg"] = f"업로드 #{pick}의 기록 {n:,}건을 삭제했습니다."
                        st.rerun()
            with col2:
                if records is not None:
                    months = sorted(pd.to_datetime(records["일자"]).dt.strftime("%Y-%m").unique(), reverse=True)
                    m = st.selectbox("월 단위로 지우기", months)
                    confirm = st.checkbox(f"{m} 캡스 기록을 모두 지웁니다", key="del_month_ok")
                    if st.button("월 기록 삭제", disabled=not confirm, key="del_month"):
                        n = store.delete_month(m)
                        st.session_state["load_msg"] = f"{m} 캡스 기록 {n:,}건을 삭제했습니다."
                        st.rerun()

# ------------------------------------------------------------------ 확인
hw = get_leaves()
if hw is not None and records is not None:
    missing = sorted(set(hw["이름"]) - set(records["이름"]))
    if missing:
        st.caption("근태현황에는 있지만 캡스 기록이 없는 사람 (판정에서 제외): " + ", ".join(missing))
