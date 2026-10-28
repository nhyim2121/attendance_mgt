"""직원 관리: 입사·퇴사를 포함한 직원 명부 등록·수정·삭제. 출퇴근 집계는 이 명부 기준."""
from datetime import date, timedelta

import pandas as pd
import streamlit as st

from core import store
from core.auth import current_user
from core.employees import first_last_seen, status_label
from core.state import get_employees, get_records, sidebar_rule

st.title("직원 관리")
st.caption("여기에 등록된 직원만 출퇴근 집계·일일 현황·직원별 시트에 나옵니다. 입사일 전과 퇴사일 뒤의 기록은 "
           "집계에서 빠집니다 (퇴사일 = 마지막 근무일). 캡스에 다른 이름으로 찍히는 직원은 '캡스 이름'에 적어 주세요.")
sidebar_rule()
user = current_user()
today = date.today()

if msg := st.session_state.pop("emp_msg", None):
    st.success(msg)

emps = get_employees().copy()
records = store.load_records()  # 이름 바꾸기 전 원래 캡스 이름 기준
seen = first_last_seen(records)

# ------------------------------------------------------------------ 요약
status = emps.apply(lambda r: status_label(r, today), axis=1) if len(emps) else pd.Series(dtype=str)
month_start = today.replace(day=1)
joined = emps[emps["입사일"].map(lambda d: d is not None and d >= month_start)] if len(emps) else emps
left = emps[emps["퇴사일"].map(lambda d: d is not None and d >= month_start)] if len(emps) else emps
c = st.columns(4)
c[0].metric("재직", f"{int((status == '재직').sum())}명")
c[1].metric("입사 예정", f"{int((status == '입사 예정').sum())}명")
c[2].metric("퇴사", f"{int((status == '퇴사').sum())}명")
c[3].metric(f"{today.month}월 입사 / 퇴사", f"{len(joined)} / {len(left)}명",
            help=("입사: " + ", ".join(joined["이름"]) if len(joined) else "") +
                 (" · 퇴사: " + ", ".join(left["이름"]) if len(left) else ""))

# ------------------------------------------------------------------ 명부 편집
view = st.segmented_control("보기", ["전체", "재직", "퇴사"], default="전체", key="emp_view")
alias_of = {r.이름: (r.캡스이름 or r.이름) for r in emps.itertuples()}
first = dict(zip(seen["이름"], seen["첫 출입"]))
last = dict(zip(seen["이름"], seen["마지막 출입"]))
table = emps[["이름", "부서", "직급", "입사일", "퇴사일", "캡스이름", "사번", "비고"]].copy()
table.insert(1, "상태", status.values if len(emps) else [])
table["첫 출입"] = table["이름"].map(lambda n: first.get(alias_of.get(n, n)))
table["마지막 출입"] = table["이름"].map(lambda n: last.get(alias_of.get(n, n)))
for c_ in ("입사일", "퇴사일", "첫 출입", "마지막 출입"):
    table[c_] = pd.to_datetime(table[c_]).astype("datetime64[ns]")

hidden = pd.DataFrame()
if view == "재직":
    hidden, table = table[table["상태"] == "퇴사"], table[table["상태"] != "퇴사"]
elif view == "퇴사":
    hidden, table = table[table["상태"] != "퇴사"], table[table["상태"] == "퇴사"]

with st.container(key="card_emps"):
    depts = sorted({d for d in emps["부서"] if d} | {"생산팀", "품질팀", "관리팀", "영업팀", "연구소"})
    edited = st.data_editor(
        table, key=f"emp_editor_{view}_{store.version()}", num_rows="dynamic", hide_index=True, width="stretch",
        height=min(38 * (len(table) + 2) + 10, 820),
        disabled=["상태", "첫 출입", "마지막 출입"],
        column_config={
            "이름": st.column_config.TextColumn("이름", required=True, width="small"),
            "상태": st.column_config.TextColumn("상태", width="small"),
            "부서": st.column_config.SelectboxColumn("부서", options=depts, width="small"),
            "직급": st.column_config.TextColumn("직급", width="small"),
            "입사일": st.column_config.DateColumn("입사일", format="YYYY-MM-DD", help="비우면 처음부터 재직으로 봅니다."),
            "퇴사일": st.column_config.DateColumn("퇴사일", format="YYYY-MM-DD", help="마지막 근무일. 비우면 재직 중."),
            "캡스이름": st.column_config.TextColumn("캡스 이름", help="캡스에 이름이 다르게 찍힐 때만 (예: 홍길동A)"),
            "사번": st.column_config.TextColumn("사번", width="small"),
            "비고": st.column_config.TextColumn("비고"),
            "첫 출입": st.column_config.DateColumn("첫 출입(참고)", format="YYYY-MM-DD"),
            "마지막 출입": st.column_config.DateColumn("마지막 출입(참고)", format="YYYY-MM-DD"),
        })
    st.caption("행 추가: 표 아래 + / 삭제: 왼쪽 칸을 선택하고 Delete. 퇴사한 직원은 지우지 말고 퇴사일만 넣으면 "
               "지난 기록은 그대로 남습니다.")

    full = pd.concat([edited, hidden], ignore_index=True) if len(hidden) else edited
    pos = {n: i for i, n in enumerate(emps["이름"])}  # 보기를 걸러도 원래 순서 유지 (새 직원은 맨 뒤)
    full = full.assign(_o=full["이름"].map(lambda n: pos.get(n, 10**6))).sort_values("_o", kind="stable")
    full = full.drop(columns=["상태", "첫 출입", "마지막 출입", "_o"])
    bad = full[full["입사일"].notna() & full["퇴사일"].notna() & (full["퇴사일"] < full["입사일"])]
    if len(bad):
        st.error("퇴사일이 입사일보다 빠른 직원: " + ", ".join(bad["이름"]))
    if st.button("저장", type="primary", disabled=bool(len(bad))):
        try:
            n = store.save_employees(full, user["아이디"])
            st.session_state["emp_msg"] = f"직원 명부를 저장했습니다 ({n}명)."
            st.rerun()
        except ValueError as exc:
            st.error(str(exc))

# ------------------------------------------------------------------ 캡스에만 있는 사람
st.write("")
with st.container(key="card_unreg"):
    st.markdown('<p class="card-title">캡스에는 찍히는데 명부에 없는 사람</p>', unsafe_allow_html=True)
    registered = set(emps["이름"]) | {a for a in emps["캡스이름"] if a}
    recent = seen[(seen["마지막 출입"] >= today - timedelta(days=90)) & ~seen["이름"].isin(registered)]
    if recent.empty:
        st.caption("최근 90일 동안 명부에 없는 출입자가 없습니다.")
    else:
        st.dataframe(recent.sort_values("마지막 출입", ascending=False), hide_index=True, width="stretch")
        pick = st.multiselect("직원이면 골라서 명부에 추가 (경비·고객용 카드 등은 두세요)", list(recent["이름"]))
        if st.button("명부에 추가", disabled=not pick):
            add = pd.DataFrame([{"이름": n, "부서": "", "직급": "", "입사일": first.get(n), "퇴사일": None,
                                 "캡스이름": "", "사번": "", "비고": "캡스에서 추가"} for n in pick])
            base = emps.drop(columns=["순서", "수정자", "수정일시"], errors="ignore")
            store.save_employees(pd.concat([base, add], ignore_index=True), user["아이디"])
            st.session_state["emp_msg"] = f"{', '.join(pick)}을(를) 명부에 추가했습니다. 부서·입사일을 확인해 주세요."
            st.rerun()
