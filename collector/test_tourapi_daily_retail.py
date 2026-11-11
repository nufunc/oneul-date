"""쇼핑 유형 생활 소매 관문 회귀 테스트(P-377): python3 test_tourapi_daily_retail.py 또는 pytest"""
from miners.tourapi_miner import DAILY_RETAIL_NAME


def test_daily_retail_names_are_blocked():
    for name in ("헬스케어의료기", "센스안경", "다이소 강릉내곡점", "소금강행복펜션마트", "에이스마트 주문진점",
                 "월드마트 초당점", "주문진원마트", "참조은생활마트 포남점", "한길DC마트"):
        assert DAILY_RETAIL_NAME.search(name), name


def test_markets_and_shops_pass():
    for name in ("재주도좋아·반짝반짝 지구상회", "그랑핸드 가회점", "주문진시장", "정선아리랑시장", "강릉중앙시장",
                 "모란민속5일장", "이천도자기 공방", "독일마을공식기념품판매점", "영풍문고 종각종로본점",
                 "롯데백화점 본점", "스타필드 하남", "베이비하우스 강릉점", "삼일식품", "경기건어물"):
        assert not DAILY_RETAIL_NAME.search(name), name


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
