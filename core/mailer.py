"""하이웍스 메일(SMTP) 발송.

설정 파일: .streamlit/secrets.toml (git 제외, 서버 PC에만 있음)
    [hiworks_mail]
    host = "smtps.hiworks.com"
    port = 465
    user = "보내는사람@회사도메인"
    password = "메일 비밀번호 (또는 하이웍스에서 발급한 SMTP 전용 비밀번호)"
    sender_name = "관리팀"

하이웍스 관리자 설정에서 '외부 메일 프로그램(SMTP) 사용'이 허용되어 있어야 한다.
"""
from __future__ import annotations

import re
import smtplib
import ssl
import tomllib
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

SECRETS = Path(__file__).resolve().parent.parent / ".streamlit" / "secrets.toml"
_EMAIL = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$")


def load_config(path: Path | None = None) -> dict | None:
    p = Path(path or SECRETS)
    if not p.exists():
        return None
    with open(p, "rb") as f:
        cfg = tomllib.load(f).get("hiworks_mail")
    if not cfg or not cfg.get("user") or not cfg.get("password"):
        return None
    return {"host": cfg.get("host", "smtps.hiworks.com"), "port": int(cfg.get("port", 465)),
            "user": cfg["user"], "password": cfg["password"], "sender_name": cfg.get("sender_name", "관리팀")}


def parse_addresses(text: str) -> tuple[list[str], list[str]]:
    """'a@x.com, b@x.com; c@x.com' -> (올바른 주소, 잘못된 값)"""
    items = [t.strip() for t in re.split(r"[,;\n]", text or "") if t.strip()]
    good = [t for t in items if _EMAIL.match(t)]
    return list(dict.fromkeys(good)), [t for t in items if not _EMAIL.match(t)]


def build_message(cfg: dict, subject: str, html: str, text: str, to: list[str], cc: list[str]) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg["sender_name"], cfg["user"]))
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg.set_content(text)
    msg.add_alternative(f'<!doctype html><html><body style="margin:0;padding:16px;background:#fff">{html}</body></html>',
                        subtype="html")
    return msg


def send(cfg: dict, subject: str, html: str, text: str, to: list[str], cc: list[str]) -> None:
    """실패하면 예외를 그대로 올린다 (화면에서 사유를 보여 줌)."""
    if not to:
        raise ValueError("받는 사람이 없습니다.")
    msg = build_message(cfg, subject, html, text, to, cc)
    ctx = ssl.create_default_context()
    if cfg["port"] == 465:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=ctx, timeout=30) as s:
            s.login(cfg["user"], cfg["password"])
            s.send_message(msg)
    else:  # 587 등 STARTTLS
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as s:
            s.starttls(context=ctx)
            s.login(cfg["user"], cfg["password"])
            s.send_message(msg)


def friendly_error(exc: Exception) -> str:
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return ("하이웍스 로그인에 실패했습니다. secrets.toml의 계정·비밀번호를 확인하고, 하이웍스에서 "
                "외부 메일 프로그램(SMTP) 사용이 허용되어 있는지 확인해 주세요.")
    if isinstance(exc, (TimeoutError, OSError)) and not isinstance(exc, smtplib.SMTPException):
        return f"메일 서버에 연결하지 못했습니다 ({exc}). 회사 방화벽에서 465 포트가 막혀 있을 수 있습니다."
    return f"메일 발송 실패: {exc}"
