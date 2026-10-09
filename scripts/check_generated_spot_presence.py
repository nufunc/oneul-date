#!/usr/bin/env python3
"""P-104 R-104 전수 판정: 생성 원고 미검증 행 가운데 이름 검색이 없고 그 번지에 다른 업종 업체만 있는 행을 찾는다. DB에 쓰지 않는다.

R-104는 A~F를 모두 만족하는 행이다(docs/team/results/2026-10-10-c53-reliability-reviewer-s.md 3절).
  A 카카오 DB 이름 그대로 DB 좌표 반경 20km 0건
  B 네이버 지도 이름 검색 상위 5곳 가운데 DB 좌표 3km 안 0곳
  C 이름 핵심어 검색(반경 20km) 결과 가운데 DB 좌표 3km 안에서 핵심어와 3자 이상 겹치는 이름 0곳
  D 번지 문자열 키워드 검색(반경 300m)에 등록 장소가 있고 그 이름이 모두 핵심어와 겹치지 않음
  E 라이브 category가 자연·산책이 아니고 이름에 공원·박물관 같은 공공 장소 낱말이 없음
  F 그 번지 등록 장소 가운데 라이브 category와 같은 업종군(카페, 주점, 음식점)이 없음
호출이 싼 순서(E → 주소 2회 → 이름 → 핵심어 → 네이버)로 보고 앞에서 떨어진 행은 더 부르지 않는다.
카카오 응답은 --cache에 쌓아 다시 돌리면 호출하지 않는다. 네이버는 걸린 행만 naver_place_search.mjs로 부른다.

  python3 scripts/check_generated_spot_presence.py ids.json spots.json out.json --cache kcache.json --naver nout.json [--max-kakao 3200]
ids.json은 id 배열, spots.json은 라이브 public/data/spots.json이다.
--naver 파일에 없는 행은 B를 판정하지 못해 needs_naver로 남기고, 그 목록을 <out>.naver_in.json으로 쓴다. 그 파일로
  npx -y -p playwright node scripts/naver_place_search.mjs <out>.naver_in.json nout.json
를 돌린 뒤 같은 명령을 다시 돌린다(카카오는 캐시에서 읽는다).
"""
import argparse
import json
import math
import os
import re
import urllib.parse
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PUBLIC = re.compile(r"공원|산책|둔치|수목원|해변|호수|하천|천$|숲|정원|박물관|미술관|사찰|사$")
GEN = {"카페", "점", "본점", "스토어", "샵", "공방", "플래그십", "시그니처", "탭룸", "브루잉", "라운지"}
FAM = {"cafe": r"카페|커피|디저트|베이커리|제과|다방|찻집|차,|전통차",
       "bar": r"술집|호프|주점|바\(|칵테일|와인|맥주|펍|이자카야|bar",
       "food": r"한식|양식|이탈리안|일식|중식|레스토랑|고기|^회$|요리|미식|식당|파스타|스테이크"}
FLOOR = re.compile(r"\s+(지하\s*\d+층|B\d+|\d+(-\d+)?층|\d+층|1-2층).*$")
NUM = re.compile(r"^산?\d+(-\d+)?$")


def norm(s):
    return re.sub(r"[\s·&()]", "", s)


def dist(s, x):
    return math.hypot((float(x["y"]) - s["lat"]) * 111000, (float(x["x"]) - s["lng"]) * 88000)


def lcs(a, b):
    return max((n for i in range(len(a)) for n in range(1, len(a) - i + 1) if a[i:i + n] in b), default=0)


def overlap(name, ks):
    a = norm(name)
    return any(k in a or (len(a) >= 2 and a in k) or lcs(a, k) >= 3 for k in ks)


def fam(c):
    return {f for f, p in FAM.items() if c and re.search(p, c)}


def street_address(addr):
    """도로명·지번의 번지까지만 남긴다(층, 건물명, 상가명 제거)."""
    toks = FLOOR.sub("", addr or "").split()
    for i in range(1, len(toks)):
        if NUM.match(toks[i]) and re.search(r"(로|길|동|리|가)\d*$", toks[i - 1]):
            return " ".join(toks[:i + 1])
    return " ".join(toks)


def core_name(name, addr):
    """이름에서 주소 낱말(지역명)을 뺀 부분과 전체 이름의 핵심어(3자 이상, 일반어와 ~점 제외).
    핵심어는 core가 아니라 전체 이름에서 뽑는다: 범어사 금어다원의 범어사처럼 주소와 겹치는 낱말도 번지 업체와 견줘야 한다."""
    core = " ".join(t for t in name.split() if not any(a.startswith(t) for a in addr.split())) or name
    ks = [norm(w) for w in name.split() if w not in GEN and len(w) >= 3 and not w.endswith("점")]
    return core, ks or [norm(core)]


