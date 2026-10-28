"""직원 명부 (입사·퇴사) 적용: 캡스 이름 연결, 부서 채우기, 재직 기간."""
from __future__ import annotations

from datetime import date

import pandas as pd

from .store import EMP_COLS


def seed_from(roster: pd.DataFrame | None, records: pd.DataFrame | None, ranks: dict[str, str]) -> pd.DataFrame:
    """처음 한 번: 근태현황 '명단'으로 직원 명부를 만든다 (입사일·퇴사일은 비워 둠)."""
    rows = []
    if roster is not None and not roster.empty:
        for i, r in enumerate(roster.itertuples(index=False), 1):
            rows.append({"이름": r.이름, "캡스이름": "", "사번": "", "부서": r.부서, "직급": ranks.get(r.이름, ""),
                         "입사일": None, "퇴사일": None, "비고": "", "순서": i})
    return pd.DataFrame(rows, columns=EMP_COLS)


def first_last_seen(records: pd.DataFrame | None) -> pd.DataFrame:
    """이름별 첫·마지막 캡스 출입일 (입사·퇴사일 참고용)."""
    if records is None or records.empty:
        return pd.DataFrame(columns=["이름", "첫 출입", "마지막 출입"])
    g = records.groupby("이름")["일자"]
    return pd.DataFrame({"첫 출입": g.min(), "마지막 출입": g.max()}).reset_index()


def apply_employees(records: pd.DataFrame | None, emps: pd.DataFrame | None) -> pd.DataFrame | None:
    """캡스 이름이 다르게 찍히는 직원은 명부 이름으로 바꾸고, 명부의 부서를 채운다."""
    if records is None or emps is None or emps.empty:
        return records
    out = records.copy()
    alias = {r.캡스이름: r.이름 for r in emps.itertuples() if r.캡스이름 and r.캡스이름 != r.이름}
    if alias:
        hit = out["이름"].isin(alias)
        out.loc[hit, "이름"] = out.loc[hit, "이름"].map(alias)
        out.loc[hit & (out["사번"] == ""), "직원"] = out.loc[hit & (out["사번"] == ""), "이름"]
    dept = {r.이름: r.부서 for r in emps.itertuples() if r.부서}
    mapped = out["이름"].map(dept)
    out["부서"] = mapped.where(mapped.notna(), out["부서"])
    return out


def employment(emps: pd.DataFrame | None) -> dict[str, tuple[date | None, date | None]]:
    """이름 -> (입사일, 퇴사일). 비어 있으면 None (제한 없음)."""
    if emps is None or emps.empty:
        return {}
    return {r.이름: (r.입사일, r.퇴사일) for r in emps.itertuples()}


def is_employed(span: tuple[date | None, date | None] | None, day: date) -> bool:
    """퇴사일은 마지막 근무일로 본다 (그날까지 재직)."""
    if span is None:
        return True
    start, end = span
    return (start is None or day >= start) and (end is None or day <= end)


def active_names(emps: pd.DataFrame | None, lo: date, hi: date) -> list[str]:
    """기간 [lo, hi] 중 하루라도 재직한 직원 (명부 순서)."""
    if emps is None or emps.empty:
        return []
    return [r.이름 for r in emps.itertuples()
            if (r.입사일 is None or r.입사일 <= hi) and (r.퇴사일 is None or r.퇴사일 >= lo)]


def status_label(r, today: date) -> str:
    if r["퇴사일"] is not None and r["퇴사일"] < today:
        return "퇴사"
    if r["입사일"] is not None and r["입사일"] > today:
        return "입사 예정"
    return "재직"
