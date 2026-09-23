"""normalize_spot_address 회귀 테스트: python3 test_normalize_spot_address.py 또는 pytest"""
from supabase_worker import normalize_spot_address as n

CASES = [
    ("서울 송파구 올림픽로 300 롯데월드타워 117-123층", "서울송파구올림픽로300"),
    ("부산 해운대구 달맞이길 30 엘시티 랜드마크타워 98-100층", "부산해운대구달맞이길30"),
    ("전남 여수시 오동도로 61-11 아쿠아리움", "전남여수시오동도로61-11"),
    ("전라남도 여수시 오동도로 61-11", "전남여수시오동도로61-11"),
    ("서울 강남구 도산대로67길 19 힐탑빌딩 2층", "서울강남구도산대로67길19"),
    ("대전 중구 중교로 73번길 6 1층~2층", "대전중구중교로73번길6"),
    ("서울 종로구 가회동 123 1층", "서울종로구가회동123"),
    ("전남광주통합특별시 남구 고싸움로 2", "광주남구고싸움로2"),
    ("광주광역시 남구 고싸움로 2", "광주남구고싸움로2"),
    ("전남광주통합특별시 여수시 오동도로 61-11", "전남여수시오동도로61-11"),
    ("서울 강남구", "서울강남구"),
    ("", ""),
]


def test_normalize_spot_address():
    for raw, expected in CASES:
        assert n(raw) == expected, (raw, n(raw))


if __name__ == "__main__":
    test_normalize_spot_address()
    print(f"ok {len(CASES)}")
