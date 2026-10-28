"""공용 저장소 (SQLite 파일 하나). 관리팀 모두가 같은 데이터를 본다.

테이블
- records   : 캡스 출입기록 (출입일시·이름·모드가 같으면 하나만)
- roster    : 명단 (근태현황 파일을 올릴 때마다 교체)
- leaves    : 하이웍스 근태 (근태현황 파일을 올릴 때마다 교체)
- uploads   : 업로드 이력
- overrides : 웹에서 기입·수정한 값 (직원·일자 단위, NULL = 수정 안 함)
- settings  : 근무 기준·공휴일 등 공용 설정 (JSON)
- users     : 로그인 계정
- meta      : 데이터 버전 (바뀔 때마다 +1, 화면 캐시 갱신용)
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, time
from pathlib import Path

import pandas as pd

from .loader import finalize_records

DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "db" / "caps.sqlite"

REC_COLS = ["출입일시", "이름", "사번", "부서", "출입문", "모드", "인증", "근무형태", "근무지", "비고"]
LEAVE_COLS = ["일자", "이름", "부서", "직급", "유형", "내용", "비고", "시트"]
OVERRIDE_FIELDS = ["출근", "출근근무형태", "퇴근", "퇴근근무형태", "근무지", "비고"]

_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS records (
  출입일시 TEXT NOT NULL, 이름 TEXT NOT NULL, 사번 TEXT, 부서 TEXT, 출입문 TEXT, 모드 TEXT NOT NULL DEFAULT '',
  인증 TEXT, 근무형태 TEXT, 근무지 TEXT, 비고 TEXT, 업로드ID INTEGER,
  UNIQUE (출입일시, 이름, 모드)
);
CREATE INDEX IF NOT EXISTS ix_records_day ON records (출입일시);
CREATE TABLE IF NOT EXISTS roster (순서 INTEGER, 부서 TEXT, 이름 TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS leaves (일자 TEXT, 이름 TEXT, 부서 TEXT, 직급 TEXT, 유형 TEXT, 내용 TEXT, 비고 TEXT, 시트 TEXT);
CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 종류 TEXT, 파일 TEXT, 시트 TEXT, 건수 INTEGER, 새기록 INTEGER,
  기간 TEXT, 사용자 TEXT, 일시 TEXT
);
CREATE TABLE IF NOT EXISTS overrides (
  직원 TEXT NOT NULL, 일자 TEXT NOT NULL, {", ".join(f"{f} TEXT" for f in OVERRIDE_FIELDS)},
  수정자 TEXT, 수정일시 TEXT, PRIMARY KEY (직원, 일자)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (아이디 TEXT PRIMARY KEY, 이름 TEXT, 역할 TEXT, 해시 TEXT, 생성일시 TEXT);
CREATE TABLE IF NOT EXISTS reports (
  일자 TEXT PRIMARY KEY, 작성자 TEXT, 수정일시 TEXT, 발송일시 TEXT, 발송자 TEXT
);
CREATE TABLE IF NOT EXISTS report_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 일자 TEXT NOT NULL, 섹션 TEXT NOT NULL, 순서 INTEGER,
  부서 TEXT, 직급 TEXT, 성명 TEXT, 유형 TEXT, 제목 TEXT, 상세 TEXT, 값 TEXT, 비고 TEXT
);
CREATE INDEX IF NOT EXISTS ix_report_rows_day ON report_rows (일자);
CREATE TABLE IF NOT EXISTS mail_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 일자 TEXT, 제목 TEXT, 받는사람 TEXT, 참조 TEXT,
  결과 TEXT, 사용자 TEXT, 일시 TEXT
);
CREATE TABLE IF NOT EXISTS employees (
  이름 TEXT PRIMARY KEY, 캡스이름 TEXT, 사번 TEXT, 부서 TEXT, 직급 TEXT, 입사일 TEXT, 퇴사일 TEXT,
  비고 TEXT, 순서 INTEGER, 수정자 TEXT, 수정일시 TEXT
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER);
INSERT OR IGNORE INTO meta VALUES ('version', 0);
"""


def db_path() -> Path:
    return Path(os.environ.get("CAPS_DB", DEFAULT_DB))


@contextmanager
def connect(path: Path | None = None):
    p = Path(path or db_path())
    p.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(p, timeout=30)
    try:
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript(_SCHEMA)
        yield con
        con.commit()
    finally:
        con.close()


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _bump(con) -> None:
    con.execute("UPDATE meta SET value = value + 1 WHERE key = 'version'")


def version(path: Path | None = None) -> int:
    with connect(path) as con:
        return int(con.execute("SELECT value FROM meta WHERE key='version'").fetchone()[0])


def _q(cols) -> str:
    return ", ".join(f'"{c}"' for c in cols)


