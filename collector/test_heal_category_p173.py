"""출처 메모 활동 테마 이름 대조 회귀 테스트(P-173): python3 test_heal_category_p173.py 또는 pytest
표본은 2026-10-21 열린 DB 행의 이름과 출처 메모다. 바뀐 규칙은 대상 25행에만 걸린다."""
from heal_and_verify_spots import heal_category_and_slot as heal


def _cat(name, theme):
    return heal({"name": name, "slot": "day",
                 "source": {"note": f"Live_Research_2026_Theme_{theme}_Part12.md"}})[0]


def test_climbing_note_needs_climbing_name():
    assert _cat("골프존파크 부산센텀 마린점", "Climbing_Sports") == "레포츠/체험"
    assert _cat("레이저아레나 홍대점", "Climbing_Sports") == "레포츠/체험"
    assert _cat("엑스텐 실내양궁장 부천점", "Climbing_Sports") == "레포츠/체험"
    assert _cat("더클라임 양재점", "Climbing_Sports") == "클라이밍"
    # 이름에 클라이밍이 있으면 이름 키워드 규칙이 먼저 공방·체험을 붙인다(P-170 의도 대응)
    assert _cat("손상원클라이밍짐 판교점", "Climbing_Sports") == "공방·체험"
    assert _cat("볼더링 스튜디오", "Climbing_Sports") == "클라이밍"


def test_cablecar_note_needs_cablecar_name():
    assert _cat("63아트", "Cablecar_Cruise") is None
    assert _cat("부산 다이아몬드타워", "Cablecar_Cruise") is None
    assert _cat("태안 백사장항 꽃게랑대하랑 인도교", "Cablecar_Cruise") is None
    assert _cat("하이원 곤돌라", "Cablecar_Cruise") == "케이블카·유람선"
    assert _cat("이크루즈 여의도선착장", "Cablecar_Cruise") == "케이블카·유람선"


def test_train_note_needs_train_name():
    assert _cat("서산 웅도 유등천 잠수교", "Scenic_Train") is None
    assert _cat("신안 천사섬 퍼플교", "Scenic_Train") is None
    assert _cat("정선 아우라지 레일바이크", "Scenic_Train") == "관광열차"
    assert _cat("삼척 대금굴 은하모노레일", "Scenic_Train") == "관광열차"
    assert _cat("동해 도째비골 스카이밸리 스카이사이클", "Scenic_Train") == "관광열차"


def test_zipline_and_kayak_are_leports():
    assert _cat("강릉 안목해변 아라나비 짚라인", "Cablecar_Cruise") == "레포츠/체험"
    assert _cat("군산 선유도 스카이라인 짚라인", "Cablecar_Cruise") == "레포츠/체험"
    assert _cat("하동 알프스 레포츠 짚와이어", "Scenic_Train") == "레포츠/체험"
    assert _cat("충주 활옥동굴 투명카약", "Scenic_Train") == "레포츠/체험"


if __name__ == "__main__":
    for fn in [v for k_, v in list(globals().items()) if k_.startswith("test_")]:
        fn()
    print("ok")
