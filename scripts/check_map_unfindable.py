#!/usr/bin/env python3
"""P-052 R16 지도 검색 불가 검사. DB에 쓰지 않고 판정 파일만 낸다. 로컬에서 돈다.

모집단: 출처 web, 카카오 장소 id 없음(provider_ids.kakao가 없고 kakaomap 링크가 place.map.kakao.com/<숫자>가 아님)인 열린 행.
verified와 설명형 이름(judge_date_fit R5)은 보지 않는다. R5 행(P-058 층 E와 F)에 이어 verified=true이고 R5가 아닌 행도 넣었다(P-064,
10-04 361곳. 몽까페, 까치식당처럼 행 좌표가 다른 업장인 지도 없음 행이 나왔다). --extra로 P-049 드라이런에서 핵심 이름이 500m 안에 없던 행 가운데 앞의 조건에 드는 행을 더한다.
판정은 두 단계다.
  네이버: 앱 검색어(main.ts mapQuery)와 변형 4종(앱이 붙인 지역어를 뗀 이름, 마지막 어절을 뗀 이름, 3자 이상 마지막 어절, 띄어쓰기를 뺀 이름)의
    결과 상위 5위에 이름 바이그램 겹침 0.5 이상이고 행 좌표 3km 안인 장소가 있으면 남긴다(검색됨).
  카카오: 네이버로 못 찾은 행만 핵심 이름과 그 첫 어절(2자 이상, 업종 낱말 제외)로 행 좌표 2km 검색을 하고, 없으면 도로명 주소 키워드 검색을 한다. 어느 쪽에든 이름이 비슷한
    장소가 있으면 남긴다(카카오 검색됨). 주소 검색에 다른 업장만 있으면 닫기 후보, 주소 검색이 0건이면 검토로 보낸다(카카오 0건만으로 닫지 않는다).
닫기 후보는 사람이 표본을 다시 본 뒤 close_date_fit_spots.py --ids ... --proposal P-052로 닫는다.
네이버 캡차가 나오면 멈추고 그때까지의 판정을 쓴다(종료 코드 2). 카카오는 --kakao-max에서 멈춘다.

python3 scripts/check_map_unfindable.py --input open.json --limit 100 --extra docs/planning/described-name-dryrun-20261003.json \\
  --out docs/planning/map-unfindable-r16-dryrun-20261004.json
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime

from judge_date_fit import export_name, road_key, src_type
from fix_described_names import COLLECTOR, bigrams, core_name, dist_m, norm, run_naver

NAVER_RADIUS_M = 3000
KAKAO_RADIUS_M = 2000
KAKAO_PLACE = re.compile(r"place\.map\.kakao\.com/\d+")
EXTRA_REASON = "500m 안에 같은 이름 결과 없음"
# 업종 낱말. 핵심 이름의 첫 어절이 이것이면 카카오 첫 어절 검색을 하지 않는다(책방 이음 → 근처 책방 전부와 겹친다, P-062)
TYPE_WORDS = {"카페", "까페", "커피", "디저트", "브런치", "베이커리", "빵집", "제과", "식당", "레스토랑", "키친", "다이닝", "비스트로", "펍", "바",
              "와인바", "술집", "주점", "포차", "호프", "이자카야", "갤러리", "미술관", "책방", "서점", "북카페", "스튜디오", "사진관", "공방",
              "꽃집", "플라워", "펜션", "글램핑", "캠핑장", "게스트하우스", "호텔", "숙소", "체험관", "전시관", "공원"}
BRANCH = re.compile(r"\s+\S{2,}점$")


def no_kakao_id(row):
    url = ((row.get("social_links") or {}).get("kakaomap") or {}).get("url") or ""
    return not (row.get("provider_ids") or {}).get("kakao") and not KAKAO_PLACE.search(url)


def in_group(row):
    return src_type(row) == "web" and no_kakao_id(row) and row.get("lat") and row.get("lng")


def similar(a, b):
    A, B = bigrams(norm(a)), bigrams(norm(b))
    return bool(A and B) and len(A & B) / min(len(A), len(B)) >= 0.5


def similar_k(a, b):
    """카카오 결과 대조. 마지막 어절이 지점(~점)이면 떼고 견준다(잼클라이밍 전주신시가지점 ↔ 그믐달셀프스튜디오 전주신시가지점, P-062)."""
    strip = lambda s: BRANCH.sub("", s.strip()) if len(norm(BRANCH.sub("", s.strip()))) >= 2 else s
    return similar(strip(a), strip(b))


def stale_naver(hits, plan_q):
    """검색어가 바뀐 행(P-058 이름 교정, P-061 mapQuery 수정)의 캐시 키. 키가 id#단계라 그대로 두면 옛 응답을 다시 쓴다."""
    return [f"{i}#{s}" for i, qs in plan_q.items() for s, q in enumerate(qs) if f"{i}#{s}" in hits and hits[f"{i}#{s}"].get("q") != q]


