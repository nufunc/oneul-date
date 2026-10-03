#!/usr/bin/env python3
"""검색으로 같은 장소를 확인한 중복 병합과 카테고리 채움(P-053, P-051, P-054), 남은 교정(P-055). 기본은 드라이런이고 --apply일 때만 DB에 쓴다.

P-053: 결과 파일(duplicate-merge-YYYYMMDD.json)의 merge 묶음을 병합 규약대로 합치고, 남길 행 12곳은 KEEP_FIX 값으로 고친다.
  keep_fix는 결과 파일에 문장으로만 있어 값을 KEEP_FIX 표로 옮겼다. 장소 번호를 바꾸면 카카오 장소 링크도 새 번호로 바꾸고(옛 평점은 버린다),
  주소를 바꾸면 area를 새 주소로 다시 계산한다.
P-051, P-054: MERGES와 FILLS 표의 행만 쓴다. 닫기는 close_date_fit_spots.py --ids로 따로 한다.
P-055: FIXES 표의 값으로 카테고리, 사진, 이름을 바꾼다(앞 제안의 판단할 지점에 대한 리드 결정). 이미 값이 있어도 바꾼다.
P-056: 남은 행 판정(leftover-20261004.json)의 병합 15곳은 MERGES, 교정 7곳은 FIXES 표로 쓴다. 교정의 장소 번호와 주소는 KEEP_FIX와 같게 바꾸고,
  병합으로 남길 행(518, 1273)의 교정은 채움 값 위에서 계산해 남길 행 patch에 합친다.
병합은 닫는 행 source.note에 merged_into를 남기고 남는 행의 빈 필드만 채운다(category는 옮기지 않는다). 소속 명소로 합치는 행(야경, 공연)은
영업시간과 가격이 명소의 값이 아니어서 분위기 값만 옮긴다. 쓰기 직전에 다시 읽어 지금도 열려 있고 이름이 결과 파일 때와 같은 행만 고친다.

OCI 호스트: COLLECTOR_DIR=/mnt/data/git/oneul-date/collector python3 merge_verified_spots.py P-053 \\
  --result duplicate-merge-20261004.json --backup-dir /home/opc/oneul-backups [--apply]
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

from judge_date_fit import connect
from close_date_fit_spots import fetch_ids, request
from fix_described_names import VENUE_FIELDS, rename_body, same_name_open
from fix_map_links import area_patch

sys.path.insert(0, os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector"))
from merge_duplicates import plan_merge  # noqa: E402

# P-053 남길 행 교정(duplicate-merge-20261004.json keep_fix). kakao가 None이면 장소 번호를 비운다
KEEP_FIX = {
    1790355376055: {"kakao": "2047650111"},  # 보현산댐 짚와이어. 장소 번호 없음
    4657: {"kakao": "12728272", "address": "전남 목포시 미항로 115"},  # 목포춤추는바다분수
    514: {"kakao": None},  # 1713644487은 입점 업장 마켓나이트야시장(9497과 같은 번호)
    1790307188322: {"address": "충남 아산시 염치읍 백암리 502-3"},  # 주소가 송곡리뿐이었다
    2405: {"kakao": "1877911730"},  # 377836008은 옛 번호
    6830: {"address": "경기 화성시 효행구 정남면 보통내길219번길 13-12"},
    1295: {"kakao": "8070550"},  # 22020080은 등산로 주산지입구분기점
    1407: {"address": "경남 사천시 해안관광로 381-5"},  # 씨맨스카페
    2328: {"address": "대구 중구 동성로6길 45"},
    8256: {"name": "티하우스에덴"},  # 카카오, 네이버 상호
    597: {"kakao": "1977926085"},
    1790132442986: {"kakao": "540198932"},  # 18661190은 호텔 그랜드 하얏트 서울
}
# P-051, P-054 병합: 닫을 id: (지금 이름, 남길 id, 옮길 값). venue는 소속 명소로 합쳐 분위기 값만 옮긴다.
# P-051은 26곳 가운데 네이버나 카카오 검색이 남길 행의 장소를 근처에 낸 8곳만 둔다(empty-category-20261003.json rows의 naver, kakao).
# 1746(→3077)과 660(→4384)은 P-053이 합친다
MERGES = {
    "P-051": {
        758: ("롯데프리미엄아울렛 타임빌라스 글라스빌", 3189, "same"),  # 카카오 의왕 아울렛 입점 매장 0m
        1131: ("도담삼봉 모터보트", 1790243910942, "same"),  # 카카오 도담삼봉 77m, 네이버 도담삼봉유람선 273m
        4421: ("공주 공산성 성곽야경", 411, "venue"),  # 카카오 공산성 관광안내소 1m
        4441: ("포항 영일대 해상누각", 1484, "same"),  # 카카오 영일대 전망대 653m(남길 행 646m)
        4446: ("사천 창선삼천포대교 야경", 1790121719848, "venue"),  # 카카오 삼천포대교공원 81m
        4456: ("담양 관방제림 야간경관조명", 1344, "venue"),  # 카카오 담양관방제림 411m
        4461: ("남원 광한루원 야간개장", 1197, "venue"),  # 네이버 광한루원 130m, 카카오 광한루원 춘향사당 0m
        4645: ("소금산 그랜드밸리 나오라쇼", 1982, "venue"),  # 카카오 소금산그랜드밸리 217m
    },
    "P-054": {  # 카카오 주소 검색에서 같은 주소에 남길 행의 업장이 있다(empty-category-20261004.json merge)
        4854: ("부산 수영구 민락더마켓 야외 오션뷰 테라스", 514, "same"),
        4793: ("옥경이네복맥어", 6704, "same"),
        1661: ("부첼리피아체", 259, "same"),
    },
    "P-056": {  # leftover-20261004.json merge. 포룡정(4422), 수성못 수변데크(4436)는 지도에 따로 있어 남긴다
        1024: ("남산타워뷰 오리올", 583, "same"),
        1435: ("싱글핀 디스트릭트", 1788858173349, "same"),
        4552: ("울트라마린 제주 판포", 518, "same"),  # 울트라마린은 지금 우투아
        5792: ("울진 죽변해안스카イレール 죽변승차장", 1273, "same"),
        1815: ("보르고 한남 도산", 4997, "same"),
        1624: ("조천 방선문계곡", 1790459405125, "same"),
        657: ("송도센트럴파크 문보트", 6042, "venue"),
        6313: ("인천 송도 센트럴파크 문보트 & 야경", 6042, "venue"),
        1240: ("쏠비치 삼척 산토리니 광장", 1789994825466, "venue"),
        4470: ("제주 산지천 음악분수 & 탑동광장", 4669, "venue"),
        3014: ("송도 케이슨24 솔트비어 탭룸", 4384, "venue"),
        5544: ("구름에 온", 1788630026682, "venue"),
        3812: ("안동 구름에리조트 북카페 구름에 온", 1788630026682, "venue"),
        4081: ("양양 하조대 무인등대 & 스카이워크", 5739, "venue"),
        2690: ("양양 하조대 무인등대 & 스카이워크", 5739, "venue"),
    },
}
# 카테고리 채움: id: (지금 이름, 카테고리, 바꿀 이름). 카테고리는 카카오 경로의 저장 단계(kakao_category_from_path)다.
# 카카오에 없고 네이버에만 있는 행은 네이버 분류의 마지막 단계를 쓴다. 797 인천 개항장 문화지구는 검색 카테고리가 없어 뺐다
FILLS = {
    "P-051": {
        712: ("파머스대디", "원예,화훼농원", None),  # 네이버
        858: ("포크너 고잔점", "이탈리안", None),
        958: ("킨토토 갈마본점", "일식", None),
        968: ("태평소국밥 유성본점", "국밥", None),
        1052: ("프릳츠 도화본점", "디저트카페", None),
        1202: ("지리산 뱀사골 힐링트레킹", "관광,명소", None),
        1259: ("주천 다하누촌 중앙점", "먹자골목", None),
        1359: ("지리산치즈랜드", "관광농원,팜스테이", None),  # 네이버
        1401: ("아난티 남해 워터하우스", "수영장", None),  # 네이버
        1849: ("문화식당 성북동점", "이탈리안", None),
        2114: ("포토그레이 부산서면점", "즉석사진", None),
        4018: ("볼링볼링 신당본점", "볼링장", None),
        4024: ("비밀의화원 다운타운 홍대점", "테마카페", None),
    },
    "P-054": {  # 이름은 카카오(1112만 네이버) 같은 주소 업장의 상호로 바꾼다
        644: ("그래비티 서울 판교 제로백", "칵테일바", "제로비티 그래비티 서울 판교"),
        1176: ("구드래나루터 황포돛배", "선착장", None),
        1467: ("아난티 앳 부산 코브 캐비네 드 쁘아송", "전시관", "코발트바이캐비네드쁘아쏭"),
        1737: ("텅 성수 스페이스", "커피전문점", "텅플래니트"),
        4544: ("파노라마 오션뷰 엣지993 해운대", "카페", "엣지993"),
        1112: ("루프탑 G 서교", "바(BAR)", "루프탑 G 길리건스"),  # 네이버
    },
}

# 남은 교정: id: (지금 이름, 바꿀 값). 이름을 바꾸면 note에 renamed를 남긴다
FIXES = {
    "P-055": {
        514: ("밀락더마켓", {"category": "복합문화공간", "image_url": None}),  # 중식과 사진은 입점 업장 값(P-053 보기 a, 네이버 분류)
        797: ("인천 개항장 문화지구", {"category": "전시·문화"}),  # 결과 파일의 앱 카테고리(P-051 보기 a)
        # 네이버 포크너 안산고잔점 22m. 카카오는 같은 주소(광덕대로 168)의 포크너 신도시점이고 앱 지도 검색은 네이버다
        858: ("포크너 고잔점", {"name": "포크너 안산고잔점"}),
        # 958 킨토토 갈마본점, 1202 지리산 뱀사골 힐링트레킹, 4024 비밀의화원 다운타운 홍대점은 같은 주소의 상호를 찾지 못해 두었다
    },
    "P-056": {  # leftover-20261004.json keep_fix
        1270: ("만항재 쉼터 산상의화원", {"name": "산상의화원", "category": "공원", "kakao": "1867225574",
                                          "address": "강원특별자치도 정선군 고한읍 고한리 산 215-3"}),
        1273: ("죽변 해안스카イレール", {"name": "죽변해안스카이레일"}),  # 이름의 일본 문자
        654: ("까치화방 판교플래그십", {"name": "까치화방 판교점", "category": "테마카페", "kakao": "1572962342",
                                     "address": "경기 성남시 분당구 판교역로 152"}),
        1034: ("카르마 경리단", {"name": "까르마", "category": "칵테일바", "kakao": "894609108", "address": "서울 용산구 신흥로 28"}),
        4541: ("오クター브 전포", {"name": "옥타브뮤직바", "category": "호프,요리주점", "kakao": "1037764699",
                                "address": "부산 부산진구 중앙대로680번가길 82"}),
        1169: ("합송구뜨", {"name": "합송리994", "category": "카페", "kakao": "38981585"}),
        518: ("울트라마린", {"name": "우투아", "category": "카페", "kakao": "1697574060", "address": "제주특별자치도 제주시 한경면 일주서로 4611",
                          "lat": 33.3694259963321, "lng": 126.206064803739}),
    },
}


def fix_list(proposal, rows, skipped):
    """FIXES 가운데 지금도 열려 있고 이름이 같은 행."""
    fixes = []
    for i, (name, patch) in FIXES.get(proposal, {}).items():
        row = rows.get(i)
        if not row or row.get("is_closed") or row["name"] != name:
            skipped[i] = "행 없음" if not row else "닫힘" if row.get("is_closed") else f"이름 바뀜: {row['name']}"
        else:
            fixes.append({"row": row, "patch": patch})
    return fixes


def fix_body(row, patch, stamp, now, proposal):
    keyed = ("name", "kakao", "address")  # 장소 번호와 주소는 링크와 area를 함께 바꾼다
    body = keep_fix_patch(row, {k: v for k, v in patch.items() if k in keyed}, stamp, now, proposal)
    rest = {k: v for k, v in patch.items() if k not in keyed}
    if rest:
        source = dict(body.get("source") or row.get("source") or {})
        text = ", ".join(f"{k} {row.get(k)}→{v}" if v is not None else f"{k} 비움" for k, v in rest.items())
        source["note"] = f"{(source.get('note') or '').strip()} | fixed: {proposal} {text} ({stamp[:8]})".lstrip(" |")
        body.update({**rest, "source": source})
    return body


def merge_list(proposal, result):
    """(닫을 id, 지금 이름, 남길 id, 남길 행 이름 또는 None, 옮길 값)."""
    if proposal == "P-053":
        return [(m["id"], m["name"], g["keep"]["id"], g["keep"]["name"], "same") for g in result["merge"] for m in g["merge"]]
    return [(i, name, into, None, kind) for i, (name, into, kind) in MERGES.get(proposal, {}).items()]


def keep_fix_patch(keep, fix, stamp, now, proposal):
    """KEEP_FIX 한 줄을 남길 행에 쓸 필드로 바꾼다. note에는 바꾼 값을 남긴다."""
    body, text = {}, []
    if "name" in fix:
        body = rename_body(keep, fix["name"], stamp, now, proposal)
    if "kakao" in fix:
        ids = dict(keep.get("provider_ids") or {})
        old = ids.pop("kakao", None)
        links = dict(keep.get("social_links") or {})
        if fix["kakao"]:
            ids["kakao"] = fix["kakao"]
            if not (links.get("kakaomap") or {}).get("url", "").endswith(f"/{fix['kakao']}"):
                links["kakaomap"] = {"url": f"https://place.map.kakao.com/{fix['kakao']}"}
        elif old and str(old) in (links.get("kakaomap") or {}).get("url", ""):
            del links["kakaomap"]
        body.update({"provider_ids": ids, "social_links": links})
        text.append(f"kakao {old}→{fix['kakao']}")
    if "address" in fix:
        body["address"] = fix["address"]
        body.update(area_patch(keep, fix["address"]))
        text.append(f"address {keep.get('address')}→{fix['address']}")
    if text:
        source = dict(body.get("source") or keep.get("source") or {})
        source["note"] = f"{(source.get('note') or '').strip()} | fixed: {proposal} {', '.join(text)} ({stamp[:8]})".lstrip(" |")
        body["source"] = source
    return body


def plan(proposal, result, rows):
    """병합 묶음과 채움 목록, 건너뛴 행과 이유."""
    groups, skipped = {}, {}
    for i, name, into, into_name, kind in merge_list(proposal, result):
        row, keep = rows.get(i), rows.get(into)
        if not row or row.get("is_closed") or row["name"] != name:
            skipped[i] = "행 없음" if not row else "닫힘" if row.get("is_closed") else f"이름 바뀜: {row['name']}"
        elif not keep or keep.get("is_closed") or (into_name and keep["name"] != into_name):
            skipped[i] = f"남길 행 {into} " + ("닫힘" if keep and keep.get("is_closed") else "이름 바뀜" if keep else "없음")
        else:
            groups.setdefault(into, []).append((row, kind))
    merges = []
    for keep_id, dups in groups.items():
        keep, fill = rows[keep_id], {}
        for row, kind in dups:
            _, _, f = plan_merge([keep, row])
            if kind == "venue":
                f = {k: v for k, v in f.items() if k in VENUE_FIELDS}
            fill.update({k: v for k, v in f.items() if k not in fill})
        merges.append({"keep": keep, "dups": [r for r, _ in dups], "fill": fill,
                       "fix": KEEP_FIX.get(keep_id) if proposal == "P-053" else None})
    fills = []
    for i, (name, category, new_name) in FILLS.get(proposal, {}).items():
        row = rows.get(i)
        if not row or row.get("is_closed") or row["name"] != name:
            skipped[i] = "행 없음" if not row else "닫힘" if row.get("is_closed") else f"이름 바뀜: {row['name']}"
        elif row.get("category"):
            skipped[i] = f"카테고리 있음: {row['category']}"
        else:
            fills.append({"row": row, "category": category, "name": new_name})
    return merges, fills, skipped


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("proposal", choices=["P-053", "P-051", "P-054", "P-055", "P-056"])
    ap.add_argument("--result", help="P-053 결과 파일(duplicate-merge-YYYYMMDD.json)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    args = ap.parse_args()
    assert args.proposal != "P-053" or args.result, "P-053은 --result가 필요하다"

    result = json.load(open(args.result, encoding="utf-8")) if args.result else {}
    ids = {x for i, _, into, _, _ in merge_list(args.proposal, result) for x in (i, into)} | set(FILLS.get(args.proposal, {}))
    ids |= set(FIXES.get(args.proposal, {}))
    base, headers = connect()
    rows = {r["id"]: r for r in fetch_ids(base, headers, sorted(ids))}
    merges, fills, skipped = plan(args.proposal, result, rows)
    fixes = fix_list(args.proposal, rows, skipped)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    now = datetime.now(timezone.utc).isoformat()
    for m in merges:
        m["patch"] = {**m["fill"], **(keep_fix_patch({**m["keep"], **m["fill"]}, m["fix"], stamp, now, args.proposal) if m["fix"] else {})}
        print(f"  병합 {[d['id'] for d in m['dups']]} → {m['keep']['id']} {m['keep']['name']} · 남는 행 고칠 필드 "
              f"{sorted(k for k in m['patch'] if k not in ('source', 'updated_at'))}")
    # 이름을 바꿀 행에 같은 이름의 열린 행이 300m 안에 있으면 이름은 두고 카테고리만 채운다
    for f in fills:
        if f["name"] and (dup := same_name_open(base, headers, f["name"], f["row"])):
            skipped[f["row"]["id"]] = f"이름 그대로(300m 안 같은 이름 열린 행 {dup})"
            f["name"] = None
        print(f"  채움 {f['row']['id']} {f['row']['name']} · {f['category']}{' · 이름 → ' + f['name'] if f['name'] else ''}")
    for f in list(fixes):
        if "name" in f["patch"] and (dup := same_name_open(base, headers, f["patch"]["name"], f["row"])):
            skipped[f["row"]["id"]] = f"이름 그대로(300m 안 같은 이름 열린 행 {dup})"
            fixes.remove(f)
            continue
        print(f"  교정 {f['row']['id']} {f['row']['name']} · {f['patch']}")
        # 병합으로 남길 행은 두 번 쓰면 교정이 채움 값을 덮으므로 채운 행 위에서 계산해 남길 행 patch에 합친다
        if m := next((m for m in merges if m["keep"]["id"] == f["row"]["id"]), None):
            m["fix"] = f["patch"]
            m["patch"].update(fix_body({**m["keep"], **m["fill"]}, f["patch"], stamp, now, args.proposal))
            fixes.remove(f)
            continue
        f["body"] = fix_body(f["row"], f["patch"], stamp, now, args.proposal)
    unfixed = set(KEEP_FIX) - {m["keep"]["id"] for m in merges} if args.proposal == "P-053" else set()
    print(f"병합 {sum(len(m['dups']) for m in merges)}행 → {len(merges)}행 · 남길 행 교정 {sum(bool(m['fix']) for m in merges)}"
          f"(못 함 {sorted(unfixed)}) · 채움 {len(fills)} · 교정 {len(fixes)} · 제외 {len(skipped)} {skipped}")
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0

    backup = os.path.join(args.backup_dir, f"{args.proposal.lower().replace('-', '')}_merge_{stamp}.json")
    with open(backup, "w", encoding="utf-8") as fp:
        json.dump({"rows": [r for m in merges for r in (m["keep"], *m["dups"])] + [f["row"] for f in fills] + [f["row"] for f in fixes],
                   "id_map": {str(d["id"]): m["keep"]["id"] for m in merges for d in m["dups"]},
                   "patches": {str(m["keep"]["id"]): m["patch"] for m in merges},
                   "fills": {str(f["row"]["id"]): [f["category"], f["name"]] for f in fills},
                   "fixes": {str(f["row"]["id"]): f["body"] for f in fixes}, "skipped": skipped},
                  fp, ensure_ascii=False, indent=1)
    print(f"백업: {backup}")

    rep = {**headers, "Prefer": "return=representation"}
    failed = []

    def patch(i, body, what):
        if len(request(f"{base}/rest/v1/spots?id=eq.{i}&is_closed=eq.false", rep, "PATCH", {**body, "updated_at": now}) or []) != 1:
            failed.append((i, what))

    for m in merges:
        # 닫는 행을 먼저 닫는다. 도중에 멈춰도 남길 행이 잘못 바뀌지는 않는다
        for d in m["dups"]:
            source = dict(d.get("source") or {})
            source["note"] = f"{(source.get('note') or '').strip()} | merged_into:{m['keep']['id']} ({stamp[:8]} {args.proposal} 중복)".lstrip(" |")
            patch(d["id"], {"is_closed": True, "source": source}, "close")
        if m["patch"]:
            patch(m["keep"]["id"], m["patch"], "keep")
    for f in fills:
        body = rename_body(f["row"], f["name"], stamp, now, args.proposal) if f["name"] else {}
        patch(f["row"]["id"], {**body, "category": f["category"]}, "fill")
    for f in fixes:
        patch(f["row"]["id"], f["body"], "fix")
    print(f"실패 {failed}")

    after = {r["id"]: r for r in fetch_ids(base, headers, sorted(ids))}
    ok_close = sum(after[d["id"]]["is_closed"] and f"merged_into:{m['keep']['id']}" in (after[d["id"]]["source"].get("note") or "")
                   for m in merges for d in m["dups"])
    ok_keep = sum(not after[m["keep"]["id"]]["is_closed"] and all(after[m["keep"]["id"]].get(k) == v for k, v in m["patch"].items()
                                                                  if k != "updated_at") for m in merges)
    ok_fill = sum(not after[f["row"]["id"]]["is_closed"] and after[f["row"]["id"]]["category"] == f["category"]
                  and (not f["name"] or after[f["row"]["id"]]["name"] == f["name"]) for f in fills)
    ok_fix = sum(not after[f["row"]["id"]]["is_closed"] and all(after[f["row"]["id"]].get(k) == v for k, v in f["body"].items()
                                                                 if k != "updated_at") for f in fixes)
    print(f"쓰기 뒤 DB 재조회: 교정 {ok_fix}/{len(fixes)} · 닫힘·merged_into {ok_close}/{sum(len(m['dups']) for m in merges)} · 남는 행 열림·고침 "
          f"{ok_keep}/{len(merges)} · 채움 {ok_fill}/{len(fills)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