# ---------------------------------------------------------------- 캡스 기록
def save_caps(records: pd.DataFrame, info: dict, user: str, path: Path | None = None) -> int:
    """캡스 기록을 저장한다. 이미 있는 기록(출입일시·이름·모드 같음)은 건너뛴다. 새로 들어간 건수를 돌려준다."""
    df = records.copy()
    df["출입일시"] = df["출입일시"].dt.strftime("%Y-%m-%d %H:%M:%S")
    df = df[REC_COLS].fillna("")
    with connect(path) as con:
        cur = con.execute(
            f"INSERT INTO uploads (종류, 파일, 시트, 건수, 기간, 사용자, 일시) VALUES ('캡스', ?, ?, ?, ?, ?, ?)",
            (info.get("파일", ""), info.get("원본 시트", ""), len(df), info.get("기간", ""), user, _now()))
        upload_id = cur.lastrowid
        before = con.total_changes
        con.executemany(
            f"INSERT OR IGNORE INTO records ({_q(REC_COLS)}, 업로드ID) VALUES ({', '.join('?' * len(REC_COLS))}, ?)",
            [tuple(r) + (upload_id,) for r in df.itertuples(index=False)])
        added = con.total_changes - before
        con.execute("UPDATE uploads SET 새기록 = ? WHERE id = ?", (added, upload_id))
        _bump(con)
    return added


def load_records(path: Path | None = None) -> pd.DataFrame:
    with connect(path) as con:
        df = pd.read_sql_query(f"SELECT {_q(REC_COLS)} FROM records ORDER BY 출입일시", con)
    df["출입일시"] = pd.to_datetime(df["출입일시"])
    return finalize_records(df)


def delete_upload(upload_id: int, path: Path | None = None) -> int:
    """업로드 하나로 들어온 캡스 기록을 지운다."""
    with connect(path) as con:
        n = con.execute("DELETE FROM records WHERE 업로드ID = ?", (upload_id,)).rowcount
        con.execute("DELETE FROM uploads WHERE id = ?", (upload_id,))
        _bump(con)
    return n


def delete_month(month: str, path: Path | None = None) -> int:
    """'2026-09' 달의 캡스 기록을 모두 지운다."""
    with connect(path) as con:
        n = con.execute("DELETE FROM records WHERE substr(출입일시, 1, 7) = ?", (month,)).rowcount
        _bump(con)
    return n


# ---------------------------------------------------------------- 명단·하이웍스
def save_hiworks(roster: pd.DataFrame, leaves: pd.DataFrame, filename: str, user: str,
                 path: Path | None = None) -> None:
    """근태현황 파일은 1월부터 누적된 파일이라 올릴 때마다 통째로 교체한다."""
    lv = leaves.copy()
    lv["일자"] = lv["일자"].astype(str)
    with connect(path) as con:
        if not roster.empty:
            con.execute("DELETE FROM roster")
            con.executemany("INSERT OR REPLACE INTO roster VALUES (?, ?, ?)",
                            [(int(r.순서), r.부서, r.이름) for r in roster.itertuples(index=False)])
        con.execute("DELETE FROM leaves")
        con.executemany(f"INSERT INTO leaves ({_q(LEAVE_COLS)}) VALUES ({', '.join('?' * len(LEAVE_COLS))})",
                        [tuple(r) for r in lv[LEAVE_COLS].fillna("").itertuples(index=False)])
        span = f"{lv['일자'].min()} ~ {lv['일자'].max()}" if len(lv) else "-"
        con.execute(
            "INSERT INTO uploads (종류, 파일, 시트, 건수, 새기록, 기간, 사용자, 일시) VALUES ('근태현황', ?, ?, ?, ?, ?, ?, ?)",
            (filename, f"명단 {len(roster)}명", len(lv), len(lv), span, user, _now()))
        _bump(con)


def load_roster(path: Path | None = None) -> pd.DataFrame:
    with connect(path) as con:
        return pd.read_sql_query("SELECT 순서, 부서, 이름 FROM roster ORDER BY 순서", con)


def load_leaves(path: Path | None = None) -> pd.DataFrame:
    with connect(path) as con:
        df = pd.read_sql_query(f"SELECT {_q(LEAVE_COLS)} FROM leaves", con)
    df["일자"] = pd.to_datetime(df["일자"]).dt.date
    return df


def load_uploads(path: Path | None = None) -> pd.DataFrame:
    with connect(path) as con:
        return pd.read_sql_query("SELECT * FROM uploads ORDER BY id DESC", con)


# ---------------------------------------------------------------- 기입·수정
def load_overrides(path: Path | None = None) -> pd.DataFrame:
    with connect(path) as con:
        df = pd.read_sql_query("SELECT * FROM overrides", con)
    df["일자"] = pd.to_datetime(df["일자"]).dt.date
    return df