class Kakao:
    def __init__(self, cache_path, max_calls):
        self.path, self.max, self.calls = cache_path, max_calls, 0
        self.cache = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}
        env = os.path.join(ROOT, "collector", ".env")
        self.key = os.environ.get("KAKAO_REST_API_KEY") or next(
            l.split("=", 1)[1].strip().strip("\"'") for l in open(env, encoding="utf-8") if l.startswith("KAKAO_REST_API_KEY="))

    def __call__(self, ep, **q):
        k = ep + json.dumps(q, sort_keys=True, ensure_ascii=False)
        if k not in self.cache:
            if self.calls >= self.max:
                raise RuntimeError("kakao limit")
            self.calls += 1
            u = f"https://dapi.kakao.com/v2/local/search/{ep}.json?" + urllib.parse.urlencode(q)
            req = urllib.request.Request(u, headers={"Authorization": "KakaoAK " + self.key})
            self.cache[k] = json.loads(urllib.request.urlopen(req, timeout=15).read())["documents"]
            if self.calls % 50 == 0:
                self.save()
        return self.cache[k]

    def save(self):
        json.dump(self.cache, open(self.path, "w", encoding="utf-8"), ensure_ascii=False)


def slim(d):
    return {"name": d["place_name"], "cat": d["category_name"].split(" > ")[-1],
            "addr": d["road_address_name"] or d["address_name"], "x": d["x"], "y": d["y"]}


def judge(s, kakao, naver):
    """한 행의 A~F와 근거. 앞 조건에서 떨어지면 뒤 호출을 하지 않고 stop에 그 조건을 적는다."""
    core, ks = core_name(s["name"], s["address"] or "")
    xy = {"x": s["lng"], "y": s["lat"]}
    r = {"id": s["id"], "name": s["name"], "address": s["address"], "category": s["category"], "core": core, "keys": ks}
    if s["category"] == "자연·산책" or PUBLIC.search(core):
        return {**r, "stop": "E"}
    addr = street_address(s["address"])
    a = kakao("address", query=addr)
    ax = {"x": a[0]["x"], "y": a[0]["y"]} if a else xy
    at = [slim(d) for d in kakao("keyword", query=addr, size=15, radius=300, **ax)]
    r["address_query"], r["at_address"] = addr, [(x["name"], x["cat"]) for x in at]
    if not at or any(overlap(x["name"], ks) for x in at):
        return {**r, "stop": "D"}
    if fam(s["category"]) & set().union(*[fam(x["cat"]) for x in at]):
        return {**r, "stop": "F"}
    k1 = [slim(d) for d in kakao("keyword", query=s["name"], radius=20000, sort="accuracy", size=10, **xy)]
    r["kakao_name_20km"] = [(x["name"], int(dist(s, x))) for x in k1[:5]]
    if k1:
        return {**r, "stop": "A"}
    near = []
    for q in dict.fromkeys([core] + [w for w in core.split() if norm(w) in ks]):
        found = [slim(d) for d in kakao("keyword", query=q, radius=20000, sort="distance", size=15, **xy)]
        near += [(x["name"], int(dist(s, x))) for x in found if dist(s, x) <= 3000 and overlap(x["name"], ks)]
        if near:
            break
    r["brand_3km"] = near
    if near:
        return {**r, "stop": "C"}
    n = naver.get(str(s["id"]))
    if not n:
        return {**r, "stop": "needs_naver"}
    r["naver_top"] = [(t["name"], int(dist(s, t)) if t.get("x") else None) for t in n.get("top", [])[:5]]
    if n.get("captcha"):
        return {**r, "stop": "needs_naver"}
    if any(d is not None and d <= 3000 for _, d in r["naver_top"]):
        return {**r, "stop": "B"}
    return {**r, "stop": None, "hit": True}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("ids")
    ap.add_argument("spots")
    ap.add_argument("out")
    ap.add_argument("--cache", required=True)
    ap.add_argument("--naver", required=True)
    ap.add_argument("--max-kakao", type=int, default=3200)
    args = ap.parse_args()
    ids = set(json.load(open(args.ids, encoding="utf-8")))
    rows = [s for s in json.load(open(args.spots, encoding="utf-8")) if s["id"] in ids and not s.get("is_closed")]
    rows.sort(key=lambda s: s["id"])
    naver = json.load(open(args.naver, encoding="utf-8")) if os.path.exists(args.naver) else {}
    kakao = Kakao(args.cache, args.max_kakao)
    out, stopped_at = [], None
    try:
        for s in rows:
            out.append(judge(s, kakao, naver))
    except RuntimeError:
        stopped_at = s["id"]
    finally:
        kakao.save()
    counts = {}
    for o in out:
        counts[o["stop"] or "hit"] = counts.get(o["stop"] or "hit", 0) + 1
    need = [{"key": str(o["id"]), "q": o["name"], "lng": s["lng"], "lat": s["lat"]}
            for o in out if o["stop"] == "needs_naver" for s in rows if s["id"] == o["id"]]
    json.dump(need, open(args.out + ".naver_in.json", "w", encoding="utf-8"), ensure_ascii=False)
    hits = [o for o in out if o.get("hit")]
    json.dump({"rule": "R-104", "input_ids": len(ids), "open_rows": len(rows), "judged": len(out),
               "stopped_at_kakao_limit": stopped_at, "kakao_calls_this_run": kakao.calls, "stop_counts": counts,
               "hit_ids": [o["id"] for o in hits], "hits": hits, "rows": out},
              open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"입력 {len(ids)} · 열린 행 {len(rows)} · 판정 {len(out)} · 카카오 호출 {kakao.calls} · 멈춤 {stopped_at} · {counts}")


if __name__ == "__main__":
    main()
