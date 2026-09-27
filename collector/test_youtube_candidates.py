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


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
