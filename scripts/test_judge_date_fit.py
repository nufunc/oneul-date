"""judge_date_fit 규칙 회귀 테스트: python3 scripts/test_judge_date_fit.py 또는 pytest. 행은 2026-10-03 라이브 행의 값이다."""
import json
import os

from judge_date_fit import (DINER_VERIFIED, GOLF_RELIC_KEEP, PUBLIC_FACILITY_KEEP, PUBLIC_FACILITY_VERIFIED, R3_SAME_ADDRESS_EXEMPT,
                            R21_VERIFIED, R23_VERIFIED, R24_VERIFIED, R25_VERIFIED, R26_VERIFIED, R27_VERIFIED,
                            REGION_MISMATCH_VERIFIED, judge)


def fixture(name):
    """결과 파일(docs/planning, 추적하지 않는다)에서 테스트에 쓰는 id만 떼어 둔 scripts/fixtures/judge_date_fit/result_ids.json"""
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "judge_date_fit", "result_ids.json"),
              encoding="utf-8") as f:
        return json.load(f)[name]


def row(id, name, category, slot, address, source, event=None):
    return {"id": id, "name": name, "category": category, "slot": slot, "address": address,
            "source": {"type": source, **({"event": event} if event else {})}}


ROWS = [
    row(3858, "명동교자 본점", "분식", "day", "서울 중구 명동10길 29", "web"),
    row(1789885634448, "곤드레밥집 중동점", "한식", "evening", "경기 부천시 원미구 신흥로 140", "blog_mining"),
    row(1790532212259, "안양문화원", "문화시설", "day", "경기도 안양시 만안구 현충로 53 (안양동)", "tourapi"),
    row(1789060176209, "고성문화원(경남)", "문화시설", "day", "경상남도 고성군 고성읍 성내로 54", "tourapi"),
    row(1788681699939, "청도반시축제", "축제/행사", "evening", "경상북도 청도군 화양읍 청려로 1846", "tourapi"),
    row(1, "청도반시축제", "축제/행사", "evening", "경상북도 청도군 화양읍 청려로 1846", "tourapi",
        {"start": "2026-10-09", "end": "2026-10-12"}),
    row(2, "인제 가을꽃축제장", "축제/행사", "day", "강원 인제군", "web"),
    row(1788818276330, "거제자연휴양림캠핑장", "레포츠/체험", "day", "경상남도 거제시 동부면 거제중앙로 325", "tourapi"),
    row(4905, "북한산 글램핑식당 산들애", "육류,고기", "day", "서울 은평구 대서문길 43-16", "web"),
    row(1790258774490, "아산시 평생학습관", "문화시설", "day", "충청남도 아산시", "tourapi"),
    row(3, "성심당문화원", "문화원", "day", "대전 중구", "youtube_vlog"),
    row(1790311914590, "[하영올레] 1코스", "레포츠/체험", "day", "제주특별자치도 서귀포시", "tourapi"),
    row(7199, "🥃 서울 지역", "간식", "night", "서울", "web"),
    row(4, "하이원 알파인코스터", None, "day", "강원 정선군", "web"),
    row(5, "보발재 단풍 와인딩 ➔ 해발 600m 카페산", "고개", "day", "충북 단양군", "web"),
]


def test_judge_lists():
    out = judge(ROWS)
    lists = {k: {item["id"] for item in v} for k, v in out.items()}
    assert lists["close"] == {1789885634448, 1790532212259, 1789060176209, 1788681699939, 1790258774490, 1790311914590, 7199}, lists["close"]
    assert 3858 not in set().union(*lists.values())  # 명동교자는 어느 목록에도 들지 않고 남는다
    assert 1789885634448 in lists["close"]  # 곤드레밥집 중동점은 P-048 동네 식당으로 닫는다
    assert 1 not in set().union(*lists.values())  # 기간이 있는 행사는 남는다
    assert 2 in lists["review"]  # web 행사는 상설 장소가 섞여 검토로만 간다
    assert not {3, 4, 5} & lists["close"]  # 성심당문화원(빵집), 알파인코스터, ➔ 경로 표기는 닫지 않는다
    assert 4905 not in lists["fix"]  # 캠핑어가 붙은 식당은 숙소로 바꾸지 않는다
    assert out["fix"] == [{**out["fix"][0], "id": 1788818276330, "patch": {"slot": "stay"}}]


