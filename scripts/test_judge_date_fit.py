"""judge_date_fit 규칙 회귀 테스트: python3 scripts/test_judge_date_fit.py 또는 pytest. 행은 2026-10-03 라이브 행의 값이다."""
import json
import os

from judge_date_fit import DINER_VERIFIED, PUBLIC_FACILITY_KEEP, PUBLIC_FACILITY_VERIFIED, REGION_MISMATCH_VERIFIED, judge


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
    with open(os.path.join(os.path.dirname(__file__), "..", "docs", "planning", "neighborhood-restaurant-20261003.json"),
              encoding="utf-8") as f:
        result = json.load(f)
    assert DINER_VERIFIED == set(result["close_ids"])
    kept = {r["id"] for v in result["keep"].values() for r in v} | {r["id"] for r in result["keep_web_curated"]["rows"]}
    kept |= {r["id"] for r in result["review_not_closed"]["rows"]} | {3858, 1789342066290, 1789275924820}
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
    with open(os.path.join(os.path.dirname(__file__), "..", "docs", "planning", "region-mismatch-20261003.json"),
              encoding="utf-8") as f:
        result = json.load(f)
    assert REGION_MISMATCH_VERIFIED == set(result["close_ids"])
    kept = {r["id"] for r in result["rows"] if r["verdict"] != "폐기"} | {r["id"] for r in result["keep_notes"]}
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
    with open(os.path.join(os.path.dirname(__file__), "..", "docs", "planning", "public-facility-20261004.json"),
              encoding="utf-8") as f:
        result = json.load(f)
    assert PUBLIC_FACILITY_VERIFIED == set(result["close_ids"]) and len(PUBLIC_FACILITY_VERIFIED) == 98
    assert PUBLIC_FACILITY_KEEP == set(result["keep_ids"]) == {r["id"] for r in result["keep"]}
    kept = PUBLIC_FACILITY_KEEP | {r["id"] for r in result["review"]} | {r["id"] for r in result["out_of_scope"]}
    assert not kept & PUBLIC_FACILITY_VERIFIED, kept & PUBLIC_FACILITY_VERIFIED


def test_tourapi_golf_fishing_monument():
    """P-057 신규 유입 이름. 검토로만 올리고 닫지 않는다"""
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
    assert {11, 12, 13, 14} <= set(review) and not out["close"]
    assert not {21, 22, 23, 25} & set(review), review
    assert not any(r.startswith(("R18", "R19", "R20")) for r in review.get(24, []))


if __name__ == "__main__":
    test_judge_lists()
    test_described_name()
    test_mall_tenant()
    test_neighborhood_diner()
    test_region_mismatch()
    test_public_facility()
    test_tourapi_golf_fishing_monument()
    print("ok")