def save_overrides(changes: list[dict], user: str, path: Path | None = None) -> int:
    """changes: [{"직원", "일자", 필드: 값, ...}] 바뀐 필드만. 기존 수정값과 합친다."""
    with connect(path) as con:
        for ch in changes:
            key = (ch["직원"], str(ch["일자"]))
            row = con.execute(f"SELECT {_q(OVERRIDE_FIELDS)} FROM overrides WHERE 직원=? AND 일자=?", key).fetchone()
            cur = dict(zip(OVERRIDE_FIELDS, row)) if row else {f: None for f in OVERRIDE_FIELDS}
            cur.update({f: ch[f] for f in OVERRIDE_FIELDS if f in ch})
            con.execute(
                f"INSERT OR REPLACE INTO overrides (직원, 일자, {_q(OVERRIDE_FIELDS)}, 수정자, 수정일시) "
                f"VALUES (?, ?, {', '.join('?' * len(OVERRIDE_FIELDS))}, ?, ?)",
                key + tuple(cur[f] for f in OVERRIDE_FIELDS) + (user, _now()))
        if changes:
            _bump(con)
    return len(changes)


def clear_overrides(keys: list[tuple[str, date]], path: Path | None = None) -> None:
    with connect(path) as con:
        con.executemany("DELETE FROM overrides WHERE 직원=? AND 일자=?", [(e, str(d)) for e, d in keys])
        _bump(con)


# ---------------------------------------------------------------- 설정
def _jsonable(v):
    if isinstance(v, (date, time)):
        return v.isoformat()
    raise TypeError(type(v))


def get_setting(key: str, default=None, path: Path | None = None):
    with connect(path) as con:
        row = con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return json.loads(row[0]) if row else default


def set_setting(key: str, value, path: Path | None = None) -> None:
    with connect(path) as con:
        con.execute("INSERT OR REPLACE INTO settings VALUES (?, ?)",
                    (key, json.dumps(value, ensure_ascii=False, default=_jsonable)))
        _bump(con)


# ---------------------------------------------------------------- 사용자
def list_users(path: Path | None = None) -> pd.DataFrame:
    with connect(path) as con:
        return pd.read_sql_query("SELECT 아이디, 이름, 역할, 생성일시 FROM users ORDER BY 생성일시", con)


def get_user(user_id: str, path: Path | None = None) -> dict | None:
    with connect(path) as con:
        row = con.execute("SELECT 아이디, 이름, 역할, 해시 FROM users WHERE 아이디=?", (user_id,)).fetchone()
    return dict(zip(["아이디", "이름", "역할", "해시"], row)) if row else None


def upsert_user(user_id: str, name: str, role: str, password_hash: str | None, path: Path | None = None) -> None:
    with connect(path) as con:
        old = con.execute("SELECT 해시, 생성일시 FROM users WHERE 아이디=?", (user_id,)).fetchone()
        h = password_hash or (old[0] if old else None)
        if not h:
            raise ValueError("새 사용자는 비밀번호가 필요합니다.")
        con.execute("INSERT OR REPLACE INTO users VALUES (?, ?, ?, ?, ?)",
                    (user_id, name, role, h, old[1] if old else _now()))


def delete_user(user_id: str, path: Path | None = None) -> None:
    with connect(path) as con:
        con.execute("DELETE FROM users WHERE 아이디=?", (user_id,))


def user_count(path: Path | None = None) -> int:
    with connect(path) as con:
        return int(con.execute("SELECT COUNT(*) FROM users").fetchone()[0])


# ---------------------------------------------------------------- 일일 근태현황 보고서
REPORT_COLS = ["섹션", "순서", "부서", "직급", "성명", "유형", "제목", "상세", "값", "비고"]


def load_report_rows(day: date | None = None, path: Path | None = None) -> pd.DataFrame:
    """day가 없으면 전체 (근태 판정용)."""
    with connect(path) as con:
        if day is None:
            df = pd.read_sql_query(f"SELECT 일자, {_q(REPORT_COLS)} FROM report_rows ORDER BY 일자, 섹션, 순서", con)
        else:
            df = pd.read_sql_query(f"SELECT 일자, {_q(REPORT_COLS)} FROM report_rows WHERE 일자=? ORDER BY 섹션, 순서",
                                   con, params=(str(day),))
    df["일자"] = pd.to_datetime(df["일자"]).dt.date
    return df.fillna("")


def report_info(day: date, path: Path | None = None) -> dict | None:
    with connect(path) as con:
        row = con.execute("SELECT 일자, 작성자, 수정일시, 발송일시, 발송자 FROM reports WHERE 일자=?", (str(day),)).fetchone()
    return dict(zip(["일자", "작성자", "수정일시", "발송일시", "발송자"], row)) if row else None


