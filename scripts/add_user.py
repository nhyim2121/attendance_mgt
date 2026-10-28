"""서버 PC에서 로그인 계정을 만들거나 비밀번호를 바꾼다.

실행 (프로젝트 폴더에서):
  .venv\\Scripts\\python.exe scripts\\add_user.py
비밀번호는 화면에 표시되지 않고, 해시로만 저장된다.
"""
from __future__ import annotations

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core import store  # noqa: E402
from core.auth import ROLES, check_password_rule, hash_password  # noqa: E402


def main() -> None:
    print(f"저장소: {store.db_path()}")
    uid = input("아이디: ").strip()
    if not uid:
        sys.exit("아이디를 입력해 주세요.")
    old = store.get_user(uid)
    name = input(f"이름{f' [{old["이름"]}]' if old else ''}: ").strip() or (old["이름"] if old else uid)
    default_role = old["역할"] if old else ("관리자" if store.user_count() == 0 else "담당자")
    role = input(f"역할 {ROLES} [{default_role}]: ").strip() or default_role
    if role not in ROLES:
        sys.exit(f"역할은 {ROLES} 중 하나여야 합니다.")
    pw = getpass.getpass("비밀번호 (8자 이상, 숫자+문자): ")
    if err := check_password_rule(pw):
        sys.exit(err)
    if getpass.getpass("비밀번호 확인: ") != pw:
        sys.exit("비밀번호가 서로 다릅니다.")
    store.upsert_user(uid, name, role, hash_password(pw))
    print(f"{'수정' if old else '생성'} 완료: {uid} ({name}, {role})")


if __name__ == "__main__":
    main()
