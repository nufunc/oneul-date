"""유튜브 설명란 후보 추출 회귀 테스트: python3 test_youtube_candidates.py 또는 pytest"""
import youtube_vlog_miner as y

DESC = """우이동 하루코스
1. 더숲아카데미하우스
2. 국립4·19민주묘지 전망대
3. 4·19 카페거리 '사일구로'
05:03 4.19 카페거리
📍 서울 강북구 4.19로 135
📍 도선사"""


def test_decimal_and_middle_dot_numbers_are_not_list_numbers():
    c = y._collect_description_candidates(DESC)
    assert "4.19 카페거리" in c
    assert "국립4.19민주묘지 전망대" in c
    assert not any(x.startswith("19") for x in c)


def test_address_lines_are_not_candidates():
    assert not any("4.19로 135" in x for x in y._collect_description_candidates(DESC))


def test_list_numbers_are_still_stripped():
    assert y.clean_vlog_spot_name("3. 어니언 안국") == "어니언 안국"
    assert y.clean_vlog_spot_name("12 서울월드컵경기장") == "서울월드컵경기장"


SEARCH = {"contents": [{"videoRenderer": {"videoId": "aaaaaaaaaaa", "title": {"runs": [{"text": "우이동 하루코스"}]},
                                          "viewCountText": {"simpleText": "조회수 685,922회"}, "lengthText": {"simpleText": "14:56"}}}]}
BROWSE = {"items": [{"lockupViewModel": {"contentId": "bbbbbbbbbbb", "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
    "contentImage": {"thumbnailViewModel": {"overlays": [{"badge": {"text": "1:02:03"}}]}},
    "metadata": {"lockupMetadataViewModel": {"title": {"content": "부암동 하루코스"}, "metadata": {"contentMetadataViewModel": {
        "metadataRows": [{"metadataParts": [{"text": {"content": "조회수 7.9만회"}}, {"text": {"content": "1일 전"}}]}]}}}}}}]}


def test_parse_search_and_channel_items():
    assert y._parse_video_items(SEARCH) == [{"id": "aaaaaaaaaaa", "title": "우이동 하루코스", "views": 685922, "length": 896,
                                             "age_days": None}]
    assert y._parse_video_items(BROWSE) == [{"id": "bbbbbbbbbbb", "title": "부암동 하루코스", "views": 79000, "length": 3723,
                                             "age_days": 1}]
    assert y._age_days("3주 전") == 21 and y._age_days("스트리밍 시간: 5시간 전") == 0 and y._age_days("") is None


def test_pool_puts_hot_longform_first():
    pool = [{"id": "a", "views": 5_000, "length": 900}, {"id": "b", "views": 120_000, "length": 60},
            {"id": "c", "views": 110_000, "length": 900}, {"id": "d", "views": 900_000, "length": 1200}]
    assert [v["id"] for v in sorted(pool, key=y._pool_priority, reverse=True)] == ["d", "c", "b", "a"]


def test_wrong_handle_is_detected():
    assert y._channel_title_matches("수코 sookoh", "sookoh 수코")
    assert not y._channel_title_matches("수코 sookoh", "Sook Oh")
    assert not y._channel_title_matches("소소한날", "소소")


def test_saved_registry_gets_new_channels_and_handle_fixes():
    saved = {"verified": {"@sookoh": {"name": "수코 sookoh", "handle": "@sookoh"},
                          "누군가": {"name": "누군가", "auto_promoted": True}}}
    v = y._merge_initial_channels(saved)["verified"]
    assert "@sookoh" not in v and v["@Sookohaseyo"]["name"] == "수코 sookoh"
    assert "@gahiiide" in v and "누군가" in v



def _isolated(fn):
    import io, os, tempfile
    d = tempfile.mkdtemp()
    saved = {k: getattr(y, k) for k in ("HISTORY_PATH", "FAILURES_PATH", "VERIFIED_CHANNELS_PATH", "CHANNEL_STATS_PATH",
                                         "_innertube_web", "get_youtube_video_info", "_day_course_queries", "_closed_ratio")}
    y.HISTORY_PATH, y.FAILURES_PATH, y.VERIFIED_CHANNELS_PATH, y.CHANNEL_STATS_PATH = (
        os.path.join(d, n) for n in ("h.json", "f.json", "v.json", "c.json"))
    y._closed_ratio = lambda url, ids: None
    y._day_course_queries = lambda count=5: []
    try:
        return fn()
    finally:
        for k, v in saved.items():
            setattr(y, k, v)


