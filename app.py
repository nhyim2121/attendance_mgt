"""진입점: 로그인 -> 왼쪽 메뉴. 실행: streamlit run app.py (사내망 공개는 start_server.bat)"""
import streamlit as st

from core.auth import is_admin, login_gate, sidebar_account
from core.state import get_records
from core.ui import inject_css

st.set_page_config(page_title="근태관리통합시스템", page_icon=":material/badge:", layout="wide")
inject_css()

login_gate()  # 로그인 전에는 여기서 멈춤
has_data = get_records() is not None

pages = {
    "": [
        st.Page("views/2_대시보드.py", title="홈", icon=":material/home:", default=has_data),
        st.Page("views/6_일일_현황.py", title="일일 현황", icon=":material/today:"),
        st.Page("views/7_일일_근태현황.py", title="일일 근태현황", icon=":material/edit_note:"),
        st.Page("views/3_개인별_조회.py", title="출퇴근기록", icon=":material/schedule:"),
        st.Page("views/4_근태_기입.py", title="근태 기입", icon=":material/edit_calendar:"),
        st.Page("views/1_직원별_분할.py", title="직원별 시트", icon=":material/table_view:"),
    ],
    "관리": [
        st.Page("views/0_파일_업로드.py", title="파일 업로드", icon=":material/upload_file:", default=not has_data),
        st.Page("views/8_직원_관리.py", title="직원 관리", icon=":material/badge:"),
        st.Page("views/5_사용자_관리.py", title="사용자 관리" if is_admin() else "비밀번호 변경",
                icon=":material/manage_accounts:"),
    ],
}
nav = st.navigation(pages)
sidebar_account()
nav.run()
