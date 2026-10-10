from supabase_worker import derive_region_area as d, same_region_area as same

# 같은 호남이어도 시군구가 다르면 다른 곳이다(P-112 담양 서플라이 3436)
assert not same(d("전남 담양군 담양읍 객사4길 24"), d("광주 서구 상무대로 1"))
assert same(d("광주광역시 서구 치평동 1"), d("광주 서구 상무대로 1"))
# 일반구는 부모 시로 정규화되므로 같은 시다
assert same(d("경기 용인시 수지구 광교호수로 2"), d("경기도 용인시 기흥구 중부대로 1"))
assert not same(d("서울 강남구 압구정로 1"), d("경기 성남시 분당구 정자일로 1"))
# 시군구를 정할 수 없으면 권역만 비교한다
assert same(d("서울"), d("서울 강남구 압구정로 1"))
assert not same(d("서울"), d("경기 성남시 분당구 정자일로 1"))
assert same((None, None), d("광주 서구 상무대로 1"))
print("ok")