def variants(app_q, name, area):
    """앱 검색어 뒤 변형 4종. 같은 검색어는 한 번만 쓴다."""
    base = re.sub(r"\s+", " ", re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", name)).strip()
    no_area = app_q[: -len(area)].strip() if area and app_q.endswith(" " + area) else base
    toks = base.split()
    key = lambda q: " ".join(q.lower().split())  # 띄어쓰기를 뺀 이름이 따로 남도록 공백은 지우지 않는다
    out, seen = [], {key(app_q)}
    for q in (no_area, " ".join(toks[:-1]) if len(toks) >= 2 else "", toks[-1] if len(toks) >= 2 and len(toks[-1]) >= 3 else "",
              base.replace(" ", "")):
        if len(norm(q)) >= 2 and key(q) not in seen:
            seen.add(key(q))
            out.append(q)
    return out


def app_queries(rows):
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "in.json"), os.path.join(d, "out.json")
        with open(src, "w", encoding="utf-8") as f:
            json.dump([{"id": r["id"], "name": export_name(r), **{k: r.get(k) for k in ("area", "location", "address", "region")}}
                       for r in rows], f, ensure_ascii=False)
        subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "app_map_query.mjs"), src, dst], check=True)
        return {int(k): v for k, v in json.load(open(dst, encoding="utf-8")).items()}


