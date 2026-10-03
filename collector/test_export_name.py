from heal_and_verify_spots import heal_all_spots

# 정제가 지명만 남기면 원래 이름을 쓴다(P-045, 라이브 DB 이름과 주소)
KEEP = [
    ("이천 티하우스에덴", "경기 이천시 마장면 서이천로 449-79"),
    ("여주 온실카페 무이숲", "경기 여주시 매화둔전로 30-15"),
    ("평창 샬레 드 몽", "강원특별자치도 평창군 평창읍 노성로 11"),
    ("사당역 야장골목 전주전집", "서울 동작구 동작대로7길 19"),
    ("강원 영월 김삿갓면 [슬로시티]", "강원특별자치도 영월군 김삿갓면 옥동장터길 36"),
    ("금산(남해)", "경상남도 남해군 상주면 상주리"),
]
# 기존 정제가 고치던 이름은 그대로 고친다
CLEAN = [
    ("청와옥 본점", "서울 송파구 위례성대로 48", "청와옥"),
    ("오퐁드부아 티하우스 대봉", "대구 중구 대봉로 209-1", "오퐁드부아"),
    ("국립 물향기수목원 & 메타세쿼이아길", "경기 오산시 청학로 211", "국립 물향기수목원"),
    ("아르누보 프라이빗다이닝", "대구 수성구 달구벌대로489길 61 2층", "아르누보"),
    ("내원사(서울)", "서울특별시 성북구 보국문로 262-151 내원사", "내원사"),
    ("후암동 야스노야 본점", "서울 용산구 두텁바위로 40 1층", "후암동 야스노야"),
    ("피터폴앤드메리 서울 강남구 압구정동", "서울 강남구 압구정로42길 24-10", "피터폴앤드메리"),
]

rows = [{"id": i, "name": n, "address": a, "category": "카페", "slot": "day"} for i, (n, a) in enumerate(KEEP)]
rows += [{"id": 100 + i, "name": n, "address": a, "category": "카페", "slot": "day"} for i, (n, a, _) in enumerate(CLEAN)]
out, _ = heal_all_spots(rows)
got = {s["id"]: s["name"] for s in out}
for i, (name, _) in enumerate(KEEP):
    assert got[i] == name, (name, got[i])
for i, (name, _, want) in enumerate(CLEAN):
    assert got[100 + i] == want, (name, got[100 + i], want)
print("ok", len(KEEP) + len(CLEAN))