MALL_ROWS = [
    row(1789415062814, "상춘재 더현대서울", "한식", "evening", "서울 영등포구 여의대로 108", "youtube_vlog"),
    row(6515, "슈퍼말차 더현대서울", None, "day", "서울 영등포구 여의대로 108 더현대서울 지하1층", "web"),
    row(87, "시나루", "디자인문구", "day", "서울 영등포구 여의대로 108", "web"),
    row(1790683586837, "쇼코엘 광화문점", "카페", "day", "서울 중구 세종대로 136", "web"),  # 같은 주소의 몰 이름 행은 P-047로 닫혔다
]
MALL_KEEP = [  # 몰 자체, 몰 안 목적지, 호텔, 몰 밖 상호
    row(3131, "별마당도서관 스타필드 수원점", "도서관", "day", "경기 수원시 장안구 수성로 175", "web"),
    row(1789545765162, "별마당도서관 스타필드코엑스몰", "도서관", "day", "서울 강남구 삼성동 159-9 지하1층-1층", "youtube_vlog"),
    row(1790292415240, "스타필드 하남", "쇼핑/소품", "day", "경기도 하남시 미사대로 750 (신장동)", "tourapi"),
    row(1788818282373, "갤러리아백화점 명품관", "쇼핑/소품", "day", "서울특별시 강남구 압구정로 343 (압구정동)", "tourapi"),
    row(364, "더현대 서울 ALT.1", "전시관", "day", "서울 영등포구 여의대로 108", "web"),
    row(8180, "페어몬트 앰배서더 서울 마리포사", "양식", "evening", "서울 영등포구 여의대로 108", "web"),
    row(1790758680673, "안주백화점", "실내포장마차", "night", "서울 관악구 남부순환로 1592", "youtube_vlog"),
    row(4826, "부천 중동 롯데백화점 뒤 미식야장거리", "선거관리위원회", "night", "경기 부천시 원미구 중동로248번길 52", "web"),
]


def test_mall_tenant():
    out = judge(MALL_ROWS + MALL_KEEP)
    assert {item["id"] for item in out["close"]} == {1789415062814}  # 카카오로 입점을 확인한 행만 닫는다
    review = {item["id"] for item in out["review"] if "R6c_몰_입점매장_미확인" in item["rules"]}
    assert review == {6515, 87, 1790683586837}, review  # 확인 못 한 이름 규칙 행과 주소로만 걸린 행은 검토
    keep = {r["id"] for r in MALL_KEEP}
    assert not keep & {item["id"] for item in out["close"]}
    assert not keep & {item["id"] for v in out.values() for item in v if any(x.startswith("R6c") for x in item["rules"])}


DINER_ROWS = [
    row(1789885634448, "곤드레밥집 중동점", "한식", "evening", "경기 부천시 원미구 신흥로 140", "blog_mining"),
    row(1789342066290, "경모네젓갈백반", "한식", "day", "충남 논산시 강경읍 옥녀봉로27번길 12", "youtube_vlog"),  # 오탐
    row(1789275924820, "달콤언니", "분식", "day", "부산 수영구 수영로554번길 7", "youtube_vlog"),  # 경계
    row(1788633358697, "모두랑", "분식", "day", "서울 광진구 자양로28길 24", "youtube_vlog"),  # 노포
    row(1791100000000, "새동네김밥", "분식", "day", "서울 관악구", "blog_mining"),  # 측정 뒤에 들어온 행
    row(1791100000001, "새동네초밥", "일식", "day", "서울 관악구", "blog_mining"),
]


def test_neighborhood_diner():
    out = judge(DINER_ROWS)
    assert {item["id"] for item in out["close"]} == {1789885634448}
    review = {item["id"] for item in out["review"] if "R15_동네_식당_미측정" in item["rules"]}
    assert review == {1791100000000}, review  # 네이버 측정값이 없는 새 행은 검토로만 간다
    # 닫는 목록이 결과 파일의 close_ids와 같고 남김 목록(명동교자 본점, 오탐, 경계 포함)과 겹치지 않는다
    result = fixture("p048_diner")
    assert DINER_VERIFIED == set(result["close_ids"])
    kept = set(result["kept_ids"]) | {3858, 1789342066290, 1789275924820}
    assert not kept & DINER_VERIFIED, kept & DINER_VERIFIED


