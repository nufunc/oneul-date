"""judge_date_fit 규칙 회귀 테스트: python3 scripts/test_judge_date_fit.py 또는 pytest. 행은 2026-10-03 라이브 행의 값이다."""
from judge_date_fit import judge


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
    assert lists["close"] == {1790532212259, 1789060176209, 1788681699939, 1790258774490, 1790311914590, 7199}, lists["close"]
    assert 3858 not in set().union(*lists.values())  # 명동교자는 어느 목록에도 들지 않고 남는다
    assert 1789885634448 not in lists["close"]  # 동네 식당은 주관 판정이라 기계 규칙으로 닫지 않는다
    assert 1 not in set().union(*lists.values())  # 기간이 있는 행사는 남는다
    assert 2 in lists["review"]  # web 행사는 상설 장소가 섞여 검토로만 간다
    assert not {3, 4, 5} & lists["close"]  # 성심당문화원(빵집), 알파인코스터, ➔ 경로 표기는 닫지 않는다
    assert 4905 not in lists["fix"]  # 캠핑어가 붙은 식당은 숙소로 바꾸지 않는다
    assert out["fix"] == [{**out["fix"][0], "id": 1788818276330, "patch": {"slot": "stay"}}]


if __name__ == "__main__":
    test_judge_lists()
    print("ok")
