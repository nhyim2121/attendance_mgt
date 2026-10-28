"""일일 근태현황 보고서: 등록·수정·삭제 → 미리보기 → 이미지 저장 → 하이웍스 메일 발송."""
from datetime import date, timedelta
from html import escape

import pandas as pd
import streamlit as st

from core import mailer, store
from core.auth import current_user, is_admin
from core.config import WEEKDAYS_KR
from core.daily import (LEAVE_TYPES, prefill_from_leaves, rank_map, render_report_html, split_types,
                        summary_text, weekend_before, day_label)
from core.state import get_holidays, get_leaves, get_records, get_roster, sidebar_rule

st.title("일일 근태현황")
st.caption("매일 엑셀로 작성해 캡처하던 근태현황을 여기서 작성합니다. 저장하면 근태 판정(지각·조퇴 제외, 휴가 집계)에도 "
           "바로 반영되고, 이미지로 저장하거나 하이웍스 메일로 보낼 수 있습니다.")
sidebar_rule()
user = current_user()

if msg := st.session_state.pop("rep_msg", None):
    st.success(msg)

# ------------------------------------------------------------------ 기준 데이터
roster = get_roster()
records = get_records()
dept_of = dict(zip(roster["이름"], roster["부서"])) if roster is not None else {}
ranks = rank_map(get_leaves(), store.load_report_rows())
names = list(roster["이름"]) if roster is not None else []
if records is not None:
    recent = records[records["일자"] >= records["일자"].max() - timedelta(days=120)]
    names += [n for n in recent["이름"].unique() if n and n not in names]

# ------------------------------------------------------------------ 날짜
c1, c2, c3 = st.columns([1, 1.4, 2], vertical_alignment="bottom")
day = c1.date_input("보고 일자", st.session_state.get("rep_day_value", date.today()), key="rep_day",
                    format="YYYY-MM-DD")
st.session_state["rep_day_value"] = day
written = store.report_days()
info = store.report_info(day)
if info:
    sent = f" · 메일 발송 {info['발송일시'][5:16]} ({info['발송자']})" if info["발송일시"] else " · 메일 미발송"
    c2.markdown(f"**저장됨** · {info['작성자']} {info['수정일시'][5:16]}{sent}")
else:
    c2.markdown("**새 보고서** (아직 저장 안 됨)")
if written:
    c3.caption("최근 작성: " + ", ".join(day_label(d) for d in written[:7]))

saved = store.load_report_rows(day)
dkey, vkey = f"rep_draft_{day}", f"rep_ver_{day}"
if dkey not in st.session_state:
    st.session_state[dkey] = saved.drop(columns=["일자"]) if len(saved) else pd.DataFrame(columns=store.REPORT_COLS)
    st.session_state[vkey] = 0
draft: pd.DataFrame = st.session_state[dkey]


def set_draft(df: pd.DataFrame) -> None:
    st.session_state[dkey] = df.reset_index(drop=True)
    st.session_state[vkey] += 1
    st.rerun()


# ------------------------------------------------------------------ 불러오기
b1, b2, _ = st.columns([1.3, 1.6, 3])
if b1.button("근태현황 파일 내용 불러오기", help="업로드된 근태현황(하이웍스) 파일에 이 날짜로 적힌 근태를 가져옵니다.",
             width="stretch"):
    pre = prefill_from_leaves(store.load_leaves(), day)
    if pre.empty:
        st.info("근태현황 파일에 이 날짜 기록이 없습니다.")
    else:
        keep = draft[draft["섹션"] != "근태"]
        set_draft(pd.concat([pre, keep], ignore_index=True))
prev_days = [d for d in written if d < day]
if b2.button("전일 보고서에서 도제·휴가일정 가져오기", disabled=not prev_days, width="stretch",
             help="계속 이어지는 일학습병행(도제)·휴가일정 표를 가장 최근 보고서에서 복사합니다."):
    prev = store.load_report_rows(prev_days[0])
    carry = prev[prev["섹션"].isin(["도제", "휴가일정"])].drop(columns=["일자"])
    keep = draft[~draft["섹션"].isin(["도제", "휴가일정"])]
    set_draft(pd.concat([keep, carry], ignore_index=True))

# ------------------------------------------------------------------ 섹션별 편집
ver = st.session_state[vkey]
name_col = st.column_config.SelectboxColumn("성명", options=names, required=True, width="small")
dept_col = st.column_config.TextColumn("부서", help="비우면 명단의 부서로 채웁니다.", width="small")
rank_col = st.column_config.TextColumn("직급", help="비우면 최근 직급으로 채웁니다.", width="small")