def video(id, name, address, title):
    return {**row(id, name, "카페", "day", address, "youtube_vlog"), "source": {"type": "youtube_vlog", "note": f"채널 유튜브 ({title}"}}


REGION_ROWS = [
    video(1788820160544, "잔치떡집", "부산 연제구 쌍미천로73번길 57", "부산 토박이 서면여행📍 ㅣ 부전시장 노포부터 전포 편집샵까지 다 털었습니다"),
    video(1788971886289, "젠젠 성수점", "서울 성동구 연무장11길 10", "81개월 근속 퇴사 브이로그 1탄 | 잠실 맛집"),  # 교정 대상
    video(11, "오뚜기칼국수", "강원 동해시 일출로 1", "성수기가 끝나야 진짜가 보이는 끝판왕 코스"),  # 성수기를 성동구로 읽는다
    video(12, "해운대 달맞이빵 명지점", "부산 강서구 명지국제7로 1", "해운대달맞이빵 명지점"),  # 힌트가 상호 안에 있다
    video(13, "어느카페", "경기 가평군 북면 1", "서울 근교 드라이브 코스"),  # 출발지 표현
]


def test_region_mismatch():
    out = judge(REGION_ROWS)
    assert {item["id"] for item in out["close"]} == {1788820160544}
    review = {item["id"] for item in out["review"] if "R2_출처지역_불일치" in item["rules"]}
    assert review == {1788971886289}, review
    # 닫는 목록이 결과 파일의 close_ids와 같고 오탐, 유지, 교정, 판정 못함 표본과 겹치지 않는다
    result = fixture("p050_region")
    assert REGION_MISMATCH_VERIFIED == set(result["close_ids"])
    kept = set(result["kept_ids"])
    assert not kept & REGION_MISMATCH_VERIFIED, kept & REGION_MISMATCH_VERIFIED


def test_described_name():
    rules = {item["id"]: item["rules"] for items in judge([
        row(4251, "서울달 계류식 가스기구", "회", "day", "서울 영등포구 여의공원로 68", "web"),
        row(363, "KT&G 상상마당 홍대", "공연장", "day", "서울 마포구 양화로 175", "web"),
        row(1788818285589, "선산5일장 (2, 7일)", "쇼핑/소품", "day", "경상북도 구미시 선산읍 단계동길 24", "tourapi"),
        row(5609, "당현천 달빛산책로 & 음악분수", "자연·산책", "day", "서울특별시 노원구 중계동 507-1", "web"),
    ]).values() for item in items}
    assert "R5_설명형_이름" in rules[4251] and "R5_설명형_이름" in rules[363]  # 내보낸 이름 3어절, & 포함
    assert 5609 not in rules and 1788818285589 not in rules  # 내보내기가 & 뒤와 괄호 꼬리를 지워 2어절이다


PUBLIC_ROWS = [
    row(1788818277759, "강진군도서관", "문화시설", "day", "전남 강진군 강진읍 남문길 10", "tourapi"),
    row(3131, "별마당도서관 스타필드 수원점", "도서관", "day", "경기 수원시 장안구 수성로 175", "web"),  # 명소 남김
    row(1788818277908, "농부네 텃밭도서관", "문화시설", "day", "전남 광양시 진상면 청도길 19", "tourapi"),  # 보류
    row(1791100000002, "새동네 체육센터", "스포츠시설", "day", "서울 관악구", "tourapi"),  # 판정 뒤에 들어온 행
]


def test_public_facility():
    out = judge(PUBLIC_ROWS)
    assert {item["id"] for item in out["close"]} == {1788818277759}
    review = {item["id"] for item in out["review"] if "R17_공공시설_미확인" in item["rules"]}
    assert review == {1788818277908, 1791100000002}, review  # 보류와 새 행은 검토, 명소는 이름 규칙에서 뺀다
    # 닫는 목록이 결과 파일의 close_ids와 같고 명소 남김, 보류, 범위 밖 행과 겹치지 않는다
    result = fixture("p055_public_facility")
    assert PUBLIC_FACILITY_VERIFIED == set(result["close_ids"]) and len(PUBLIC_FACILITY_VERIFIED) == 98
    assert PUBLIC_FACILITY_KEEP == set(result["keep_ids"])
    kept = PUBLIC_FACILITY_KEEP | set(result["review_ids"]) | set(result["out_of_scope_ids"])
    assert not kept & PUBLIC_FACILITY_VERIFIED, kept & PUBLIC_FACILITY_VERIFIED


