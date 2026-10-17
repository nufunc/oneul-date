"""TourAPI 명소 경로 1km 이름 중복 판정(P-159) 회귀 테스트: python3 test_tourapi_landmark_duplicate.py 또는 pytest"""
from miners import tourapi_miner as m

M_LAT = 1 / 111_320  # 위도 1m

ROWS = [
    {"id": 1342, "name": "죽녹원", "address": "전남 담양군 담양읍 죽녹원로 119", "lat": 35.3270, "lng": 126.9860},
    {"id": 2, "name": "성산일출봉", "address": "제주특별자치도 서귀포시 성산읍 일출로 284-12", "lat": 33.4580, "lng": 126.9425},
    {"id": 3, "name": "세화해변", "address": "제주특별자치도 제주시 구좌읍 세화리 1477-5", "lat": 33.5250, "lng": 126.8600},
    {"id": 4, "name": "송정공원", "address": "광주 광산구 송정동 1", "lat": 35.1380, "lng": 126.7930},
    {"id": 5, "name": "보성비봉공룡공원", "address": "전라남도 보성군 득량면 공룡로 822-71", "lat": 34.7180, "lng": 127.1670},
]


def _nearby(title, address, lat, lng, rows=ROWS):
    orig = m._rows_near
    m._rows_near = lambda *a: rows
    try:
        return m.landmark_name_nearby("u", {}, title, address, lat, lng)
    finally:
        m._rows_near = orig


def test_same_name_other_address_33m_is_duplicate():
    assert _nearby("죽녹원", "전라남도 담양군 담양읍 향교리 산 44", 35.3270 + 33 * M_LAT, 126.9860)


def test_bracket_note_147m_is_duplicate():
    assert _nearby("성산일출봉 [유네스코 세계자연유산]", "제주특별자치도 서귀포시 성산읍 성산리 1", 33.4580 + 147 * M_LAT, 126.9425)


def test_beach_spelling_is_duplicate():
    assert _nearby("세화해수욕장", "제주특별자치도 제주시 구좌읍 해녀박물관길 27", 33.5250 + 87 * M_LAT, 126.8600)


def test_leading_region_word_is_dropped():
    assert _nearby("비봉공룡공원", "전라남도 보성군 득량면 비봉리", 34.7180 + 193 * M_LAT, 127.1670)


def test_same_name_in_other_city_or_beyond_1km_is_not_duplicate():
    assert not _nearby("송정공원", "부산광역시 해운대구 송정동 1", 35.1790, 129.1990)
    assert not _nearby("송정공원", "광주광역시 광산구 송정동 2", 35.1380 + 1100 * M_LAT, 126.7930)


def test_different_name_nearby_is_not_duplicate():
    assert not _nearby("죽녹원 대나무숲 카페", "전남 담양군 담양읍 죽녹원로 120", 35.3270, 126.9860)


def test_no_coords_passes_and_failed_lookup_blocks():
    assert not _nearby("죽녹원", "", None, None)
    orig = m._rows_near

    def fail(*a):
        raise OSError("timeout")
    m._rows_near = fail
    try:
        assert m.landmark_name_nearby("u", {}, "죽녹원", "", 35.3270, 126.9860)
    finally:
        m._rows_near = orig


def test_neighborhood_park_code_is_not_landmark():
    assert "VE030400" not in m.LANDMARK_LCLS
    assert len(m.LANDMARK_LCLS) == 15


if __name__ == "__main__":
    for fn in [v for k, v in list(globals().items()) if k.startswith("test_")]:
        fn()
    print("ok")
