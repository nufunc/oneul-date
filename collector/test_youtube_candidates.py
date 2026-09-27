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
    assert y._parse_video_items(SEARCH) == [{"id": "aaaaaaaaaaa", "title": "우이동 하루코스", "views": 685922, "length": 896}]
    assert y._parse_video_items(BROWSE) == [{"id": "bbbbbbbbbbb", "title": "부암동 하루코스", "views": 79000, "length": 3723}]


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


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
