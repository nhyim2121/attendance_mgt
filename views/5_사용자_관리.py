"""사용자 관리 (관리자): 관리팀 계정 추가·역할 변경·비밀번호 초기화·삭제, 내 비밀번호 변경."""
import streamlit as st

from core import store
from core.auth import ROLES, check_password_rule, current_user, hash_password, is_admin, verify_password

st.title("사용자 관리")
me = current_user()

# ------------------------------------------------------------------ 내 비밀번호
with st.container(key="card_mypw"):
    st.markdown('<p class="card-title">내 비밀번호 변경</p>', unsafe_allow_html=True)
    with st.form("mypw", clear_on_submit=True):
        cur = st.text_input("현재 비밀번호", type="password")
        new = st.text_input("새 비밀번호 (8자 이상, 숫자+문자)", type="password")
        new2 = st.text_input("새 비밀번호 확인", type="password")
        if st.form_submit_button("변경"):
            u = store.get_user(me["아이디"])
            if not u or not verify_password(cur, u["해시"]):
                st.error("현재 비밀번호가 맞지 않습니다.")
            elif err := check_password_rule(new):
                st.error(err)
            elif new != new2:
                st.error("새 비밀번호가 서로 다릅니다.")
            else:
                store.upsert_user(me["아이디"], u["이름"], u["역할"], hash_password(new))
                st.success("비밀번호를 바꿨습니다.")

if not is_admin():
    st.stop()

st.write("")
left, right = st.columns([1.2, 1], gap="large")
with left:
    with st.container(key="card_users"):
        st.markdown('<p class="card-title">계정 목록</p>', unsafe_allow_html=True)
        users = store.list_users()
        st.dataframe(users, hide_index=True, width="stretch")
        others = [u for u in users["아이디"] if u != me["아이디"]]
        if others:
            with st.popover("계정 삭제"):
                target = st.selectbox("삭제할 계정", others)
                if st.button(f"{target} 삭제", type="primary"):
                    store.delete_user(target)
                    st.rerun()

with right:
    with st.container(key="card_adduser"):
        st.markdown('<p class="card-title">계정 추가 · 수정</p>', unsafe_allow_html=True)
        st.caption("같은 아이디를 넣으면 이름·역할을 바꾸고, 비밀번호를 넣으면 초기화합니다.")
        with st.form("adduser", clear_on_submit=True):
            uid = st.text_input("아이디")
            name = st.text_input("이름")
            role = st.selectbox("역할", ROLES, index=1, help="관리자: 업로드 삭제·사용자 관리 가능 / 담당자: 조회·업로드·기입")
            pw = st.text_input("비밀번호 (새 계정은 필수)", type="password")
            if st.form_submit_button("저장", type="primary"):
                uid = uid.strip()
                exists = store.get_user(uid) if uid else None
                if not uid or not name.strip():
                    st.error("아이디와 이름을 입력해 주세요.")
                elif not exists and not pw:
                    st.error("새 계정은 비밀번호가 필요합니다.")
                elif pw and (err := check_password_rule(pw)):
                    st.error(err)
                elif uid == me["아이디"] and role != "관리자":
                    st.error("내 계정의 관리자 권한은 스스로 해제할 수 없습니다.")
                else:
                    store.upsert_user(uid, name.strip(), role, hash_password(pw) if pw else None)
                    st.success(f"{uid} 계정을 {'수정' if exists else '추가'}했습니다. 처음 비밀번호는 직접 전달해 주세요.")