class Kakao:
    """카카오 키워드 검색. 응답은 cache 파일에 남겨 다시 돌릴 때 부르지 않는다. limit은 이번 실행의 새 호출 수다."""

    def __init__(self, limit, cache):
        with open(os.path.join(COLLECTOR, ".env"), encoding="utf-8") as f:
            self.key = next(line.split("=", 1)[1].strip().strip('"').strip("'") for line in f if line.startswith("KAKAO_REST_API_KEY="))
        self.limit, self.calls, self.path = limit, 0, cache
        self.cache = json.load(open(cache, encoding="utf-8")) if os.path.exists(cache) else {}

    def search(self, **q):
        k = json.dumps(q, sort_keys=True, ensure_ascii=False)
        if k not in self.cache:
            if self.calls >= self.limit:
                return None
            self.calls += 1
            url = "https://dapi.kakao.com/v2/local/search/keyword.json?" + urllib.parse.urlencode({**q, "size": 15})
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": f"KakaoAK {self.key}"}), timeout=15) as res:
                self.cache[k] = [{"name": d["place_name"], "cat": d["category_name"].split(" > ")[-1], "addr": d["road_address_name"]
                                  or d["address_name"], "dist": d.get("distance"), "id": d["id"]} for d in json.loads(res.read())["documents"]]
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(self.cache, f, ensure_ascii=False)
        return self.cache[k]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", required=True, help="열린 행 목록 JSON(OCI fetch_open_db 덤프)")
    ap.add_argument("--limit", type=int, default=100, help="모집단 id 순으로 앞에서 고를 행 수(0이면 전체)")
    ap.add_argument("--offset", type=int, default=0, help="모집단 id 순에서 건너뛸 행 수(회차마다 나눠 돌릴 때)")
    ap.add_argument("--extra", help="P-049 드라이런 파일. 핵심 이름이 500m 안에 없던 행 가운데 모집단 조건에 드는 행을 더한다")
    ap.add_argument("--kakao-max", type=int, default=120)
    ap.add_argument("--cache", help="네이버 응답 캐시(기본은 OUT.naver.json)")
    ap.add_argument("--kakao-cache", help="카카오 응답 캐시(기본은 OUT.kakao.json)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    rows = [r for r in json.load(open(args.input, encoding="utf-8")) if not r.get("is_closed")]
    by_id = {r["id"]: r for r in rows}
    pop = sorted(r["id"] for r in rows if in_group(r))
    target = pop[args.offset:args.offset + args.limit] if args.limit else pop[args.offset:]
    extra = []
    if args.extra:
        skipped = json.load(open(args.extra, encoding="utf-8"))["skipped"]
        extra = sorted(x["id"] for x in skipped if x["result"] == EXTRA_REASON and x["id"] in by_id and in_group(by_id[x["id"]]))
        target = sorted(set(target) | set(extra))
    print(f"열린 행 {len(rows)} · 모집단 {len(pop)} · P-049 더한 행 {len(extra)} · 이번 대상 {len(target)}")

    app_q = app_queries([by_id[i] for i in target])
    plan_q = {i: [app_q[i]] + variants(app_q[i], export_name(by_id[i]), by_id[i].get("area")) for i in target}
    cache = args.cache or args.out + ".naver.json"
    hits = json.load(open(cache, encoding="utf-8")) if os.path.exists(cache) else {}
    stale = stale_naver(hits, plan_q)
    if stale:  # naver_place_search.mjs는 캐시에 있는 키를 건너뛰므로 파일에서 지운다
        for k in stale:
            del hits[k]
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(hits, f, ensure_ascii=False)
    print(f"네이버 캐시에서 검색어가 바뀐 응답 {len(stale)}건을 버렸다")
    found, captcha = {}, False
    for step in range(max(map(len, plan_q.values()), default=0)):
        todo = [{"key": f"{i}#{step}", "q": qs[step], "lng": by_id[i]["lng"], "lat": by_id[i]["lat"]}
                for i, qs in plan_q.items() if i not in found and step < len(qs)]
        captcha = run_naver([t for t in todo if t["key"] not in hits], cache)
        hits = json.load(open(cache, encoding="utf-8")) if os.path.exists(cache) else {}
        for t in todo:
            i, got = int(t["key"].split("#")[0]), hits.get(t["key"])
            r = by_id[i]
            for p in (got or {}).get("top", []):
                d = dist_m(r["lat"], r["lng"], float(p["y"]), float(p["x"])) if p.get("x") else None
                if d is not None and d <= NAVER_RADIUS_M and similar(p["name"], t["q"]):
                    found[i] = {"q": t["q"], "name": p["name"], "dist_m": round(d), "addr": p["road"] or p["jibun"]}
                    break
        if captcha:
            break

    kakao = Kakao(args.kakao_max, args.kakao_cache or args.out + ".kakao.json")
    out = {}
    for i in target:
        r = by_id[i]
        naver = {"app_query": app_q[i], "queries": [hits[f"{i}#{s}"]["q"] for s in range(len(plan_q[i])) if f"{i}#{s}" in hits]}
        if i in found:
            out[i] = ("검색됨", {**naver, "hit": found[i]})
            continue
        if len(naver["queries"]) < len(plan_q[i]):
            out[i] = ("확인 못 함", {**naver, "why": "캡차로 멈춤" if captcha else "네이버 응답 없음"})
            continue
        name = core_name(export_name(r), r.get("address"))
        # 첫 어절도 찾는다. 뒤 어절이 지명이나 설명이면 핵심 이름 그대로는 0건이다(울트라마린 제주 판포 → 울트라마린 주차장 21m)
        first = name.split()[0] if len(name.split()) >= 2 and len(norm(name.split()[0])) >= 2 else None
        first = None if first in TYPE_WORDS else first
        names = [name] + ([first] if first else [])
        hit = lambda ps: any(similar_k(p["name"], n) for p in ps for n in names)
        near = []
        for q in names:
            got = kakao.search(query=q, x=r["lng"], y=r["lat"], radius=KAKAO_RADIUS_M, sort="distance")
            near = None if got is None else near + got
            if near is None or hit(near):
                break
        road = road_key(r)  # 서현로 210번길 16을 서현로 210에서 끊지 않는다
        at = kakao.search(query=road) if road and near is not None and not hit(near) else []
        ev = {**naver, "kakao_q": names, "kakao_near": (near or [])[:5], "road": road, "kakao_at_address": (at or [])[:8]}
        if near is None or at is None:
            out[i] = ("확인 못 함", {**ev, "why": "카카오 한도로 멈춤"})
        elif hit(near + at):
            out[i] = ("카카오 검색됨", ev)
        elif not road:
            out[i] = ("검토", {**ev, "why": "도로명 주소 없음"})
        elif not at:
            out[i] = ("검토", {**ev, "why": "주소 검색 0건"})
        else:
            out[i] = ("닫기 후보", ev)

    def item(i):
        r = by_id[i]
        return {"id": i, "name": r["name"], "export_name": export_name(r), "address": r.get("address"), "area": r.get("area"),
                "category": r.get("category"), "fail_count": r.get("fail_count"), "from_p049": i in extra, **out[i][1]}
    kinds = ("닫기 후보", "검토", "카카오 검색됨", "검색됨", "확인 못 함")
    result = {"generated": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"), "proposal": "P-052", "rule": "R16_지도_검색_불가",
              "input": args.input, "open_rows": len(rows), "population": len(pop), "offset": args.offset, "limit": args.limit,
              "p049_extra": len(extra), "target": len(target), "captcha": captcha,
              "naver_queries": sum(1 for k in hits if int(k.split("#")[0]) in set(target)), "kakao_calls": kakao.calls,
              "counts": {k: sum(v[0] == k for v in out.values()) for k in kinds},
              **{k: [item(i) for i in target if out[i][0] == k] for k in kinds}}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(" · ".join(f"{k} {v}" for k, v in result["counts"].items()) +
          f" · 네이버 {result['naver_queries']}회 · 카카오 {kakao.calls}회{' · 캡차로 멈춤' if captcha else ''} → {args.out}")
    return 2 if captcha else 0


if __name__ == "__main__":
    sys.exit(main())
