"""is_date_spot_category 회귀 테스트: python3 test_category_filter.py 또는 pytest"""
from category_filter import is_date_spot_category as ok


def test_kids_facilities_are_rejected():
    for name, cat in [("인천어린이박물관", "박물관"), ("주니어 캠퍼스", "체험학습장"), ("버들어린이공원", "공원"),
                      ("키즈돌핀 서대문DMC점", "레포츠/체험"), ("달빛솜솜키즈풀빌라", "펜션")]:
        assert not ok(cat, name, allow_lodging=True)[0], name


def test_similar_names_are_kept():
    for name, cat in [("어린이대공원", "테마파크"), ("몽키즈클라이밍 동탄점", "클라이밍"), ("공유아트갤러리 1호점", "전시관"),
                      ("오설록 티뮤지엄 티스톤", "체험학습장")]:
        assert ok(cat, name, allow_lodging=True)[0], name


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