def test_tourapi_golf_fishing_monument():
    """P-057 신규 유입 이름. P-063부터 닫고 애매한 행만 검토로 남긴다"""
    rows = [row(11, "솔트베이GC", "레포츠/체험", "day", "인천", "tourapi"), row(12, "송전지 낚시터", "레포츠/체험", "day", "경기", "tourapi"),
            row(13, "어제 달천 충렬사비", "관광지", "day", "충북", "tourapi"), row(14, "보성 문익점 부조묘", "관광지", "day", "전남", "tourapi"),
            row(21, "보광미니골프장", "레포츠/체험", "day", "강원", "tourapi"), row(22, "종묘", "관광지", "day", "서울", "tourapi"),
            row(23, "골굴사 마애여래좌상", "관광지", "day", "경북", "tourapi"), row(24, "아덴힐리조트&골프", "숙박", "stay", "경기", "tourapi"),
            row(25, "송추CC", "레포츠/체험", "day", "경기", "web")]
    rows += [row(31, "하늘그린캠프", "레포츠/체험", "day", "경기", "tourapi"), row(32, "캠프그리브스", "관광지", "day", "경기", "tourapi"),
             row(33, "소금강행복펜션마트", "쇼핑/소품", "day", "강원", "tourapi"), row(34, "가평 캠프통아일랜드 수상레저", "수상스포츠", "day", "경기", "web")]
    out = judge(rows)
    assert [item["id"] for item in out["fix"]] == [31]  # 캠프·펜션은 tourapi 레포츠/체험만 stay로 고친다
    review = {item["id"]: item["rules"] for item in out["review"]}
    assert {item["id"] for item in out["close"]} == {11, 12, 13, 14}
    assert not {21, 22, 23, 25} & set(review), review
    assert not any(r.startswith(("R18", "R19", "R20")) for r in review.get(24, []))


def test_golf_fishing_relic_keep():
    """P-063 애매 3곳과 이름 제외 낚시터는 닫지 않고 검토로 남긴다"""
    rows = [row(1790667560577, "리베라컨트리클럽", "레포츠/체험", "day", "경기", "tourapi"),
            row(1790307190897, "경주 김유신묘", "관광지", "day", "경북", "tourapi"),
            row(41, "드림바다실내낚시터", "레포츠/체험", "day", "서울", "tourapi"), row(42, "소래바다낚시터", "레포츠/체험", "day", "인천", "tourapi"),
            row(43, "만정바다좌대낚시터", "레포츠/체험", "day", "경기", "tourapi"), row(44, "방길낚시캠핑장", "레포츠/체험", "stay", "충남", "tourapi")]
    out = judge(rows)
    assert not out["close"], out["close"]
    assert {item["id"] for item in out["review"]} == {r["id"] for r in rows}
    result = fixture("p063_golf_relic")
    assert GOLF_RELIC_KEEP == set(result["keep_review_ids"]["golf"]) | set(result["keep_review_ids"]["relic"])
    assert result["close_count"] == 239


def diner(id, name, category, source, reviews, lat=37.5, lng=127.0):
    return {**row(id, name, category, "day", "서울 노원구 광운로 1", source), "lat": lat, "lng": lng,
            "social_links": {"kakaomap": {"review_count": reviews}} if reviews is not None else {}}