def test_rate_limit_ends_the_round():
    import io, urllib.error

    def boom(endpoint, body, timeout=10):
        raise urllib.error.HTTPError("u", 429, "Too Many Requests", {}, io.BytesIO(b""))

    def run():
        y._innertube_web = boom
        y.get_youtube_video_info = lambda *a, **k: (_ for _ in ()).throw(AssertionError("429 뒤에 영상 조회를 계속함"))
        return y.run_youtube_vlog_mining("http://db", "k", limit=1)
    assert _isolated(run) == 0


def test_video_failing_three_times_goes_to_history():
    item = {"contents": [{"videoRenderer": {"videoId": "ccccccccccc", "title": {"runs": [{"text": "부암동 하루코스"}]}}}]}

    def run():
        y._innertube_web = lambda endpoint, body, timeout=10: item if endpoint == "search" else {}
        y.get_youtube_video_info = lambda *a, **k: None
        for _ in range(3):
            assert "ccccccccccc" not in y.load_processed_history()
            y.run_youtube_vlog_mining("http://db", "k", limit=1)
        return y.load_processed_history()
    assert "ccccccccccc" in _isolated(run)



def test_latest_channel_titles_need_course_words():
    assert y.is_course_title("부암동 하루코스") and y.is_course_title("망원동 브이로그")
    for t in ("ISA 계좌 총정리", "스타크래프트 레전드", "15억 자산가의 하루", "대한항공 일등석 기내식"):
        assert not y.is_course_title(t), t



def test_watch_channel_mines_fresh_hits_and_keeps_low_views_out_of_history():
    latest = [{"id": "hit00000000", "title": "공주 하루코스", "views": 60_000, "length": 900, "age_days": 3},
              {"id": "low00000000", "title": "부여 하루코스", "views": 30_000, "length": 900, "age_days": 3},
              {"id": "old00000000", "title": "대전 하루코스", "views": 90_000, "length": 900, "age_days": 40}]
    mined = []

    def run():
        saved = (y._browse_channel_videos, y._search_innertube_videos, y.mine_video_info, y.INITIAL_VERIFIED_CHANNELS)
        y.INITIAL_VERIFIED_CHANNELS = [{"name": "아일랜드 트래블러", "handle": "@islandtraveler", "watch": True}]
        y._browse_channel_videos = lambda handle, name, popular=True: latest if not popular else []
        y._search_innertube_videos = lambda q, max_results=20: []
        y.get_youtube_video_info = lambda vid, verbose=False: {"url": f"https://www.youtube.com/watch?v={vid}", "title": "공주 하루코스",
                                                               "author": "아일랜드 트래블러", "views": 60_000,
                                                               "description": "1. 공산성\n2. 공주산성시장\n3. 카페 우리" + " " * 60}
        y.mine_video_info = lambda vinfo, *a, **k: mined.append(vinfo["_vid"]) or {**y._new_stats()}
        try:
            y.run_youtube_vlog_mining("http://db", "k", limit=1)
            return y.load_processed_history()
        finally:
            y._browse_channel_videos, y._search_innertube_videos, y.mine_video_info, y.INITIAL_VERIFIED_CHANNELS = saved
    history = _isolated(run)
    assert mined == ["hit00000000"]
    assert "hit00000000" in history and "low00000000" not in history and "old00000000" not in history



def test_overseas_titles_missed_in_first_watch_round():
    for t in ("유니버설 스튜디오 재팬 완벽 공략", "[VLOG] 2박 3일 일본 소도시", "리스본🇵🇹 인생 여행 코스", "인생 여행 코스 🇵🇹"):
        assert y.is_overseas_video(t), t
    for t in ("연남동 일본식 라멘 맛집", "서울 🇰🇷 데이트 코스", "부암동 하루코스"):
        assert not y.is_overseas_video(t), t


def test_neighborhood_in_title_narrows_region_to_its_district():
    assert y.extract_region_hints("성북동이 부자 동네라더니") == ["성북구"]
    assert y.extract_region_hints("홍길동 이야기") == []
    assert y.extract_region_hints("강릉 연남동 느낌 카페") == ["강릉"]


