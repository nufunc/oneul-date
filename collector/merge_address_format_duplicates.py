#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 주소 표기 차이(건물명/층수 유무, 시도 축약형)만 다른 근접 중복 81그룹 병합

데이터 큐레이션 감사(oneul-date-ae, "데이터 큐레이션 감사관")가 발견:
name+address 완전일치 dedup에는 안 걸리지만, 시도 축약형·건물명/층수
접미사·"지하 N층" 띄어쓰기를 정규화하면 완전히 같은 주소가 되는
81그룹. 정규화해도 번지수 자체가 다르거나(별개 출입구/건물일 수 있음)
주소가 NULL인 경우는 사람 확인이 필요해 이 목록에서 제외했다.

그룹별로 completeness score(위경도·이미지·요약 길이)가 가장 높은
행을 남기고 나머지를 삭제한다(동점이면 낮은 id). 기본은 드라이런,
--execute 를 줘야 실제 DELETE.
"""

import os
import sys
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_worker import load_env

_env = load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _env.get("SUPABASE_URL") or "http://152.70.89.210:18088"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or _env.get("SUPABASE_SERVICE_KEY") or ""

# name -> [id, id, ...] (2026-09-23 데이터 큐레이션 감사관 유형1-3 목록)
VERIFIED_GROUPS = {
    "몬드리안서울이태원 알티튜드 풀 앤 라운지": [6142, 8156],
    "테라로사 경포호수점": [507, 3388],
    "그라운드시소 성수": [528, 4004, 4153, 1935],
    "사천 바다케이블카": [6469, 2023],
    "구하우스 미술관": [703, 2803],
    "세빛섬 채빛퀴진": [7913, 5596],
    "청사포 다릿돌전망대": [2715, 1448],
    "러스트베이커리": [6793, 1074],
    "르챔버": [8501, 2282],
    "서귀포 올레시장 야시장": [1633, 423],
    "파인앤코": [1716, 4693],
    "앨리스 청담": [1714, 4691],
    "송소고택": [7888, 1297],
    "노형슈퍼마켙": [2047, 4162],
    "비루개": [3141, 2808],
    "샵메이커즈": [2509, 5194],
    "미메시스 아트 뮤지엄": [3148, 680],
    "목포 평화광장 춤추는 바다분수": [4454, 5680],
    "아쿠아플라넷 제주": [4002, 2045],
    "듁스커피 쇼룸": [6208, 1675],
    "바다앞테라스 영종도": [5029, 4522],
    "아르떼뮤지엄 강릉": [9347, 4156],
    "아르떼뮤지엄 여수": [3992, 1340, 4157],
    "아르떼뮤지엄 제주": [3994, 2046],
    "전주 팔복예술공장": [4242, 311],
    "어쩌다책방": [4294, 2458],
    "레이어드 연남점": [1097, 2370],
    "젠틀몬스터 도산 플래그십스토어": [1707, 1819],
    "청도 프로방스 포토랜드": [6361, 2006],
    "스몹 스타필드 고양점": [1957, 2912],
    "서울스카이": [4252, 2652],
    "통영 디피랑": [4254, 2021],
    "디에이블 광안점": [2112, 935, 1451, 6652],
    "세빛섬 튜브스터": [6887, 8565],
    "대전 엑스포과학공원 한빛탑 음악분수": [5666, 6342],
    "볼트82": [8507, 4704],
    "북악스카이웨이 팔각정": [476, 6288],
    "맘모스베이커리": [1307, 3944],
    "담양 죽녹원": [3541, 1517],
    "보리암": [5770, 1395],
    "부산 엑스더스카이": [1444, 341],
    "랜디스도넛 제주애월점": [1519, 997],
    "죽녹원": [1342, 3335],
    "양키통닭 문래본점": [1732, 1072],
    "바다정원": [3389, 1438],
    "베르데 문래": [6795, 1769],
    "골든블루마리나": [8559, 6886],
    "칠성조선소": [6638, 509],
    "미스티크": [1372, 5766],
    "목포 해상케이블카": [5774, 2034],
    "헐스밴드": [9498, 1396],
    "호텔샌드": [9503, 6477],
    "다대포 꿈의 낙조분수": [4663, 5647],
    "스카이라인루지 통영": [1370, 5412],
    "서피비치": [1433, 4639],
    "비발디파크 루지월드": [5414, 1973],
    "딤타오 본점": [1443, 2111],
    "칠암사계": [1466, 3419],
    "폰트 문래점": [1767, 6796],
    "밀락더마켓": [1450, 514],
    "스몹 스타필드 하남점": [2911, 1956],
    "스몹 스타필드 수원점": [2914, 1958],
    "빛의 시어터": [9341, 4151, 1937],
    "전주왱이콩나물국밥전문점": [3923, 120],
    "아르떼뮤지엄 부산": [3993, 4159, 2016],
    "코엑스 아쿠아리움": [3997, 2152],
    "아쿠아플라넷 여수": [4001, 2159],
    "바람의언덕": [4114, 1379],
    "아쿠아플라넷 일산": [1966, 694],
    "롯데월드 아쿠아리움": [3998, 1955],
    "송도 센트럴파크": [5620, 4621],
    "오목대": [614, 4459],
    "성북동 누룽지백숙": [1850, 1083],
    "아쿠아플라넷 광교": [631, 2154],
    "익스퀴진": [2060, 3560],
    "지혜의숲": [2797, 2481],
    "젊은달와이파크": [1251, 4216],
    "나인블럭 뷰 팔당점": [5635, 715],
    "솔거미술관": [1477, 4233],
    "성심당 케익부띠끄": [1494, 2432],
    "대관령 하늘목장": [2212, 8602],
}


def build_headers(extra=None):
    headers = dict(extra or {})
    if SUPABASE_KEY:
        headers["apikey"] = SUPABASE_KEY
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def fetch_spots(ids):
    headers = build_headers()
    id_list = ",".join(str(i) for i in ids)
    url = f"{SUPABASE_URL}/rest/v1/spots?select=id,name,lat,lng,image_url,summary&id=in.({id_list})"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode("utf-8"))


def completeness_score(row):
    score = 0
    if row.get("lat") and row.get("lng"):
        score += 2
    if row.get("image_url"):
        score += 1
    if row.get("summary") and len(row["summary"]) > 15:
        score += 1
    return score


def delete_spot(spot_id):
    headers = build_headers()
    url = f"{SUPABASE_URL}/rest/v1/spots?id=eq.{spot_id}"
    req = urllib.request.Request(url, headers=headers, method="DELETE")
    with urllib.request.urlopen(req) as res:
        return res.status in (200, 204)


def main():
    execute = "--execute" in sys.argv

    all_ids = [i for ids in VERIFIED_GROUPS.values() for i in ids]
    print(f"🔍 [대상 조회] {len(VERIFIED_GROUPS)}그룹 / {len(all_ids)}건")
    rows = fetch_spots(all_ids)
    by_id = {r["id"]: r for r in rows}

    plan = []  # (keep_id, [drop_ids], name)
    missing = []
    for name, ids in VERIFIED_GROUPS.items():
        present = [i for i in ids if i in by_id]
        if len(present) < 2:
            missing.append((name, ids, present))
            continue
        ranked = sorted(present, key=lambda i: (-completeness_score(by_id[i]), i))
        keep = ranked[0]
        drop = ranked[1:]
        plan.append((keep, drop, name))

    if missing:
        print(f"\n⚠️ [조회 실패/이미 정리됨] {len(missing)}그룹 (건너뜀)")
        for name, ids, present in missing[:10]:
            print(f"  - {name}: 요청 {ids} / 실제 존재 {present}")

    total_drop = sum(len(drop) for _, drop, _ in plan)
    print(f"\n▶ 병합 대상 {len(plan)}그룹 / 삭제 {total_drop}건, 대표 샘플 10선:")
    for keep, drop, name in plan[:10]:
        print(f"  - {name}: 유지 {keep}, 삭제 {drop}")

    if not execute:
        print("\n🧪 드라이런 모드입니다. 실제로 병합하려면 --execute 를 붙여 다시 실행하세요.")
        return

    print(f"\n⚡ [병합 실행] {total_drop}건 삭제 중...")
    success = 0
    fail = 0
    for keep, drop, name in plan:
        for drop_id in drop:
            try:
                if delete_spot(drop_id):
                    success += 1
                else:
                    fail += 1
            except Exception as e:
                fail += 1
                print(f"  ❌ 삭제 실패 id={drop_id} ({name}): {e}")

    print(f"\n🎉 [완료] {success}/{total_drop}건 삭제 (실패 {fail}건)")


if __name__ == "__main__":
    main()