def test_everyday_diner_sparse():
    """P-068 R22: 닫는 규칙이 아니라 검토 규칙이다. 조건 다섯 가운데 DB로 재는 네 가지를 하나씩 어긋나게 해 본다"""
    rows = [diner(1, "미식성", "중식", "blog_mining", 12),
            diner(2, "추억의옛날통닭", "치킨", "catchtable_miner", 30, 37.6),  # 리뷰 30은 경계 안
            diner(3, "청평어죽", "한식", "community_miner", 31, 37.7),  # 리뷰 31
            diner(4, "솔밥", "한식", "web", 5, 37.8),  # web 출처
            diner(5, "영상식당", "한식", "youtube_vlog", 5, 37.9),  # 영상 출처
            diner(6, "레스토랑 가온", "이탈리안", "blog_mining", 5, 38.0),  # 일상 식사 18종 밖
            diner(7, "리뷰없는집", "한식", "blog_mining", None, 38.1),  # 카카오 리뷰 수 없음
            diner(8, "대흥식당", "한식", "blog_mining", 5, 38.2),  # 이름 패턴 밖의 '식당'은 걸린다
            diner(9, "곤드레밥집 중동점", "한식", "blog_mining", 5, 38.3),  # R15 이름 패턴
            diner(10, "좌표없는집", "한식", "blog_mining", 5)]
    rows[-1]["lat"] = rows[-1]["lng"] = None
    out = judge(rows)
    r22 = {item["id"] for items in out.values() for item in items if "R22_일상식당_저밀도_저리뷰" in item["rules"]}
    assert r22 == {1, 2, 8}, r22
    assert not any("R22_일상식당_저밀도_저리뷰" in item["rules"] for item in out["close"])
    crowded = judge([diner(1, "미식성", "중식", "blog_mining", 12)] + [diner(20 + i, f"이웃{i}", "카페", "web", 500) for i in range(10)])
    assert not [i for i in crowded["review"] if i["id"] == 1 and "R22_일상식당_저밀도_저리뷰" in i["rules"]], crowded  # 이웃 10곳이면 안 걸린다
    nine = judge([diner(1, "미식성", "중식", "blog_mining", 12)] + [diner(20 + i, f"이웃{i}", "카페", "web", 500) for i in range(9)])
    assert any(i["id"] == 1 and "R22_일상식당_저밀도_저리뷰" in i["rules"] for i in nine["review"])  # 이웃 9곳은 걸린다
    # 결과 파일의 닫는 24곳은 라이브 DB에서 이 규칙에 걸렸던 행이다(여기서는 이 규칙이 close가 되지 않는 것만 본다)
    result = fixture("p068_diner")
    assert len(result["close_ids"]) == 24 and not set(result["close_ids"]) & set(result["hold_ids"])


def test_solo_confucian():
    """P-067 R21: 카카오 패널로 확인한 id만 닫고, 같은 조건의 나머지는 검토로 보낸다"""
    verified = sorted(R21_VERIFIED)[0]
    def site(id, name, lat, category="관광지", source="tourapi"):
        return {**row(id, name, category, "day", "경상남도 진주시 이반성면 용암길 59-2", source), "lat": lat, "lng": 128.0}
    def hits(rows, action, rule):
        return {i["id"] for i in judge(rows)[action] if rule in i["rules"]}
    rows = [site(verified, "가호서원", 35.0),
            site(2, "고부향교(전북)", 35.1),  # 괄호 꼬리는 허용, 패널 확인 목록 밖이라 검토
            site(3, "국회의사당", 35.2),  # 의사당 제외
            site(4, "종택한옥", 35.3),  # 이름이 끝나지 않는다
            site(5, "안동 종택", 35.4, category="숙박"),
            site(6, "웹서원", 35.5, source="web"),
            {**site(7, "좌표없는서원", 0), "lat": None, "lng": None}]
    assert hits(rows, "close", "R21_단독_유교시설") == {verified}
    assert hits(rows, "review", "R21_단독_유교시설_미확인") == {2}
    near = rows[:1] + [site(8, "이웃 카페", 35.0 + 0.003, category="카페", source="web")]  # 약 333m
    assert not hits(near, "close", "R21_단독_유교시설"), "500m 안에 열린 행이 있으면 닫지 않는다"
    far = rows[:1] + [site(8, "먼 카페", 35.0 + 0.006, category="카페", source="web")]  # 약 667m
    assert hits(far, "close", "R21_단독_유교시설") == {verified}
    result = fixture("p067_confucian")
    assert len(R21_VERIFIED) == 165 and R21_VERIFIED == set(result["close_ids"]) and not R21_VERIFIED & set(result["review_ids"])