def test_manual_run_goes_to_history():
    def run():
        y.get_youtube_video_info = lambda vid, verbose=False: {"url": f"https://www.youtube.com/watch?v={vid}", "title": "우이동 하루코스",
                                                               "author": "가희드", "views": 1, "description": "x"}
        saved = y.mine_video_info
        y.mine_video_info = lambda *a, **k: y._new_stats()
        try:
            y.mine_youtube_vlog("https://www.youtube.com/watch?v=bp-Uinfc2vM", "http://db", "k")
            return y.load_processed_history()
        finally:
            y.mine_video_info = saved
    assert "bp-Uinfc2vM" in _isolated(run)



def _stats_env(fn, closed=0.0):
    import os, tempfile
    d = tempfile.mkdtemp()
    saved = (y.CHANNEL_STATS_PATH, y.VERIFIED_CHANNELS_PATH, y._closed_ratio)
    y.CHANNEL_STATS_PATH, y.VERIFIED_CHANNELS_PATH = os.path.join(d, "c.json"), os.path.join(d, "v.json")
    y._closed_ratio = lambda url, ids: closed if ids else None
    try:
        return fn()
    finally:
        y.CHANNEL_STATS_PATH, y.VERIFIED_CHANNELS_PATH, y._closed_ratio = saved


def test_handle_from_oembed_author_url():
    assert y._handle_from_url("https://www.youtube.com/@gahiiide") == "@gahiiide"
    assert y._handle_from_url("https://www.youtube.com/@%EB%B0%B1%EB%85%84%ED%95%B4%EB%B0%A9") == "@백년해방"
    assert y._handle_from_url("") == ""


def test_productive_channel_is_promoted_to_watch_and_survives_registry_merge():
    def run():
        v = {"author": "새채널", "handle": "@newch"}
        y.record_channel_video(v, {"spot_ids": [1, 2, 3, 4], "video_attached": 1})
        y.record_channel_video(v, {"spot_ids": [5, 6, 7, 8]})
        y.record_channel_video(v, {"spot_ids": []})
        c = y.load_channel_stats()["channels"]["@newch"]
        assert (c["mined"], c["productive"], len(c["spots"]), c["attached"]) == (3, 2, 8, 1)
        ch = y._merge_initial_channels({"verified": {}})
        logs = y.review_watch_channels(ch, "http://db")
        assert ch["verified"]["@newch"]["watch"] is True and any("승격" in l for l in logs)
        assert y.review_watch_channels(ch, "http://db") == []  # 하루 한 번
        return y._merge_initial_channels(y.load_verified_channels())
    assert _stats_env(run)["verified"]["@newch"]["watch"] is True


def test_idle_initial_watch_channel_is_demoted_and_stays_demoted():
    def run():
        ch = y._merge_initial_channels({"verified": {}})
        y.save_channel_stats({"channels": {"@gahiiide": {"name": "가희드 gahiiide", "handle": "@gahiiide", "mined": 0,
                                                         "productive": 0, "spots": [], "attached": 0, "first_seen": "2026-08-01"}}})
        logs = y.review_watch_channels(ch, "http://db")
        assert ch["verified"]["@gahiiide"]["watch"] is False and any("강등" in l for l in logs)
        assert ch["verified"]["@yougotoo"]["watch"] is True  # 기록이 없던 곳은 오늘부터 30일을 센다
        return y._merge_initial_channels(y.load_verified_channels())
    assert _stats_env(run)["verified"]["@gahiiide"]["watch"] is False


def test_watch_channel_with_many_closed_spots_is_demoted():
    def run():
        ch = y._merge_initial_channels({"verified": {}})
        y.save_channel_stats({"channels": {"@Boriko": {"name": "보리코 Boriko", "handle": "@Boriko", "mined": 3, "productive": 2,
                                                       "spots": [{"id": i, "date": y._today()} for i in range(6)],
                                                       "attached": 0, "first_seen": y._today(), "last_registered": y._today()}}})
        y.review_watch_channels(ch, "http://db")
        return ch["verified"]["@Boriko"]["watch"]
    assert _stats_env(run, closed=0.5) is False


