"""내보내기 category 재부착 회귀 테스트(P-170): python3 test_heal_category_p170.py 또는 pytest
표본은 2026-10-20 열린 DB 행의 이름과 출처 메모다. 바뀐 규칙은 대상 47행과 경계 6359에만 걸린다."""
from heal_and_verify_spots import heal_category_and_slot as heal


def _cat(name, theme):
    return heal({"name": name, "slot": "day",
                 "source": {"note": f"Live_Research_2026_Theme_{theme}_Part12.md"}})[0]


def test_bbq_is_not_italian():
    assert _cat("아차산 숲속가든 바베큐", "Outdoor_BBQ") == "바베큐"
    assert _cat("영도 신기숲 바베큐가든 부산", "Outdoor_BBQ") == "바베큐"
    assert _cat("아리랑하우스 한강선상바베큐", "Riverside_Stream_Walk") == "바베큐"
    assert _cat("양양 죽도해변 서프독 바베큐", "Seafood_Pocha") == "바베큐"


def test_activity_and_market_names_are_not_nature():
    assert _cat("노들섬 잔디마당 플리마켓", "Fleamarket_ArtFair") == "전시·문화"
    assert _cat("부천 상동호수공원 주말 나눔장터", "Fleamarket_ArtFair") == "전시·문화"
    assert _cat("시흥 배곧생명공원 해수체험 수상레저", "Yacht_WaterLeisure") == "수상스포츠"
    assert _cat("동해 어달해변 해양투어", "Yacht_WaterLeisure") == "수상스포츠"
    assert _cat("포천 산정호수 하동 루지체험장", "Racing_Luge") == "레포츠/체험"
    assert _cat("강릉 안목해변 아라나비 짚라인", "Cablecar_Cruise") == "케이블카·유람선"
    assert _cat("인천 송도 솔찬공원 케이슨24", "Midnight_Drive") is None
    assert heal({"name": "왕송호수공원 레일바이크", "slot": "day",
                 "source": {"note": "Live_Research_2026_Gyeonggi_Incheon_Ultimate_Part2.md"}})[0] is None


def test_stargazing_note_needs_observatory_in_name():
    assert _cat("양평 서종 수능리 별빛계곡길", "Stargazing_Observatory") is None
    assert _cat("철원 노동당사 평화광장", "Stargazing_Observatory") is None
    assert _cat("경주 첨성대 야간 별빛광장", "Stargazing_Observatory") is None
    assert _cat("청주랜드 천문기상관", "Stargazing_Observatory") == "천문대"
    assert _cat("국립광주과학관 루체리움천문대", "Stargazing_Observatory") == "천문대"


def test_unchanged_rows():
    # 경계 행과 장소 낱말만 있는 행은 그대로 자연·산책이다
    assert _cat("강화도 화개정원 모노레일", "Botanical_Garden") == "자연·산책"
    assert _cat("일산 호수공원", "Riverside_Stream_Walk") == "자연·산책"
    # 남는 대상 2행: 이름 규칙을 건너뛴 뒤 출처 메모 테마가 자연·산책을 붙인다
    assert _cat("창원 용지호수공원 무빙보트", "Riverside_Stream_Walk") == "자연·산책"
    assert _cat("산정호수 빵명장", "Scenic_Sunset_View") == "자연·산책"


if __name__ == "__main__":
    for fn in [v for k_, v in list(globals().items()) if k_.startswith("test_")]:
        fn()
    print("ok")
