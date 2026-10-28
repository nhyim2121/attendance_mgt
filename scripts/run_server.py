"""사이트 감시 실행기 (작업 스케줄러가 창 없이 실행).

- 이미 8501 포트에서 사이트가 돌고 있으면 아무것도 하지 않고 끝낸다 (중복 실행 방지).
- 저장소를 백업한 뒤 사이트를 켜고, 사이트가 멈추면 몇 초 뒤 다시 켠다.
- 서버 출력: data/logs/server-YYYYMMDD.log, 재시작 기록: data/logs/watchdog.log
실행: .venv\\Scripts\\pythonw.exe scripts\\run_server.py
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / ".venv" / "Scripts"
PYW = SCRIPTS / "pythonw.exe"  # 창 없는 파이썬 (콘솔 창이 뜨지 않음)
PY = PYW if PYW.exists() else SCRIPTS / "python.exe"
LOGS = ROOT / "data" / "logs"
PORT = 8501
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def log(msg: str) -> None:
    LOGS.mkdir(parents=True, exist_ok=True)
    with open(LOGS / "watchdog.log", "a", encoding="utf-8") as f:
        f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n")


def port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def main() -> None:
    LOGS.mkdir(parents=True, exist_ok=True)
    if port_in_use():
        log(f"{PORT} 포트에서 이미 사이트가 실행 중이라 감시기를 끝냅니다.")
        return
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    subprocess.run([str(PY), str(ROOT / "scripts" / "backup_db.py")], cwd=ROOT, env=env,
                   creationflags=NO_WINDOW, capture_output=True)
    quick_fails = 0
    while True:
        started = time.time()
        with open(LOGS / f"server-{datetime.now():%Y%m%d}.log", "a", encoding="utf-8") as out:
            proc = subprocess.Popen(
                [str(PY), "-m", "streamlit", "run", "app.py", "--server.address", "0.0.0.0",
                 "--server.port", str(PORT), "--server.headless", "true", "--browser.gatherUsageStats", "false"],
                cwd=ROOT, env=env, stdout=out, stderr=subprocess.STDOUT, creationflags=NO_WINDOW)
            log(f"사이트 시작 (PID {proc.pid})")
            code = proc.wait()
        log(f"사이트가 멈춤 (종료 코드 {code})")
        # 켜자마자 계속 멈추면 점점 길게 기다린다 (최대 60초)
        quick_fails = quick_fails + 1 if time.time() - started < 60 else 0
        wait = min(60, 5 * (quick_fails + 1))
        log(f"{wait}초 뒤 다시 켭니다.")
        time.sleep(wait)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # 감시기 자체 오류도 기록 (작업 스케줄러가 1분 뒤 다시 실행)
        log(f"감시기 오류: {exc!r}")
        sys.exit(1)