def section(sec: str) -> pd.DataFrame:
    return draft[draft["섹션"] == sec].fillna("").reset_index(drop=True)


tabs = st.tabs(["근태현황", "일학습병행(도제)", "휴가일정", "휴일 근태"])
collected: list[pd.DataFrame] = []

with tabs[0]:
    base = section("근태")
    df = pd.DataFrame({"성명": base["성명"], "부서": base["부서"], "직급": base["직급"],
                       "유형": base["유형"].map(split_types), "제목": base["제목"], "상세": base["상세"],
                       "비고": base["비고"]})
    ed = st.data_editor(df, key=f"ed_att_{day}_{ver}", num_rows="dynamic", hide_index=True, width="stretch",
                        column_config={
                            "성명": name_col, "부서": dept_col, "직급": rank_col,
                            "유형": st.column_config.MultiselectColumn("근태", options=LEAVE_TYPES + ["외근"],
                                                                     help="여러 개 선택 가능 (예: 반반차+외출)"),
                            "제목": st.column_config.TextColumn("근무지·사유", help="굵게 표시 (예: 김포발전소, 개인사유)"),
                            "상세": st.column_config.TextColumn("시간·내용", help="파란 글씨 (예: 08:30~13:30)"),
                            "비고": st.column_config.TextColumn("비고"),
                        })
    ed = ed.assign(섹션="근태", 유형=ed["유형"].map(lambda v: ",".join(split_types(v))), 값="")
    collected.append(ed)
    st.caption("같은 출장지·사유가 이어지는 사람은 같은 내용을 적으면 표에서 한 칸으로 합쳐집니다.")

with tabs[1]:
    base = section("도제")
    df = pd.DataFrame({"성명": base["성명"], "부서": base["부서"], "직급": base["직급"], "값": base["값"],
                       "비고": base["비고"]})
    ed = st.data_editor(df, key=f"ed_app_{day}_{ver}", num_rows="dynamic", hide_index=True, width="stretch",
                        column_config={"성명": name_col, "부서": dept_col, "직급": rank_col,
                                       "값": st.column_config.TextColumn("출근 완료", help="예: 10/23(금) 또는 -"),
                                       "비고": st.column_config.TextColumn("비고란", width="large")})
    collected.append(ed.assign(섹션="도제", 유형="", 제목="", 상세=""))

with tabs[2]:
    base = section("휴가일정")
    df = pd.DataFrame({"성명": base["성명"], "부서": base["부서"], "직급": base["직급"], "값": base["값"],
                       "비고": base["비고"]})
    ed = st.data_editor(df, key=f"ed_vac_{day}_{ver}", num_rows="dynamic", hide_index=True, width="stretch",
                        column_config={"성명": name_col, "부서": dept_col, "직급": rank_col,
                                       "값": st.column_config.TextColumn("출근예정", help="예: 10/30(금)"),
                                       "비고": st.column_config.TextColumn("휴가 일정", width="large",
                                                                         help="예: 10/29(목) 1일 연차")})
    collected.append(ed.assign(섹션="휴가일정", 유형="", 제목="", 상세=""))

with tabs[3]:
    base = section("휴일근무")
    hol = get_holidays()
    dates = set(weekend_before(day)) | {d for d in hol if day - timedelta(days=7) <= d < day}
    dates |= {date.fromisoformat(t) for v in base["유형"] for t in split_types(v) if len(t) == 10}
    dates = sorted(dates)
    df = pd.DataFrame({"성명": base["성명"], "부서": base["부서"], "직급": base["직급"]})
    for d in dates:
        df[d.isoformat()] = base["유형"].map(lambda v, d=d: d.isoformat() in split_types(v)).astype(bool)
    df["제목"] = base["제목"]
    df["비고"] = base["비고"]
    cfg = {"성명": name_col, "부서": dept_col, "직급": rank_col,
           "제목": st.column_config.TextColumn("작업내용·근무지", help="예: 에쓰엔 / 신공장 페인트 작업"),
           "비고": st.column_config.TextColumn("비고")}
    for d in dates:
        cfg[d.isoformat()] = st.column_config.CheckboxColumn(f"{d.month}/{d.day}({WEEKDAYS_KR[d.weekday()]})",
                                                             default=False, width="small")
    ed = st.data_editor(df, key=f"ed_hol_{day}_{ver}", num_rows="dynamic", hide_index=True, width="stretch",
                        column_config=cfg)
    types = ed.apply(lambda r: ",".join(d.isoformat() for d in dates if bool(r.get(d.isoformat()))), axis=1) \
        if len(ed) else pd.Series(dtype=str)
    collected.append(ed[["성명", "부서", "직급", "제목", "비고"]].assign(섹션="휴일근무", 유형=types, 상세="", 값=""))
    st.caption("근무한 휴일 날짜에 체크하세요. 기본으로 직전 주말과 최근 공휴일이 표시됩니다.")