def report_days(path: Path | None = None) -> list[date]:
    with connect(path) as con:
        rows = con.execute("SELECT 일자 FROM reports ORDER BY 일자 DESC").fetchall()
    return [date.fromisoformat(r[0]) for r in rows]


def save_report(day: date, rows: pd.DataFrame, user: str, path: Path | None = None) -> None:
    """그날 보고서를 통째로 교체 저장한다 (행 추가·수정·삭제 모두 반영)."""
    df = rows.copy()
    for c in REPORT_COLS:
        if c not in df:
            df[c] = ""
    df = df[REPORT_COLS].fillna("")
    with connect(path) as con:
        con.execute("DELETE FROM report_rows WHERE 일자=?", (str(day),))
        con.executemany(
            f"INSERT INTO report_rows (일자, {_q(REPORT_COLS)}) VALUES (?, {', '.join('?' * len(REPORT_COLS))})",
            [(str(day),) + tuple(str(v) for v in r) for r in df.itertuples(index=False)])
        old = con.execute("SELECT 발송일시, 발송자 FROM reports WHERE 일자=?", (str(day),)).fetchone()
        con.execute("INSERT OR REPLACE INTO reports VALUES (?, ?, ?, ?, ?)",
                    (str(day), user, _now(), old[0] if old else None, old[1] if old else None))
        _bump(con)


def delete_report(day: date, path: Path | None = None) -> None:
    with connect(path) as con:
        con.execute("DELETE FROM report_rows WHERE 일자=?", (str(day),))
        con.execute("DELETE FROM reports WHERE 일자=?", (str(day),))
        _bump(con)


def log_mail(day: date, subject: str, to: str, cc: str, result: str, user: str, path: Path | None = None) -> None:
    with connect(path) as con:
        con.execute("INSERT INTO mail_log (일자, 제목, 받는사람, 참조, 결과, 사용자, 일시) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (str(day), subject, to, cc, result, user, _now()))
        if result == "성공":
            con.execute("UPDATE reports SET 발송일시=?, 발송자=? WHERE 일자=?", (_now(), user, str(day)))


def load_mail_log(limit: int = 30, path: Path | None = None) -> pd.DataFrame:
    with connect(path) as con:
        return pd.read_sql_query("SELECT 일자, 제목, 받는사람, 참조, 결과, 사용자, 일시 FROM mail_log ORDER BY id DESC LIMIT ?",
                                 con, params=(limit,))


# ---------------------------------------------------------------- 직원 명부 (입사·퇴사)
EMP_COLS = ["이름", "캡스이름", "사번", "부서", "직급", "입사일", "퇴사일", "비고", "순서"]


def load_employees(path: Path | None = None) -> pd.DataFrame:
    """입사일·퇴사일은 date 또는 None."""
    with connect(path) as con:
        df = pd.read_sql_query(f"SELECT {_q(EMP_COLS)}, 수정자, 수정일시 FROM employees ORDER BY 순서, 이름", con)
    for c in ("입사일", "퇴사일"):
        df[c] = df[c].map(lambda v: date.fromisoformat(v) if isinstance(v, str) and v else None)
    for c in ("캡스이름", "사번", "부서", "직급", "비고"):
        df[c] = df[c].fillna("")
    return df


def save_employees(df: pd.DataFrame, user: str, path: Path | None = None) -> int:
    """직원 명부를 통째로 교체 저장한다 (추가·수정·삭제 모두 반영). 저장한 인원 수를 돌려준다."""
    d = df.copy()
    d = d[d["이름"].astype(str).str.strip() != ""]
    if d["이름"].duplicated().any():
        dup = ", ".join(sorted(set(d.loc[d["이름"].duplicated(), "이름"])))
        raise ValueError(f"같은 이름이 두 번 있습니다: {dup} (동명이인은 '홍길동2'처럼 구분해 주세요)")
    rows = []
    for i, r in enumerate(d.to_dict("records"), 1):
        def iso(v):
            if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT or str(v) in ("", "NaT", "None"):
                return None
            return pd.Timestamp(v).date().isoformat()
        rows.append((str(r["이름"]).strip(), str(r.get("캡스이름") or "").strip(), str(r.get("사번") or "").strip(),
                     str(r.get("부서") or "").strip(), str(r.get("직급") or "").strip(),
                     iso(r.get("입사일")), iso(r.get("퇴사일")), str(r.get("비고") or "").strip(), i, user, _now()))
    with connect(path) as con:
        con.execute("DELETE FROM employees")
        con.executemany("INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
        _bump(con)
    return len(rows)