def test_solo_village():
    """P-076 R23: 확인한 129곳만 닫고 경계 6곳과 목록 밖은 검토로 보낸다"""
    result = fixture("p076_village")
    boundary = set(result["boundary_ids"])
    assert len(R23_VERIFIED) == 129 and len(boundary) == 6 and R23_VERIFIED == set(result["ids"]) - boundary
    verified = sorted(R23_VERIFIED)[0]
    def site(id, name, lat, category="관광지", source="tourapi"):
        return {**row(id, name, category, "day", "경상남도 합천군 가야면 야천로 101", source), "lat": lat, "lng": 128.0}
    def hits(rows, action, rule):
        return {i["id"] for i in judge(rows)[action] if rule in i["rules"]}
    rows = [site(verified, "각사산촌생태마을", 35.0),
            site(2, "신규체험마을(합천)", 35.1),  # 괄호 꼬리는 허용, 목록 밖이라 검토
            site(3, "마비정 벽화마을", 35.2),  # 벽화 제외
            site(4, "마을회관", 35.3),  # 이름이 마을로 끝나지 않는다
            site(5, "안동 마을", 35.4, category="숙박"),
            site(6, "웹마을", 35.5, source="web"),
            {**site(7, "좌표없는마을", 0), "lat": None, "lng": None}]
    assert hits(rows, "close", "R23_단독_체험마을") == {verified}
    assert hits(rows, "review", "R23_단독_체험마을_미확인") == {2}
    gap = [site(i, "유수암마을", 36.0 + n * 0.1) for n, i in enumerate(boundary)]
    assert not hits(gap, "close", "R23_단독_체험마을"), "경계 6곳 id는 닫지 않는다"
    assert hits(gap, "review", "R23_단독_체험마을_미확인") == boundary
    near = rows[:1] + [site(8, "이웃 카페", 35.0 + 0.003, category="카페", source="web")]  # 약 333m
    assert not hits(near, "close", "R23_단독_체험마을"), "500m 안에 열린 행이 있으면 닫지 않는다"
    far = rows[:1] + [site(8, "먼 카페", 35.0 + 0.006, category="카페", source="web")]  # 약 667m
    assert hits(far, "close", "R23_단독_체험마을") == {verified}


def test_wholesale():
    """P-071 R24: 패널과 네이버로 확인한 25곳만 닫고, 이름 조건만 맞는 나머지는 검토로 보낸다"""
    result = fixture("p071_wholesale")
    boundary = set(result["boundary_ids"])
    assert len(R24_VERIFIED) == 25 and len(boundary) == 3 and R24_VERIFIED == set(result["close_ids"]) - boundary
    verified = sorted(R24_VERIFIED)[0]
    def shop(id, name, category="쇼핑/소품", source="tourapi"):
        return row(id, name, category, "day", "경상남도 김해시 주촌면 서부로1403번길 23-40", source)
    def hits(rows, action, rule):
        return {i["id"] for i in judge(rows)[action] if rule in i["rules"]}
    rows = [shop(verified, "부경축산물주촌도매시장"),
            shop(2, "신사상가"),  # 목록 밖(경계)이라 검토
            shop(3, "가락농수산물종합도매시장"),  # 목록 밖(찾아가는 곳)이라 검토
            shop(4, "남대문 종합상가(본관)"),  # 괄호 꼬리 허용, 목록 밖이라 검토
            shop(5, "명동 지하도상가"),  # 지하도상가 제외
            shop(6, "세운전자상가"),  # 전자·세운 제외
            shop(7, "웹도매시장", source="web"),
            shop(8, "상가 건물 카페", category="카페"),  # 이름이 상가로 끝나지 않는다
            shop(9, "도매시장 카페", category="카페")]  # 쇼핑/소품 밖
    assert hits(rows, "close", "R24_도매시설_전문상가") == {verified}
    assert hits(rows, "review", "R24_도매시설_전문상가_미확인") == {2, 3, 4}
    assert not boundary & hits([shop(i, "신사상가") for i in boundary], "close", "R24_도매시설_전문상가")  # 경계 3곳 id는 닫지 않는다


