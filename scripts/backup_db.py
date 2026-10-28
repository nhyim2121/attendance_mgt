"""공용 저장소(SQLite)를 data/db/backup/ 에 날짜별로 백업한다. 최근 30개만 남긴다.
start_server.bat 이 서버를 켤 때마다 실행한다."""
from __future__ import annotations

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core import store  # noqa: E402

KEEP = 30


def main() -> None:
    src = store.db_path()
    if not src.exists():
        print("백업할 저장소가 아직 없습니다.")
        return
    dest_dir = src.parent / "backup"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"caps-{datetime.now():%Y%m%d-%H%M%S}.sqlite"
    with sqlite3.connect(src) as s, sqlite3.connect(dest) as d:
        s.backup(d)  # 사용 중이어도 안전하게 복사
    old = sorted(dest_dir.glob("caps-*.sqlite"))[:-KEEP]
    for p in old:
        p.unlink()
    print(f"백업 완료: {dest.name} (보관 {min(KEEP, len(list(dest_dir.glob('caps-*.sqlite'))))}개)")


if __name__ == "__main__":
    main()
