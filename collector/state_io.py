"""수집기 상태 JSON 파일(처리 이력, 채널 목록, 채널 성과, TourAPI 사용량)을 안전하게 읽고 쓴다.

자동 회차와 수동 --url 실행이 같은 컨테이너에서 같은 파일을 쓴다. open('w')로 바로 쓰면 잘린 파일이 보일 수 있고,
읽는 쪽이 파싱 실패를 빈 값으로 받아 그대로 저장하면 이력 2,000개가 한 번에 사라진다(2026-09-27 감사).
- atomic_dump: 같은 폴더의 임시 파일에 쓰고 fsync한 뒤 os.replace로 바꾼다
- load_json: 파일이 없으면 기본값, 있는데 파싱에 실패하면 .corrupt-타임스탬프로 복사해 두고 StateCorrupt를 올린다
- open_new: 백업처럼 덮어쓰면 안 되는 파일을 새로 연다. 같은 이름이 있으면 -2, -3을 붙인다
- locked: 파일 옆 .lock에 flock을 건다. 같은 프로세스 안에서는 다시 걸어도 기다리지 않는다
"""
import contextlib
import fcntl
import json
import os
import shutil
import tempfile
import time


class StateCorrupt(Exception):
    """상태 파일이 있는데 읽을 수 없다. 덮어쓰지 않고 그 단계를 멈춘다."""


def atomic_dump(path, obj, **dump_kw):
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d, prefix=os.path.basename(path) + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, **dump_kw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


def load_json(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (ValueError, UnicodeDecodeError) as e:
        backup = f"{path}.corrupt-{time.strftime('%Y%m%d-%H%M%S')}"
        with contextlib.suppress(OSError):
            shutil.copy2(path, backup)
        print(f"  ⛔ [상태 파일 손상] {os.path.basename(path)}을 읽지 못해 덮어쓰지 않고 멈춥니다. 원본 사본: {backup} ({e})",
              flush=True)
        raise StateCorrupt(path) from e


def open_new(path):
    # 초 단위 이름의 백업을 같은 초에 두 번 쓰면 앞 백업이 덮였다(P-064). 'x'로 새 파일만 만든다
    stem, ext = os.path.splitext(path)
    n = 1
    while True:
        try:
            return open(path, "x", encoding="utf-8")
        except FileExistsError:
            n += 1
            path = f"{stem}-{n}{ext}"


_held = {}


@contextlib.contextmanager
def locked(path):
    lock_path = path + ".lock"
    if lock_path in _held:
        _held[lock_path][1] += 1
        try:
            yield
        finally:
            _held[lock_path][1] -= 1
        return
    f = open(lock_path, "a")
    fcntl.flock(f, fcntl.LOCK_EX)
    _held[lock_path] = [f, 1]
    try:
        yield
    finally:
        del _held[lock_path]
        fcntl.flock(f, fcntl.LOCK_UN)
        f.close()
