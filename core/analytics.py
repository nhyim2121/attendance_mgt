"""일별 근태 판정, 근무형태 자동 표기, 직원별 요약."""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from .config import (ALARM_MODES, EXCUSED_TYPES, FULL_DAY_TYPES, LEAVE_DAY_VALUE, TRAVEL_TYPES,
                     WEEKDAYS_KR, WorkRule)

DAY_COLUMNS = [
    "직원", "부서", "일자", "요일", "휴일", "출근", "퇴근", "체류시간(h)", "태그수",
    "근태", "근태내용", "동행", "휴가일수", "지각", "조퇴", "상태",
    "출근행", "퇴근행", "출근출처", "퇴근출처", "마지막태그",
    "수정_출근근무형태", "수정_퇴근근무형태", "수정_근무지", "수정_비고", "수정자",
]
OVERRIDE_TEXT = ["수정_출근근무형태", "수정_퇴근근무형태", "수정_근무지", "수정_비고"]


# ---------------------------------------------------------------- 시각 표기
def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _minutes(t) -> int:
    return t.hour * 60 + t.minute


def work_type_in(ts: pd.Timestamp, holiday: bool, rule: WorkRule) -> str:
    """출근 근무형태: 평일은 항상 '정상(기준)'(지각은 '확인' 열에 표시),
    휴일은 기준 전 출근이면 기준 시각, 늦으면 단위 올림."""
    start = _minutes(rule.start)
    if not holiday:
        return f"정상({_hhmm(start)})"
    m = _minutes(ts)
    if m > start:
        m = -(-m // rule.round_min) * rule.round_min
    else:
        m = start
    return f"휴일({_hhmm(m)})"


def work_type_out(ts: pd.Timestamp, holiday: bool, rule: WorkRule) -> str:
    """퇴근 근무형태: 휴일은 단위 절사, 평일은 기준+연장기준분 이후면 '연장'."""
    m = _minutes(ts)
    floored = m // rule.round_min * rule.round_min
    if holiday:
        return f"휴일({_hhmm(floored)})"
    end = _minutes(rule.end)
    if m >= end + rule.overtime_min:
        return f"연장({_hhmm(floored)})"
    return f"정상({_hhmm(end)})"


# ---------------------------------------------------------------- 일별 판정
def _pick_in_out(g: pd.DataFrame) -> tuple:
    """하루 기록에서 출근/퇴근 행을 고른다.

    - 출근: 첫 '출근' 모드 태그. '출근' 모드가 없으면 첫 번째 '퇴근' 아닌 태그.
    - 퇴근: 출근 이후의 마지막 '퇴근' 모드 태그 ('출입'만 있으면 퇴근으로 보지 않음).
    반환: (출근행, 퇴근행, 마지막 태그 시각)
    """
    g = g.sort_values("출입일시")
    ins = g[g["모드"] == "출근"]
    if len(ins):
        in_row = ins.index[0]
    else:
        others = g[g["모드"] != "퇴근"]
        in_row = others.index[0] if len(others) else None
    outs = g[g["모드"] == "퇴근"]
    if in_row is not None:
        outs = outs[outs["출입일시"] > g.at[in_row, "출입일시"]]
    out_row = outs.index[-1] if len(outs) else None
    return in_row, out_row, g["출입일시"].iloc[-1]


def _is_holiday(d: date, rule: WorkRule, holidays: dict[date, str]) -> bool:
    return d.weekday() not in rule.workdays or d in holidays


def _first_line(text: str) -> str:
    return " ".join(str(text).split("\n")[0].split())


def _companions(leaves: pd.DataFrame) -> dict[tuple, list[str]]:
    """같은 날 같은 출장·교육·휴일근무(내용 첫 줄이 같은) 일행 이름."""
    out: dict[tuple, list[str]] = {}
    lv = leaves[leaves["유형"].isin(TRAVEL_TYPES | {"휴일근무"}) & (leaves["내용"] != "")]
    for (_, _, _), g in lv.groupby([lv["일자"], lv["유형"], lv["내용"].map(_first_line)]):
        names = list(dict.fromkeys(g["이름"]))
        for n in names:
            key = (n, g["일자"].iloc[0])
            out[key] = list(dict.fromkeys(out.get(key, []) + [x for x in names if x != n]))
    return out


def _empty_day(emp: str, dept: str, day: date) -> dict:
    return {"직원": emp, "부서": dept, "일자": day, "출근": pd.NaT, "퇴근": pd.NaT, "태그수": 0,
            "출근행": None, "퇴근행": None, "마지막태그": pd.NaT}


def parse_clock(text) -> int | None:
    """'8:30', '08:30:15' -> 자정 이후 초. 빈 값·잘못된 값은 None."""
    if text is None:
        return None
    parts = str(text).strip().split(":")
    if len(parts) not in (2, 3) or not all(p.strip().isdigit() for p in parts):
        return None
    h, m, s = (int(p) for p in (parts + ["0"])[:3])
    if h > 23 or m > 59 or s > 59:
        return None
    return h * 3600 + m * 60 + s


def build_days(
    records: pd.DataFrame,
    leaves: pd.DataFrame | None,
    rule: WorkRule,
    holidays: dict[date, str],
    overrides: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """직원·일자별 근태표. 기록이 없는 평일(결근/휴가)도 포함한다.

    records: 표준 출입기록 (loader.normalize 결과)
    leaves : 하이웍스 근태기록 (hiworks.parse_hiworks 결과) 또는 None
    출장·교육·외근 날은 출근 기록이 없거나 늦으면 출근 기준 시각, 퇴근 기록이 없거나 이르면
    퇴근 기준 시각을 '하이웍스' 출처로 채운다 (관리팀 수작업 방식).
    """
    rec = records[~records["모드"].isin(ALARM_MODES)]
    if rec.empty:
        return pd.DataFrame(columns=DAY_COLUMNS)

    rows: dict[tuple, dict] = {}
    for (emp, day), g in rec.groupby(["직원", "일자"], sort=False):
        in_row, out_row, last = _pick_in_out(g)
        row = _empty_day(emp, g["부서"].iloc[0], day)
        row.update({
            "출근": rec.at[in_row, "출입일시"] if in_row is not None else pd.NaT,
            "퇴근": rec.at[out_row, "출입일시"] if out_row is not None else pd.NaT,
            "태그수": len(g), "출근행": in_row, "퇴근행": out_row, "마지막태그": last,
        })
        rows[(emp, day)] = row

    # 직원별 재직 구간(첫 기록~마지막 기록)의 근무일을 채운다
    dept_of = rec.groupby("직원")["부서"].first()
    for emp, g in rec.groupby("직원"):
        d, last = g["일자"].min(), g["일자"].max()
        while d <= last:
            if not _is_holiday(d, rule, holidays) and (emp, d) not in rows:
                rows[(emp, d)] = _empty_day(emp, dept_of[emp], d)
            d += timedelta(days=1)

    # 하이웍스 근태 붙이기 (이름 기준)
    leave_map: dict[tuple, pd.DataFrame] = {}
    mates: dict[tuple, list[str]] = {}
    if leaves is not None and not leaves.empty:
        mates = _companions(leaves)
        emp_by_name = rec.drop_duplicates("이름").set_index("이름")["직원"]
        for (name, day), g in leaves.groupby(["이름", "일자"]):
            emp = emp_by_name.get(name)
            if emp is None:
                continue
            leave_map[(emp, day)] = g
            if (emp, day) not in rows:
                rows[(emp, day)] = _empty_day(emp, dept_of[emp], day)

    # 기입·수정 값 (이 기간·이 직원들 것만)
    ov_map: dict[tuple, dict] = {}
    if overrides is not None and not overrides.empty:
        lo, hi = rec["일자"].min(), rec["일자"].max()
        for o in overrides.to_dict("records"):
            key = (o["직원"], o["일자"])
            if o["직원"] in dept_of.index and lo <= o["일자"] <= hi:
                ov_map[key] = o
                if key not in rows:
                    rows[key] = _empty_day(o["직원"], dept_of[o["직원"]], o["일자"])

    out = pd.DataFrame(list(rows.values()))
    out["출근"] = pd.to_datetime(out["출근"])
    out["퇴근"] = pd.to_datetime(out["퇴근"])
    out["마지막태그"] = pd.to_datetime(out["마지막태그"])
    out["출근행"] = out["출근행"].astype(object)
    out["퇴근행"] = out["퇴근행"].astype(object)
    out["요일"] = out["일자"].map(lambda d: WEEKDAYS_KR[d.weekday()])
    out["휴일"] = out["일자"].map(lambda d: _is_holiday(d, rule, holidays)).astype(bool)

    def leave_info(r):
        g = leave_map.get((r["직원"], r["일자"]))
        if g is None:
            return "", "", 0.0
        types = list(dict.fromkeys(g["유형"]))
        content = " / ".join(dict.fromkeys(c for c in g["내용"] if c))
        return ", ".join(types), content, sum(LEAVE_DAY_VALUE.get(t, 0.0) for t in types)

    info = out.apply(leave_info, axis=1, result_type="expand")
    out["근태"], out["근태내용"], out["휴가일수"] = info[0], info[1], info[2]
    names = rec.drop_duplicates("직원").set_index("직원")["이름"]
    out["동행"] = [", ".join(mates.get((names.get(e, e), d), [])) for e, d in zip(out["직원"], out["일자"])]

    def _types(s: str) -> list[str]:
        return [t for t in s.split(", ") if t]

    # 출장·교육·외근 날 하이웍스 시각으로 채우기
    out["출근출처"] = out["출근"].notna().map({True: "캡스", False: ""})
    out["퇴근출처"] = out["퇴근"].notna().map({True: "캡스", False: ""})
    day0 = pd.to_datetime(out["일자"])
    start_std = day0 + pd.Timedelta(minutes=_minutes(rule.start))
    end_std = day0 + pd.Timedelta(minutes=_minutes(rule.end))
    travel = out["근태"].map(lambda s: any(t in TRAVEL_TYPES for t in _types(s))).astype(bool) & ~out["휴일"]
    fill_in = travel & (out["출근"].isna() | (out["출근"] > start_std))
    fill_out = travel & (out["퇴근"].isna() | (out["퇴근"] < end_std))
    out.loc[fill_in, "출근"] = start_std[fill_in]
    out.loc[fill_in, "출근행"] = None
    out.loc[fill_in, "출근출처"] = "하이웍스"
    out.loc[fill_out, "퇴근"] = end_std[fill_out]
    out.loc[fill_out, "퇴근행"] = None
    out.loc[fill_out, "퇴근출처"] = "하이웍스"

    # 웹에서 기입·수정한 값 (NULL이면 그대로, ''이면 비움)
    for c in OVERRIDE_TEXT:
        out[c] = None
    out["수정자"] = ""
    for (emp, day), o in ov_map.items():
        hit = out.index[(out["직원"] == emp) & (out["일자"] == day)]
        if not len(hit):
            continue
        i = hit[0]
        for kind in ("출근", "퇴근"):
            v = o.get(kind)
            if v is None:
                continue
            secs = parse_clock(v)
            out.at[i, kind] = (pd.Timestamp(day) + pd.Timedelta(seconds=secs)) if secs is not None else pd.NaT
            out.at[i, f"{kind}행"] = None
            out.at[i, f"{kind}출처"] = "수기입력" if secs is not None else ""
        for c in OVERRIDE_TEXT:
            if o.get(c[3:]) is not None:
                out.at[i, c] = o[c[3:]]
        out.at[i, "수정자"] = o.get("수정자") or ""

    out["체류시간(h)"] = ((out["퇴근"] - out["출근"]).dt.total_seconds() / 3600).round(2)
    excused = out["근태"].map(lambda s: any(t in EXCUSED_TYPES for t in _types(s))).astype(bool)
    start_at = start_std + pd.Timedelta(minutes=rule.grace_min)
    workday = ~out["휴일"]
    out["지각"] = workday & ~excused & out["출근"].notna() & (out["출근"] > start_at)
    out["조퇴"] = workday & ~excused & out["퇴근"].notna() & (out["퇴근"] < end_std)
    out["상태"] = out.apply(_status, axis=1)
    return out[DAY_COLUMNS].sort_values(["직원", "일자"]).reset_index(drop=True)


def _status(r) -> str:
    types = [t for t in r["근태"].split(", ") if t]
    has_in, has_out = pd.notna(r["출근"]), pd.notna(r["퇴근"])
    if r["휴일"]:
        if has_in or has_out:
            return "휴일근무"
        if "휴일근무" in types:
            return "휴일근무"  # 캡스 기록은 없지만 휴일근무를 올림 (현장 근무 등)
        other = [t for t in types if t != "연장근무"]
        return other[0] if other else "휴일"
    if not has_in and not has_out:
        full = [t for t in types if t in FULL_DAY_TYPES]
        if full:
            return full[0]
        return types[0] if types else "기록 없음"
    if not has_in:
        return "출근 기록 없음"
    if not has_out:
        return "퇴근 기록 없음"
    if r["지각"] and r["조퇴"]:
        return "지각·조퇴"
    if r["지각"]:
        return "지각"
    if r["조퇴"]:
        return "조퇴"
    return "정상"


# ---------------------------------------------------------------- 요약
def _mean_clock(ts: pd.Series) -> str:
    ts = ts.dropna()
    if ts.empty:
        return ""
    return _hhmm(int(round((ts.dt.hour * 60 + ts.dt.minute).mean())))


def employee_summary(days: pd.DataFrame, roster: pd.DataFrame | None = None) -> pd.DataFrame:
    """직원별 출근일수, 평균 출퇴근 시각, 지각/조퇴/휴가 집계. 명단 순서로 정렬."""
    cols = ["직원", "부서", "출근일수", "평균출근", "평균퇴근", "평균체류(h)", "지각", "조퇴",
            "기록 없음", "태그 누락", "휴일근무", "휴가사용(일)", "출장·교육"]
    if days.empty:
        return pd.DataFrame(columns=cols)
    rows = []
    for emp, g in days.groupby("직원", sort=False):
        work = g[~g["휴일"]]
        rows.append({
            "직원": emp,
            "부서": g["부서"].iloc[0],
            "출근일수": int((g["출근"].notna() | g["퇴근"].notna()).sum()),
            "평균출근": _mean_clock(work["출근"]),
            "평균퇴근": _mean_clock(work["퇴근"]),
            "평균체류(h)": round(work["체류시간(h)"].mean(), 2) if work["체류시간(h)"].notna().any() else None,
            "지각": int(g["지각"].sum()),
            "조퇴": int(g["조퇴"].sum()),
            "기록 없음": int((g["상태"] == "기록 없음").sum()),
            "태그 누락": int(g["상태"].isin(["출근 기록 없음", "퇴근 기록 없음"]).sum()),
            "휴일근무": int((g["상태"] == "휴일근무").sum()),
            "휴가사용(일)": float(g["휴가일수"].sum()),
            "출장·교육": int(g["근태"].str.contains("출장|교육|외근").sum()),
        })
    out = pd.DataFrame(rows, columns=cols)
    return order_by_roster(out, roster)


def order_by_roster(df: pd.DataFrame, roster: pd.DataFrame | None, col: str = "직원") -> pd.DataFrame:
    """명단 순서대로 정렬 (명단에 없는 사람은 뒤에 가나다순)."""
    if roster is None or roster.empty:
        return df.sort_values(col).reset_index(drop=True)
    order = {n: i for i, n in enumerate(roster["이름"])}
    tmp = df.assign(_순서=df[col].map(lambda n: order.get(n, len(order))))
    return tmp.sort_values(["_순서", col]).drop(columns="_순서").reset_index(drop=True)


def hourly_by_weekday(records: pd.DataFrame) -> pd.DataFrame:
    """요일(행) x 시간대(열) 태그 건수 표 (경비 설정/해제 제외)."""
    rec = records[~records["모드"].isin(ALARM_MODES)]
    if rec.empty:
        return pd.DataFrame()
    ts = rec["출입일시"]
    table = pd.crosstab(ts.dt.day_of_week, ts.dt.hour)
    table = table.reindex(index=range(7), columns=range(24), fill_value=0)
    table.index = WEEKDAYS_KR
    table.columns = [f"{h:02d}시" for h in range(24)]
    return table


def daily_headcount(days: pd.DataFrame) -> pd.DataFrame:
    """날짜별 출근 인원·지각·휴가 인원."""
    if days.empty:
        return pd.DataFrame(columns=["일자", "출근인원", "지각인원", "휴가인원"])
    g = days.groupby("일자")
    return pd.DataFrame({
        "출근인원": g["출근"].count(),
        "지각인원": g["지각"].sum(),
        "휴가인원": g["휴가일수"].apply(lambda s: int((s > 0).sum())),
    }).reset_index()


def month_status(days: pd.DataFrame) -> pd.DataFrame:
    """월별 상태 건수 (정상/지각/조퇴/연차 등)."""
    if days.empty:
        return pd.DataFrame(columns=["월", "상태", "건수"])
    m = pd.to_datetime(days["일자"]).dt.strftime("%Y-%m")
    return days.assign(월=m).groupby(["월", "상태"]).size().reset_index(name="건수")


# ---------------------------------------------------------------- 대시보드
MISSING_LABELS = {"기록 없음": "미출근", "출근 기록 없음": "출근 누락", "퇴근 기록 없음": "퇴근 누락"}


def _break_hours(stay_h: float) -> float:
    """휴게시간: 8시간 이상 1시간, 4시간 이상 30분."""
    return 1.0 if stay_h >= 8 else 0.5 if stay_h >= 4 else 0.0


def day_snapshot(days: pd.DataFrame, day: date) -> dict[str, int]:
    """기준일의 출근·지각·미출근·휴가 인원."""
    d = days[days["일자"] == day]
    present = d["출근"].notna() | d["퇴근"].notna()
    on_leave = d["근태"].map(lambda s: any(t in LEAVE_DAY_VALUE or t in FULL_DAY_TYPES for t in s.split(", ")))
    return {
        "출근": int(present.sum()),
        "지각": int(d["지각"].sum()),
        "미출근": int((d["상태"] == "기록 없음").sum()),
        "휴가": int(on_leave.sum()) if len(d) else 0,
    }


def missing_rows(days: pd.DataFrame) -> pd.DataFrame:
    """출퇴근 누락 목록 (최근 날짜 먼저)."""
    m = days[days["상태"].isin(MISSING_LABELS)].copy()
    m["표시"] = m["상태"].map(MISSING_LABELS)
    return m.sort_values(["일자", "직원"], ascending=[False, True])[["직원", "부서", "일자", "요일", "표시"]]


def work_hours_report(days: pd.DataFrame, rule: WorkRule, roster: pd.DataFrame | None = None) -> pd.DataFrame:
    """직원별 소정·실제·연장·휴일 근로시간(h)과 주의 사유.

    소정근로 = 평일 수 x (퇴근기준 - 출근기준 - 휴게 1h)
    실제근로 = 출퇴근이 모두 있는 평일의 (퇴근 - max(출근, 출근기준) - 휴게)
    연장근로 = 평일 퇴근이 기준+연장기준분 이후인 날의 (퇴근 - 퇴근기준), 단위 절사
    휴일근로 = 휴일 (퇴근 - 출근 - 휴게), 단위 절사
    """
    cols = ["직원", "부서", "소정근로(h)", "실제근로(h)", "연장근로(h)", "휴일근로(h)", "지각", "누락", "주의사유"]
    if days.empty:
        return pd.DataFrame(columns=cols)
    std_day = (_minutes(rule.end) - _minutes(rule.start)) / 60 - 1
    rows = []
    for emp, g in days.groupby("직원", sort=False):
        both = g[g["출근"].notna() & g["퇴근"].notna()]
        # 평일은 출근 기준(08:30) 전에 온 시간은 근로로 보지 않음 (조출은 승인 기반이라 제외)
        start_at = pd.to_datetime(both["일자"]) + pd.Timedelta(minutes=_minutes(rule.start))
        begin = both["출근"].where(both["휴일"] | (both["출근"] > start_at), start_at)
        span = ((both["퇴근"] - begin).dt.total_seconds() / 3600).clip(lower=0)
        net = span - span.map(_break_hours)
        wd = both[~both["휴일"]]
        over_min = (wd["퇴근"] - (pd.to_datetime(wd["일자"]) + pd.Timedelta(minutes=_minutes(rule.end))))
        over_min = over_min.dt.total_seconds() / 60
        overtime = (over_min.where(over_min >= rule.overtime_min, 0) // rule.round_min * rule.round_min).sum() / 60
        hol = net[both["휴일"]]
        holiday = (hol * 60 // rule.round_min * rule.round_min).sum() / 60
        late = int(g["지각"].sum())
        miss = int(g["상태"].isin(MISSING_LABELS).sum())
        std = float((~g["휴일"]).sum() * std_day)
        actual = float(net[~both["휴일"]].sum())
        reasons = []
        if late >= 3:
            reasons.append(f"지각 {late}회")
        if miss >= 3:
            reasons.append(f"출퇴근 누락 {miss}회")
        if overtime + holiday >= 12:
            reasons.append(f"연장·휴일 {overtime + holiday:g}h")
        rows.append({"직원": emp, "부서": g["부서"].iloc[0], "소정근로(h)": std, "실제근로(h)": actual,
                     "연장근로(h)": float(overtime), "휴일근로(h)": float(holiday), "지각": late, "누락": miss,
                     "주의사유": ", ".join(reasons)})
    return order_by_roster(pd.DataFrame(rows, columns=cols), roster)


def leave_status(leaves: pd.DataFrame | None, names: list[str], upto: date) -> pd.DataFrame:
    """올해 1월 1일 ~ 기준일 연차 사용일수(연차 1, 반차 0.5, 반반차 0.25)와 공가 일수."""
    out = pd.DataFrame({"이름": names})
    if leaves is None or leaves.empty:
        out["연차사용"], out["공가"] = 0.0, 0.0
        return out
    lv = leaves[(leaves["이름"].isin(names)) & (leaves["일자"] >= date(upto.year, 1, 1)) & (leaves["일자"] <= upto)]
    annual = lv.assign(v=lv["유형"].map(LEAVE_DAY_VALUE).fillna(0.0)).groupby("이름")["v"].sum()
    special = lv[lv["유형"] == "공가"].drop_duplicates(["이름", "일자"]).groupby("이름").size()
    out["연차사용"] = out["이름"].map(annual).fillna(0.0).astype(float)
    out["공가"] = out["이름"].map(special).fillna(0).astype(float)
    return out


def attention(days: pd.DataFrame, report: pd.DataFrame, outsiders: list[str]) -> list[tuple[str, list[str]]]:
    """관리가 필요한 직원 분류 -> [(항목, 이름 목록)]"""
    late = report.loc[report["지각"] >= 3, "직원"].tolist()
    miss = report.loc[report["누락"] >= 3, "직원"].tolist()
    heavy = report.loc[report["연장근로(h)"] + report["휴일근로(h)"] >= 12, "직원"].tolist()
    holiday = sorted(days.loc[days["상태"] == "휴일근무", "직원"].unique().tolist())
    return [
        ("지각 3회 이상", late),
        ("출퇴근 누락 3회 이상", miss),
        ("연장·휴일근로 12시간 이상", heavy),
        ("휴일 출근 직원", holiday),
        ("명단에 없는 출입자", outsiders),
    ]


# ---------------------------------------------------------------- 일일 현황
LEAVE_LIKE = {"연차", "반차", "반반차", "공가", "외출"}
TRIP_LIKE = {"출장", "교육", "외근"}


def daily_board(days: pd.DataFrame, leaves: pd.DataFrame | None, staff: list[tuple[str, str]], day: date,
                rule: WorkRule, now: pd.Timestamp | None = None, holiday: bool = False) -> pd.DataFrame:
    """기준일 직원별 현황판.

    days   : build_days 결과 (기준일을 포함한 기간)
    staff  : [(직원, 부서)] 기준일에 재직 중인 직원
    now    : 오늘이면 현재 시각 (아직 퇴근 전인 사람을 '근무 중'으로)
    holiday: 주말·공휴일이면 True — 기록 없는 사람은 '휴무', 출근했거나 휴일근무를 올린 사람은 '휴일근무'
    """
    cols = ["직원", "부서", "출근", "퇴근", "근태", "근태내용", "구분", "상태", "지각", "연장"]
    d = days[days["일자"] == day].set_index("직원") if len(days) else pd.DataFrame()
    lv = leaves[leaves["일자"] == day] if leaves is not None and len(leaves) else pd.DataFrame(columns=["이름", "유형", "내용"])
    end_at = pd.Timestamp(day) + pd.Timedelta(minutes=_minutes(rule.end))
    rows = []
    for emp, dept in staff:
        r = d.loc[emp] if emp in d.index else None
        mine = lv[lv["이름"] == emp]
        types = list(dict.fromkeys(mine["유형"])) if len(mine) else (
            [t for t in str(r["근태"]).split(", ") if t] if r is not None else [])
        content = " / ".join(dict.fromkeys(str(c).split("\n")[0] for c in mine["내용"] if c)) if len(mine) else (
            str(r["근태내용"]).split("\n")[0] if r is not None else "")
        t_in = r["출근"] if r is not None else pd.NaT
        t_out = r["퇴근"] if r is not None else pd.NaT
        if r is not None and r["출근출처"] != "캡스":
            t_in = t_in if r["출근출처"] == "수기입력" else pd.NaT  # 하이웍스로 채운 시각은 현황판에서 제외
        if r is not None and r["퇴근출처"] != "캡스":
            t_out = t_out if r["퇴근출처"] == "수기입력" else pd.NaT
        late = bool(r["지각"]) if r is not None else False

        present = pd.notna(t_in) or pd.notna(t_out)
        if holiday:
            if present or "휴일근무" in types:
                group = "휴일근무"
            elif any(t in LEAVE_LIKE | TRIP_LIKE for t in types):
                group = "휴가" if any(t in LEAVE_LIKE for t in types) else "출장·교육"
            else:
                group = "휴무"
        elif any(t in TRIP_LIKE for t in types):
            group = "출장·교육"
        elif any(t in {"연차", "공가"} for t in types) and not present:
            group = "휴가"
        elif present and pd.isna(t_out):
            group = "근무 중" if (now is not None and now < end_at + pd.Timedelta(hours=4)) else "퇴근 기록 없음"
        elif present:
            group = "퇴근"
        elif any(t in LEAVE_LIKE for t in types):
            group = "휴가"
        else:
            group = "기록 없음"
        status = "지각" if late else ({"퇴근": "정상"}.get(group, group))
        rows.append({"직원": emp, "부서": dept, "출근": t_in, "퇴근": t_out, "근태": ", ".join(types),
                     "근태내용": content, "구분": group, "상태": status, "지각": late,
                     "연장": "연장근무" in types})
    return pd.DataFrame(rows, columns=cols)


def board_counts(board: pd.DataFrame) -> dict[str, int]:
    has_leave = board["근태"].map(lambda s: any(t in LEAVE_LIKE for t in s.split(", ") if t))
    return {
        "대상": int((board["구분"] != "휴무").sum()),
        "출근": int(board["출근"].notna().sum()),
        "퇴근": int(board["퇴근"].notna().sum()),
        "지각": int(board["지각"].sum()),
        "휴가": int(has_leave.sum()),
        "출장·교육": int((board["구분"] == "출장·교육").sum()),
        "휴일근무": int((board["구분"] == "휴일근무").sum()),
        "연장근무": int(board["연장"].sum()),
        "기록 없음": int((board["구분"] == "기록 없음").sum()),
        "근무 중": int((board["구분"] == "근무 중").sum()),
    }