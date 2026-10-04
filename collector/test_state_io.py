"""상태 파일 원자 쓰기·손상 처리 회귀 테스트: python3 test_state_io.py 또는 pytest"""
import glob
import json
import os
import tempfile

import state_io as s


def _tmp(name):
    return os.path.join(tempfile.mkdtemp(), name)


def test_corrupt_file_is_kept_and_raises():
    p = _tmp("h.json")
    open(p, "w").write('{"video_ids": ["a", "b"')  # 쓰다 끊긴 파일
    try:
        s.load_json(p, [])
    except s.StateCorrupt:
        pass
    else:
        raise AssertionError("잘린 파일을 빈 값으로 넘겼다")
    assert open(p).read() == '{"video_ids": ["a", "b"' and glob.glob(p + ".corrupt-*")


def test_atomic_dump_replaces_whole_file():
    p = _tmp("c.json")
    s.atomic_dump(p, {"x": 1})
    s.atomic_dump(p, {"y": 2})
    assert json.load(open(p)) == {"y": 2} and not glob.glob(p + ".*.tmp")


def test_backups_with_same_name_both_survive():
    p = _tmp("p064_date_fit_20261004-173714.json")  # 같은 초에 두 번 돌리면 이름이 같다
    for n in (1, 2, 3):
        with s.open_new(p) as f:
            json.dump({"run": n}, f)
    names = sorted(glob.glob(p[:-5] + "*.json"))
    assert [os.path.basename(x) for x in names] == [
        "p064_date_fit_20261004-173714-2.json", "p064_date_fit_20261004-173714-3.json", "p064_date_fit_20261004-173714.json"]
    assert json.load(open(p)) == {"run": 1}


def test_lock_is_reentrant_in_process():
    p = _tmp("v.json")
    with s.locked(p):
        with s.locked(p):
            pass
    with s.locked(p):
        pass


def test_history_save_merges_ids_added_meanwhile_and_corrupt_history_stops_round():
    import youtube_vlog_miner as y
    saved = y.HISTORY_PATH
    y.HISTORY_PATH = _tmp("h.json")
    try:
        y.save_processed_history(["a", "b"])
        start = y.load_processed_history()      # 자동 회차 시작
        y.save_processed_history(start + ["url1"])  # 그 사이 --url
        y.save_processed_history(start + ["c"])     # 자동 회차 끝
        assert y.load_processed_history() == ["a", "b", "url1", "c"]
        open(y.HISTORY_PATH, "w").write("{")
        try:
            y.run_youtube_vlog_mining("http://db", "k", limit=1, dry_run=True)
        except s.StateCorrupt:
            pass
        else:
            raise AssertionError("손상된 이력으로 회차를 계속했다")
        assert open(y.HISTORY_PATH).read() == "{"
    finally:
        y.HISTORY_PATH = saved


def test_corrupt_tourapi_usage_stops_instead_of_counting_from_zero():
    import tourapi_quota as q
    saved = q.USAGE_FILE
    q.USAGE_FILE = _tmp("u.json")
    open(q.USAGE_FILE, "w").write('{"2026-')
    try:
        q.tour_get_json("http://x")
    except q.TourApiRateLimited:
        pass
    else:
        raise AssertionError("사용량을 모르는데 호출했다")
    finally:
        q.USAGE_FILE = saved


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