# ------------------------------------------------------------------ 합치기·검증
rows = pd.concat(collected, ignore_index=True).fillna("")
rows = rows[rows["성명"].astype(str).str.strip() != ""].copy()
rows["부서"] = [d or dept_of.get(n, "") for n, d in zip(rows["성명"], rows["부서"])]
rows["직급"] = [r or ranks.get(n, "") for n, r in zip(rows["성명"], rows["직급"])]
rows["순서"] = rows.groupby("섹션").cumcount() + 1
rows = rows[store.REPORT_COLS].astype(str).reset_index(drop=True)


def _norm(df: pd.DataFrame) -> list[tuple]:
    if df is None or df.empty:
        return []
    d = df.copy()
    for c in store.REPORT_COLS:
        if c not in d:
            d[c] = ""
    return sorted(tuple(str(x) for x in r) for r in d[store.REPORT_COLS].fillna("").itertuples(index=False))


dirty = _norm(rows) != _norm(saved.drop(columns=["일자"]) if len(saved) else None)
no_type = rows[(rows["섹션"] == "근태") & (rows["유형"] == "")]["성명"].tolist()

s1, s2, s3, _ = st.columns([1, 1, 1, 3])
if no_type:
    st.warning("근태 종류가 비어 있는 사람: " + ", ".join(no_type))
if s1.button("저장", type="primary", width="stretch", disabled=not dirty and info is not None):
    store.save_report(day, rows, user["아이디"])
    st.session_state.pop(dkey, None)
    st.session_state["rep_msg"] = f"{day_label(day)} 근태현황을 저장했습니다 ({len(rows)}행)."
    st.rerun()
if s2.button("편집 취소", width="stretch", disabled=not dirty):
    st.session_state.pop(dkey, None)
    st.rerun()
with s3.popover("보고서 삭제", width="stretch", disabled=info is None):
    st.write(f"{day_label(day)} 보고서를 지웁니다. 근태 판정은 근태현황 파일 기준으로 돌아갑니다.")
    if st.button("삭제", type="primary", disabled=not (is_admin() or info and info["작성자"] == user["아이디"])):
        store.delete_report(day)
        st.session_state.pop(dkey, None)
        st.session_state["rep_msg"] = f"{day_label(day)} 보고서를 삭제했습니다."
        st.rerun()
if dirty:
    st.caption(":orange[저장하지 않은 변경 사항이 있습니다.]")

# ------------------------------------------------------------------ 미리보기·이미지
st.write("")
html = render_report_html(day, rows)
with st.container(key="card_preview"):
    st.markdown('<p class="card-title">미리보기</p>', unsafe_allow_html=True)
    est_h = 230 + 120 * max(1, rows["섹션"].nunique()) + 58 * len(rows)  # 카드 + 섹션 제목 + 행
    st.iframe(f"""
<style>
@font-face {{ font-family:'Paperlogy'; font-weight:400; src:url('/app/static/fonts/Paperlogy-400.ttf'); }}
@font-face {{ font-family:'Paperlogy'; font-weight:600; src:url('/app/static/fonts/Paperlogy-600.ttf'); }}
@font-face {{ font-family:'Paperlogy'; font-weight:800; src:url('/app/static/fonts/Paperlogy-800.ttf'); }}
body {{ margin:0; font-family:'Paperlogy','Malgun Gothic',sans-serif; }}
.bar {{ display:flex; gap:8px; align-items:center; margin-bottom:10px; }}
.bar button {{ font-family:inherit; font-weight:600; border:1px solid #c7ced9; background:#fff; border-radius:6px;
  padding:7px 14px; cursor:pointer; }}
.bar button.p {{ background:#2563c9; color:#fff; border-color:#2563c9; }}
#msg {{ color:#1f8a3b; font-size:13px; }}
</style>
<div class="bar"><button class="p" id="dl">이미지로 저장 (PNG)</button><button id="cp">이미지 복사</button>
<span id="msg"></span></div>
<div id="cap" style="display:inline-block;width:100%;max-width:920px">{html}</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
const msg = document.getElementById('msg');
async function shot() {{ await document.fonts.ready;
  return html2canvas(document.getElementById('cap'), {{ scale: 2, backgroundColor: '#ffffff' }}); }}
document.getElementById('dl').onclick = async () => {{
  const c = await shot(); const a = document.createElement('a');
  a.download = '근태현황_{day.isoformat()}.png'; a.href = c.toDataURL('image/png'); a.click();
  msg.textContent = '저장했습니다.'; }};
document.getElementById('cp').onclick = async () => {{
  try {{ const c = await shot(); const b = await new Promise(r => c.toBlob(r));
    await navigator.clipboard.write([new ClipboardItem({{ 'image/png': b }})]);
    msg.textContent = '복사했습니다. 메일·메신저에 붙여넣기(Ctrl+V) 하세요.'; }}
  catch (e) {{ msg.style.color = '#d42a2a'; msg.textContent = '이 브라우저에서는 복사가 막혀 있습니다. 이미지로 저장을 써 주세요.'; }} }};
</script>""", height=min(est_h, 1600))