def test_solo_pier():
    """P-079 R25: 확인한 12곳만 닫고, 이름 조건만 맞는 나머지(경계 3곳 포함)는 검토로 보낸다"""
    result = fixture("p079_pier")
    boundary = set(result["boundary_ids"])
    assert len(R25_VERIFIED) == 12 and len(boundary) == 3 and R25_VERIFIED == set(result["close_ids"]) and not R25_VERIFIED & boundary
    verified = sorted(R25_VERIFIED)[0]
    def pier(id, name, category="관광지", source="tourapi"):
        return row(id, name, category, "day", "경상남도 거제시 사등면 가조로2길 62", source)
    def hits(rows, action, rule):
        return {i["id"] for i in judge(rows)[action] if rule in i["rules"]}
    rows = [pier(verified, "가조도선착장"),
            pier(2, "삼목선착장"),  # 목록 밖(수치로 뺌)이라 검토
            pier(3, "인천항 국제여객터미널", category="레포츠/체험"),  # 레포츠/체험도 이름 조건에 든다
            pier(4, "넛출선착장(영흥)"),  # 괄호 꼬리 허용, 목록 밖이라 검토
            pier(5, "인천국제공항 제2여객터미널"),  # 공항 제외
            pier(6, "선착장 앞 횟집", category="음식점"),  # 이름이 선착장으로 끝나지 않는다
            pier(7, "한강버스 마곡선착장", source="youtube_vlog"),  # tourapi 밖
            pier(8, "이크루즈 여의도선착장", category="카페")]  # 관광지·레포츠/체험 밖
    assert hits(rows, "close", "R25_단독_선착장") == {verified}
    assert hits(rows, "review", "R25_단독_선착장_미확인") == {2, 3, 4}
    assert not boundary & hits([pier(i, "두리선착장") for i in boundary], "close", "R25_단독_선착장")  # 경계 3곳 id는 닫지 않는다
    assert hits([pier(i, "두리선착장") for i in boundary], "review", "R25_단독_선착장_미확인") == boundary


def test_solo_stone_relic():
    """P-085 R26: 확인한 14곳만 닫고, 이름과 고립 조건만 맞는 나머지(경계 4곳 포함)는 검토로 보낸다"""
    result = fixture("p085_stone_relic")
    boundary = set(result["boundary_ids"])
    assert len(R26_VERIFIED) == 14 and len(boundary) == 4 and R26_VERIFIED == set(result["close_ids"]) and not R26_VERIFIED & boundary
    verified = sorted(R26_VERIFIED)[0]
    def relic(id, name, lat, category="관광지", source="tourapi"):
        return {**row(id, name, category, "day", "충청북도 괴산군 사리면 사담리", source), "lat": lat, "lng": 127.8}
    def hits(rows, action, rule):
        return {i["id"] for i in judge(rows)[action] if rule in i["rules"]}
    rows = [relic(verified, "괴산 봉학사지 오층석탑", 35.0),
            relic(2, "삼릉계곡마애석가여래좌상", 35.1),  # 목록 밖(수치로 뺌)이라 검토
            relic(3, "신규 석조여래입상(영주)", 35.2),  # 괄호 꼬리 허용, 목록 밖이라 검토
            relic(4, "강댕이 미륵불", 35.3),  # 미륵불도 이름 조건에 든다
            relic(5, "석탑공원", 35.4),  # 이름이 석탑으로 끝나지 않는다
            relic(6, "마애불 카페", 35.5, category="카페"),  # 관광지 밖
            relic(7, "석불입상", 35.6, source="web"),  # tourapi 밖
            {**relic(8, "좌표없는 삼층석탑", 0), "lat": None, "lng": None}]
    assert hits(rows, "close", "R26_단독_석조유물") == {verified}
    assert hits(rows, "review", "R26_단독_석조유물_미확인") == {2, 3, 4}
    gap = [relic(i, "상가리미륵불", 36.0 + n * 0.1) for n, i in enumerate(boundary)]
    assert not hits(gap, "close", "R26_단독_석조유물"), "경계 4곳 id는 닫지 않는다"
    assert hits(gap, "review", "R26_단독_석조유물_미확인") == boundary
    near = rows[:1] + [relic(9, "이웃 카페", 35.0 + 0.003, category="카페", source="web")]  # 약 333m
    assert not hits(near, "close", "R26_단독_석조유물"), "500m 안에 열린 행이 있으면 닫지 않는다"