def test_map_link_query_adds_branch_hint():
    d = ("09:25 📍담솥\nhttps://www.google.com/maps/search/?api=1&query=담솥+종로\n"
         "03:52 📍국립중앙박물관\nhttps://www.google.com/maps/search/?api=1&query=국립중앙박물관\n"
         "07:31 📍남산타워\nhttps://www.google.com/maps/search/?api=1&query=N서울타워")
    assert y.map_link_query_for("담솥", d) == "담솥 종로"
    assert y.map_link_query_for("국립중앙박물관", d) == ""
    assert y.map_link_query_for("남산타워", d) == ""
    assert y.map_link_query_for("담솥", "") == ""


def test_truncated_description_links_are_restored_from_command_runs():
    content = "✨ 09:25 📍담솥\nhttps://www.google.com/maps/search/?a...\n끝"
    shown = "https://www.google.com/maps/search/?a..."
    start = len("✨ 09:25 📍담솥\n".encode("utf-16-le")) // 2
    q = "https%3A%2F%2Fwww.google.com%2Fmaps%2Fsearch%2F%3Fapi%3D1%26query%3D%25EB%258B%25B4%25EC%2586%25A5%2B%25EC%25A2%2585%25EB%25A1%259C"
    attr = {"content": content, "commandRuns": [{"startIndex": start, "length": len(shown), "onTap": {"innertubeCommand": {
        "commandMetadata": {"webCommandMetadata": {"url": f"https://www.youtube.com/redirect?event=video_description&q={q}"}}}}}]}
    out = y._expand_truncated_links(attr)
    assert "..." not in out and out.endswith("\n끝")
    assert y.map_link_query_for("담솥", out) == "담솥 종로"


def test_naver_shared_folder_places_become_candidates_with_district_query():
    import io, json
    body = json.dumps({"bookmarkList": [
        {"name": "윤숲", "type": "place", "address": "서울 광진구 긴고랑로20길 51"},
        {"name": "메모", "type": "memo", "address": ""}]}).encode()
    orig = y.urllib.request.urlopen
    y.urllib.request.urlopen = lambda *a, **k: io.BytesIO(body)
    try:
        assert y._naver_shared_folder_names("0" * 32) == ["윤숲"]
    finally:
        y.urllib.request.urlopen = orig
    assert y._SHARED_FOLDER_QUERY["윤숲"] == "광진구 윤숲"
    assert y._SHARED_FOLDER_ADDR["윤숲"] == "긴고랑로20길51"


def test_area_names_in_title_become_region_hints():
    # 사이클 36 오매칭 영상: 방이시장 → 부산 큰집닭강정, 잠실 → 제주 애주가, 영종도 → 서울 속초그바람에, 성수 → 울산 시로
    assert y.extract_region_hints("방이시장 먹방 데이트") == ["송파구"]
    assert y.extract_region_hints("잠실 데이트 코스") == ["송파구"]
    assert y.extract_region_hints("영종도 당일치기") == ["영종구"]
    assert y.extract_region_hints("성수 카페 투어") == ["성동구"]
    assert y.extract_region_hints("감성 공방이에요") == []


def _mine(title, desc, result):
    calls = []
    orig = y.search_naver
    y.search_naver = lambda q: calls.append(q) or [result]
    try:
        return y.mine_video_info({"title": title, "description": desc, "videoId": "t"}, "http://127.0.0.1:9", "k",
                                 dry_run=True, verbose=False), calls
    finally:
        y.search_naver = orig


BUSAN = {"name": "큰집닭강정", "roadAddress": "부산광역시 부산진구 서면로 10", "category": "치킨,닭강정", "x": "129.0", "y": "35.1"}
FOOD_DESC = "오늘 먹은 것 정리\n1. 큰집닭강정\n2. 최고집\n시장 구경하고 맛있게 먹었어요 다음에 또 가요"


def test_area_hint_rejects_other_region_match():
    stats, calls = _mine("방이시장 먹방 데이트 브이로그", FOOD_DESC, BUSAN)
    assert stats["registered"] == 0 and stats["region_mismatch"] == 2, stats
    assert calls[0] == "송파구 큰집닭강정"


def test_candidates_without_region_hint_or_map_link_are_dropped():
    stats, calls = _mine("시장 먹방 데이트 브이로그", FOOD_DESC, BUSAN)
    assert calls == [] and stats["region_mismatch"] == 2 and stats["registered"] == 0, (stats, calls)


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
