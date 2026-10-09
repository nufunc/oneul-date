"""heal_category_and_slot 회귀 테스트: python3 test_heal_category.py 또는 pytest"""
from heal_and_verify_spots import heal_category_and_slot as heal


def test_no_evidence_keeps_category_empty():
    # 근거 없이 시간대로 카테고리를 지어 넣지 않는다(종전: day→감성카페, night→칵테일·위스키바)
    assert heal({"name": "제주 F1 카트클럽", "slot": "day"}) == (None, "day")
    assert heal({"name": "평화광장 춤추는 바다분수", "category": "공원시설물", "slot": "night"}) == (None, "night")


def test_valid_category_kept():
    assert heal({"name": "어느 카페", "category": "감성카페", "slot": "day"})[0] == "감성카페"


def test_summary_template_words_do_not_decide_category():
    # 시간대 템플릿 요약문의 '칵테일'·'위스키'로 술집 카테고리를 주지 않는다(삽교호 바다공원 전망데크 사례)
    spot = {"name": "삽교호 바다공원 전망데크", "slot": "night",
            "summary": "부드러운 위스키 향을 음미하며 달콤한 칵테일과 함께 둘만의 밤을"}
    assert heal(spot)[0] != "칵테일·위스키바"


def test_specific_note_theme_wins_over_generic_substring():
    # 구체 테마가 Food·Dining·Gourmet·Park·Forest·Spa(Space) 일반 패턴보다 먼저 걸린다(P-092)
    def note(name, theme):
        return heal({"name": name, "slot": "day",
                     "source": {"note": f"Live_Research_2026_Theme_{theme}_Part16.md"}})[0]
    assert note("기장 해녀촌 0번 해녀할매집", "Seafood_Pocha") == "한식·미식"
    assert note("경원재 수라", "Hanok_FineDining") == "한식·미식"
    assert note("만족오향족발 시청본점", "Heritage_Gourmet") == "한식·미식"
    assert note("하이원 알파인코스터", "Amusement_ThemePark") == "레포츠/체험"
    assert note("휘닉스 아일랜드 블루캐니언", "Spa_Waterpark") == "스파·힐링"
    assert note("드리머스 가좌", "Upcycling_CulturalSpace") is None
    assert note("마담파이", "Forest_Bakery") == "감성카페"


def test_stay_flip_is_vetoed_only_for_clear_non_stay_category():
    import supabase_worker as w
    assert w.stay_flip_vetoed("양식", "메르씨엘")
    assert w.stay_flip_vetoed("카페", "클래식")
    assert w.stay_flip_vetoed("쇼핑/소품", "옥천장 (5, 10일)")
    assert not w.stay_flip_vetoed("레포츠/체험", "대가야캠프타운")
    assert w.stay_flip_vetoed("프랑스음식", "스테이", "디너 STAY Passion 코스 1인 210,000원~260,000원")
    assert w.stay_flip_vetoed("프랑스음식", "시그니엘 서울 스테이")
    assert w.stay_flip_vetoed("칵테일바", "JW 메리어트 호텔 모보 바")
    assert not w.stay_flip_vetoed("일본식주점", "모노 풀빌라", "1박 40만 ~ 72만 원대 / 네이버 예약.")
    assert not w.stay_flip_vetoed("카페", "파주 글로우 글램핑")
    assert not w.stay_flip_vetoed("", "어느 호텔")
    assert w.stay_unflip_vetoed("거제자연휴양림캠핑장") and w.stay_unflip_vetoed("민트글램핑")
    assert w.stay_unflip_vetoed("쇠꼴마을고고펜션") and w.stay_unflip_vetoed("하늘그린캠프")
    assert not w.stay_unflip_vetoed("어느 호텔")
    assert not w.stay_flip_vetoed(None, "클래식")


def test_keyword_does_not_match_inside_other_words_or_branch_names():
    # 부분 문자열 일치로 틀린 카테고리를 주지 않는다(P-097)
    assert heal({"name": "스테이블디 에스프레소바", "slot": "day"})[0] != "일식·오마카세"
    assert heal({"name": "빌라드스파이시 루프탑 라운지", "slot": "night"})[0] != "스파·힐링"
    assert heal({"name": "연남장 사운드스테이지", "slot": "day"})[0] != "호텔·감성숙소"
    assert heal({"name": "파라다이스시티", "slot": "day"})[0] != "일식·오마카세"
    assert heal({"name": "목탄장 도산공원점", "slot": "evening"})[0] != "자연·산책"


if __name__ == "__main__":
    test_no_evidence_keeps_category_empty()
    test_valid_category_kept()
    test_summary_template_words_do_not_decide_category()
    test_specific_note_theme_wins_over_generic_substring()
    test_stay_flip_is_vetoed_only_for_clear_non_stay_category()
    test_keyword_does_not_match_inside_other_words_or_branch_names()
    print("ok")