def test_solo_reservoir():
    """P-089 R27: 확인한 12곳만 닫고, 이름과 고립 조건만 맞는 나머지(경계 12곳, 패널 불일치 1곳 포함)는 검토로 보낸다"""
    result = fixture("p089_reservoir")
    boundary, mismatch = set(result["boundary_ids"]), set(result["mismatch_ids"])
    assert len(R27_VERIFIED) == 12 and len(boundary) == 12 and R27_VERIFIED == set(result["close_ids"])
    assert not R27_VERIFIED & (boundary | mismatch)
    verified = sorted(R27_VERIFIED)[0]
    def pond(id, name, lat, category="관광지", source="tourapi"):
        return {**row(id, name, category, "day", "충청남도 아산시 인주면 문방리", source), "lat": lat, "lng": 127.0}
    def hits(rows, action, rule):
        return {i["id"] for i in judge(rows)[action] if rule in i["rules"]}
    rows = [pond(verified, "대덕저수지", 35.0, category="레포츠/체험"),
            pond(2, "예당저수지", 35.1, category="레포츠/체험"),  # 목록 밖(수치로 뺌)이라 검토
            pond(3, "기산저수지(공주)", 35.2),  # 괄호 꼬리 허용, 목록 밖이라 검토
            pond(4, "잠홍 저수지(상홍지)", 35.3),  # 띄어 쓴 이름도 든다
            pond(5, "저수지공원", 35.4),  # 이름이 저수지로 끝나지 않는다
            pond(6, "저수지 카페", 35.5, category="카페"),  # 관광지·레포츠 밖
            pond(7, "마둔저수지", 35.6, source="web"),  # tourapi 밖
            {**pond(8, "좌표없는 저수지", 0), "lat": None, "lng": None}]
    assert hits(rows, "close", "R27_단독_저수지") == {verified}
    assert hits(rows, "review", "R27_단독_저수지_미확인") == {2, 3, 4}
    gap = [pond(i, "고풍저수지", 36.0 + n * 0.1) for n, i in enumerate(sorted(boundary | mismatch))]
    assert not hits(gap, "close", "R27_단독_저수지"), "경계 12곳과 불일치 1곳 id는 닫지 않는다"
    assert hits(gap, "review", "R27_단독_저수지_미확인") == boundary | mismatch
    near = rows[:1] + [pond(9, "이웃 카페", 35.0 + 0.003, category="카페", source="web")]  # 약 333m
    assert not hits(near, "close", "R27_단독_저수지"), "500m 안에 열린 행이 있으면 닫지 않는다"


def test_same_address_exempt():
    rows = [row(2, "스타필드 고양", "쇼핑", "day", "경기 고양시 덕양구 고양대로 1955", "web")] + [
        row(1791100000010 + i, f"새 매장 {i}", "카페", "day", "경기 고양시 덕양구 고양대로 1955 1층", "web") for i in range(4)]
    rules = {item["id"]: item["rules"] for items in judge(rows).values() for item in items}
    assert "R3_같은주소_5행이상" not in rules.get(2, [])  # 사람이 남긴 행은 그때 주소 그대로면 빠진다
    assert all("R3_같은주소_5행이상" in rules[1791100000010 + i] for i in range(4))  # 같은 주소에 새로 든 행은 그대로 걸린다
    moved = judge([{**rows[0], "address": "경기 고양시 덕양구 고양대로 1957"}] + [
        {**r, "address": "경기 고양시 덕양구 고양대로 1957"} for r in rows[1:]])
    assert any(item["id"] == 2 and "R3_같은주소_5행이상" in item["rules"] for item in moved["review"])  # 주소가 바뀌면 다시 걸린다
    keep = set(fixture("p064_r3_keep")["reviewed_keep_ids"])
    assert set(R3_SAME_ADDRESS_EXEMPT) == keep - {1788908665523, 1790823926129}  # 둘은 P-063으로 닫혀 뺐다


if __name__ == "__main__":
    test_judge_lists()
    test_described_name()
    test_mall_tenant()
    test_neighborhood_diner()
    test_region_mismatch()
    test_public_facility()
    test_tourapi_golf_fishing_monument()
    test_golf_fishing_relic_keep()
    test_everyday_diner_sparse()
    test_solo_confucian()
    test_solo_village()
    test_wholesale()
    test_solo_pier()
    test_solo_stone_relic()
    test_solo_reservoir()
    test_same_address_exempt()
    print("ok")
