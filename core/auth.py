"""로그인. 비밀번호는 PBKDF2-SHA256 해시로만 저장한다.

역할
- 관리자: 모든 기능 + 업로드 삭제 + 사용자 관리
- 담당자: 조회, 파일 업로드, 근태 기입, 설정 변경
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time

import streamlit as st

from . import store

ROLES = ("관리자", "담당자")
_ITER = 200_000
K_USER = "login_user"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITER)
    return f"pbkdf2_sha256${_ITER}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt, digest = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(dk.hex(), digest)
    except (ValueError, TypeError):
        return False


def authenticate(user_id: str, password: str) -> dict | None:
    u = store.get_user(user_id.strip())
    if u and verify_password(password, u["해시"]):
        return {"아이디": u["아이디"], "이름": u["이름"], "역할": u["역할"]}
    return None


def check_password_rule(pw: str) -> str | None:
    if len(pw) < 8:
        return "비밀번호는 8자 이상이어야 합니다."
    if pw.isdigit() or pw.isalpha():
        return "비밀번호에 숫자와 문자를 섞어 주세요."
    return None


# ---------------------------------------------------------------- Streamlit
def current_user() -> dict | None:
    return st.session_state.get(K_USER)


def is_admin() -> bool:
    u = current_user()
    return bool(u and u["역할"] == "관리자")


def login_gate() -> dict:
    """로그인하지 않았으면 로그인 화면만 있는 내비게이션을 실행하고 멈춘다.

    st.navigation을 항상 거치게 해서, 로그인 전에 다른 화면 주소로 직접 들어가도 로그인 화면만 보인다.
    """
    user = current_user()
    if user:
        return user
    st.navigation([st.Page(login_page, title="로그인", icon=":material/login:")], position="hidden").run()
    st.stop()


def login_page() -> None:
    st.markdown('<style>[data-testid="stSidebar"], [data-testid="stSidebarCollapsedControl"] '
                '{display:none}</style>', unsafe_allow_html=True)
    _, mid, _ = st.columns([1, 1.1, 1])
    with mid:
        st.markdown("<div style='height:8vh'></div>", unsafe_allow_html=True)
        with st.container(key="card_login"):
            st.markdown('<p class="card-title" style="font-size:1.5rem;font-weight:800">근태관리통합시스템</p><p style="color:#6b7280;margin:-6px 0 12px">CAPS 출입기록 · 하이웍스 근태 통합 관리</p>', unsafe_allow_html=True)
            if store.user_count() == 0:
                st.warning("등록된 계정이 없습니다. 서버 PC에서 관리자 계정을 먼저 만들어 주세요.")
                st.code(".venv\\Scripts\\python.exe scripts\\add_user.py", language="bash")
                st.caption("프로젝트 폴더(caps-attendance-app)에서 실행한 뒤 이 화면을 새로고침하세요.")
                st.stop()
            locked = st.session_state.get("login_locked_until", 0) - time.time()
            with st.form("login"):
                uid = st.text_input("아이디")
                pw = st.text_input("비밀번호", type="password")
                ok = st.form_submit_button("로그인", type="primary", width="stretch", disabled=locked > 0)
            if locked > 0:
                st.error(f"로그인 실패가 반복되어 {int(locked)}초 후에 다시 시도할 수 있습니다.")
            elif ok:
                u = authenticate(uid, pw)
                if u:
                    st.session_state[K_USER] = u
                    st.session_state.pop("login_fails", None)
                    st.rerun()
                fails = st.session_state.get("login_fails", 0) + 1
                st.session_state["login_fails"] = fails
                if fails >= 5:
                    st.session_state["login_locked_until"] = time.time() + 60
                    st.session_state["login_fails"] = 0
                st.error("아이디 또는 비밀번호가 맞지 않습니다.")
    st.stop()


def sidebar_account() -> None:
    u = current_user()
    if not u:
        return
    c1, c2 = st.sidebar.columns([3, 2], vertical_alignment="center")
    c1.markdown(f"**{u['이름']}** · {u['역할']}")
    if c2.button("로그아웃", key="logout", width="stretch"):
        st.session_state.pop(K_USER, None)
        st.rerun()


def require_admin() -> None:
    if not is_admin():
        st.error("관리자만 사용할 수 있는 메뉴입니다.")
        st.stop()