# ------------------------------------------------------------------ 하이웍스 메일
st.write("")
with st.container(key="card_mail"):
    st.markdown('<p class="card-title">하이웍스 메일로 보내기</p>', unsafe_allow_html=True)
    cfg = mailer.load_config()
    if cfg is None:
        st.info("메일 발송 설정이 아직 없습니다. 서버 PC의 `caps-attendance-app\\.streamlit\\` 폴더에서 "
                "`secrets.toml.example`을 `secrets.toml`로 복사하고 하이웍스 메일 계정을 적은 뒤 사이트를 다시 켜 주세요. "
                "그 전에는 위의 **이미지 복사**로 하이웍스 메일에 붙여 넣어 보낼 수 있습니다.")
    else:
        st.caption(f"보내는 사람: {cfg['sender_name']} <{cfg['user']}> · {cfg['host']}:{cfg['port']}")
    m1, m2 = st.columns(2)
    to_text = m1.text_input("받는 사람", store.get_setting("mail_to", ""), placeholder="a@회사.co.kr, b@회사.co.kr")
    cc_text = m2.text_input("참조", store.get_setting("mail_cc", ""))
    subject = st.text_input("제목", f"[근태현황] {day_label(day)} - {summary_text(day, saved)}")
    greeting = st.text_area("본문 인사말", f"안녕하세요. 관리팀입니다.\n{day_label(day, year=True)} 근태현황 공유드립니다.",
                            height=80)
    to, bad_to = mailer.parse_addresses(to_text)
    cc, bad_cc = mailer.parse_addresses(cc_text)
    if bad_to or bad_cc:
        st.error("메일 주소 형식이 맞지 않습니다: " + ", ".join(bad_to + bad_cc))
    if dirty or info is None:
        st.warning("저장된 보고서만 보낼 수 있습니다. 먼저 **저장**해 주세요.")
    ok = st.checkbox(f"받는 사람 {len(to)}명, 참조 {len(cc)}명에게 위 내용을 보냅니다.", key=f"mail_ok_{day}")
    if st.button("메일 보내기", type="primary", icon=":material/send:",
                 disabled=cfg is None or not ok or not to or bool(bad_to or bad_cc) or dirty or info is None):
        body_html = ("".join(f'<p style="font-family:Malgun Gothic,sans-serif;font-size:14px;margin:0 0 4px">'
                             f'{escape(line)}</p>' for line in greeting.splitlines())
                     + '<div style="height:12px"></div>' + render_report_html(day, saved.drop(columns=["일자"])))
        text = greeting + "\n\n" + "\n".join(
            f"- {r.성명}({r.부서}) {r.유형 or r.섹션} {r.제목} {r.상세}".rstrip() for r in saved.itertuples())
        try:
            with st.spinner("하이웍스로 보내는 중..."):
                mailer.send(cfg, subject, body_html, text, to, cc)
            store.log_mail(day, subject, ", ".join(to), ", ".join(cc), "성공", user["아이디"])
            store.set_setting("mail_to", ", ".join(to))
            store.set_setting("mail_cc", ", ".join(cc))
            st.session_state["rep_msg"] = f"메일을 보냈습니다: {', '.join(to)}"
            st.rerun()
        except Exception as exc:
            store.log_mail(day, subject, ", ".join(to), ", ".join(cc), f"실패: {exc}"[:300], user["아이디"])
            st.error(mailer.friendly_error(exc))
    log = store.load_mail_log(10)
    if len(log):
        with st.expander("발송 이력"):
            st.dataframe(log, hide_index=True, width="stretch")
