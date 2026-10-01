from heal_and_verify_spots import derive_export_price_tier, heal_all_spots

CASES = [
    ("성인 3,000원", "₩"),
    ("평일 4,000원 / 주말 5,000원 (현재 겨울 무료)", "₩"),
    ("1인 2만원", "₩₩"),
    ("무료 입장", "FREE"),
    ("무료 관람 (리조트 시설 이용료 별도)", None),
    ("탱크 내부 전시 무료 또는 기획전별 상이", None),
    ("매장별 상이", None),
    ("", None),
]
for price, want in CASES:
    got = derive_export_price_tier(price)
    assert got == want, (price, got, want)

base = {"id": 1, "name": "테스트카페", "category": "카페", "slot": "day", "address": "서울 성동구 성수동"}
out, stats = heal_all_spots([
    {**base, "price": "성인 3,000원"},
    {**base, "id": 2, "price": "성인 3,000원", "price_tier": "₩₩₩"},
])
assert out[0]["price_tier"] == "₩" and out[1]["price_tier"] == "₩₩₩" and stats["filled_price_tiers"] == 1
print("ok")

from heal_and_verify_spots import upgrade_image_url
assert upgrade_image_url("http://tong.visitkorea.or.kr/cms/a.jpg") == "https://tong.visitkorea.or.kr/cms/a.jpg"
assert upgrade_image_url("http://t1.kakaocdn.net/x.png") == "https://t1.kakaocdn.net/x.png"
assert upgrade_image_url("http://example.com/a.jpg") == "http://example.com/a.jpg"
assert upgrade_image_url("https://t1.daumcdn.net/a.jpg") == "https://t1.daumcdn.net/a.jpg"
assert upgrade_image_url("") == ""
print("ok image")
