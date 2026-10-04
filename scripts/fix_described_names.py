#!/usr/bin/env python3
"""P-049 설명이 붙은 이름 교정. 기본은 드라이런이고 --apply일 때만 DB에 쓴다.

verified: 결과 파일(described-name-YYYYMMDD.json)에서 검색으로 확인한 목록만 고친다. 같은 장소의 열린 행이 없으면 이름을 바꾸고,
있으면 병합 규약대로 합친다(닫는 행 source.note에 merged_into, 남는 행의 빈 필드만 채움, category는 옮기지 않음). 부속 공간으로 뺀 행은
건드리지 않는다. 소속 명소로 합치는 행(아트마켓→광안리해수욕장)은 영업시간과 가격 같은 값이 명소의 값이 아니어서 분위기 값만 옮긴다.
서울달은 합친 뒤 남는 행의 area, location, 카테고리, 카카오 장소를 고친다(장소 번호가 다른 가게 '서울의달'이라 카테고리가 '회'였다).
search: 나머지 모집단(내보낸 이름이 3어절 이상이거나 & · + / 및 in을 담은 열린 행)을 네이버로 찾아 교정 계획을 낸다. 로컬에서 돌린다.
  내보낸 이름 그대로 500m 안에 같은 이름이 나오면 고치지 않는다. 아니면 어절 부분열 검색어를 차례로 찾아, 결과 이름이 검색어와 같고
  500m 안이며 도로명이나 지번의 길·동 이름과 본번이 DB 주소와 같은 첫 결과만 채택한다. 채택한 이름이 300m 안 다른 열린 행의 이름과
  같으면 이름을 바꾸지 않고 병합 후보로 낸다. 네이버 캡차가 나오면 멈춘다.
apply: search가 낸 계획의 교정 목록을 쓴다.

이름을 바꾼 행은 source.note에 renamed: P-049 옛 이름을 남기고, 옛 이름으로 검색하는 카카오 링크(link/search)를 지워
앱이 새 이름으로 링크를 만들게 한다.

OCI 호스트(쓰기): COLLECTOR_DIR=/mnt/data/git/oneul-date/collector python3 fix_described_names.py verified described-name-20261003.json \\
  --backup-dir /home/opc/oneul-backups [--apply]
로컬(검색): python3 scripts/fix_described_names.py search --input open.json --exclude docs/planning/described-name-20261003.json \\
  --sample 200 --out docs/planning/described-name-dryrun-20261003.json
OCI 호스트(쓰기): ... fix_described_names.py apply described-name-dryrun-20261003.json --backup-dir /home/opc/oneul-backups [--apply]
"""
import argparse
import json
import math
import os
import random
import re
import subprocess
import sys
import tempfile
import urllib.parse
from datetime import datetime, timezone

from judge_date_fit import DESCRIBED_MARK as POPULATION_MARK, connect, export_name
from close_date_fit_spots import fetch_ids, request

COLLECTOR = os.environ.get("COLLECTOR_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector")
sys.path.insert(0, COLLECTOR)
from state_io import open_new  # noqa: E402
from youtube_vlog_miner import BARE_CITY_NAMES, DISTRICT_NAMES, METRO_REGIONS  # noqa: E402

PROPOSAL = "P-049"
VENUE_FIELDS = ("mood", "mood_tags", "date_contexts")  # 소속 명소로 합칠 때 옮기는 값
# 서울달(1790337550212) 남는 행 교정. 네이버 '서울달'은 영등포구 여의공원로 68-1(여행,명소>관람,체험)이고, 카카오 같은 주소의 장소는
# 273193967이다. 지금 장소 번호 485320274는 '서울의달'(카테고리 회)이라 사진과 평점도 그 가게 것이다.
# 카테고리는 같은 성격의 서울스카이, N서울타워 행이 쓰는 '전망대'로 둔다
SEOULDAL_ID, SEOULDAL_KAKAO = 1790337550212, "273193967"
SEOULDAL_PATCH = {"area": "영등포구", "location": "서울 영등포구", "category": "전망대", "image_url": None}

NAVER_RADIUS_M = 500
MERGE_RADIUS_M = 300
ROAD_NUM = re.compile(r"(\S+(?:로|길))\s*(\d+)")  # 여의공원로 68-1 → (여의공원로, 68)
JIBUN_NUM = re.compile(r"(\S+(?:동|리|가))\s+(\d+)")
NOT_PLACE_CAT = re.compile(r"^(도로시설|지명|행정)")
# 지역 낱말 판정(사이클 39 검토 시안). 아래 상권 이름은 시군구 사전에 없어 따로 둔다
ZONES = set("성수 서울숲 뚝섬 문래 여의도 당산 연남 연희 서교 망원 상수 합정 한남 이태원 용리단 해방촌 경리단 삼각지 압구정 신사 청담 도산 "
            "가로수길 논현 서촌 북촌 삼청 익선 을지로 광화문 명동 잠실 송리단 방이 석촌 혜화 대학로 판교 분당 행궁 광교 송도 영종도 을왕리 "
            "홍대 강남 신촌 이대 해운대 광안리 광안 전포 서면 남포 기장 애월 성산 구좌 한림 중문 협재 함덕 월정리 종달리 안목 경포 초당 주문진 "
            "헤이리 동탄 미사 일산 성수동 연남동 한남동 청담동 신당 용산 마곡 목동 건대 부암동 평창동 망원동 익선동".split())
REGION_SUFFIX = ("특별시", "광역시", "특별자치시", "특별자치도", "도", "시", "군", "구", "읍", "면", "동", "리", "가")
CONNECT = re.compile(r"\s(?:및|in|with)\s|\s?[&+/·]\s?|\s-\s")
DESC_TAIL = re.compile(r"\s(계류식|가스기구|야외가든|야외|루프탑|테라스|앞|일대|주변|입구|야경|포토존|축제장|행사장|체험장|체험|투어|코스|산책로|"
                       r"플래그십스토어|플래그십|팝업스토어|팝업|단독|VIP|프라이빗|프리미엄|스냅|본관|별관|신관)(\s.*)?$")


def norm(s):
    return re.sub(r"[^0-9a-z가-힣]", "", (s or "").lower())


def bigrams(s):
    return {s[i:i + 2] for i in range(len(s) - 1)}


def dist_m(lat1, lng1, lat2, lng2):
    dy = (lat1 - lat2) * 111000
    dx = (lng1 - lng2) * 111000 * math.cos(math.radians(lat1))
    return math.hypot(dx, dy)


def is_region(tok, address):
    if not tok or tok.endswith("점"):
        return False
    if tok in METRO_REGIONS or tok in DISTRICT_NAMES or tok in BARE_CITY_NAMES or tok in ZONES:
        return True
    return len(tok) >= 2 and any(a == tok or (a.startswith(tok) and a[len(tok):] in REGION_SUFFIX) for a in (address or "").split())


def core_name(name, address):
    """괄호와 연결어 뒤, 앞뒤 지역 낱말, 설명 꼬리를 지운 핵심 이름."""
    n = re.sub(r"\s+", " ", re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", name or "")).strip()
    parts = CONNECT.split(n)
    if len(parts) > 1 and len(parts[0].strip()) >= 2:
        n = parts[0].strip()
    toks = n.split()
    while len(toks) >= 2 and is_region(toks[0], address):
        toks = toks[1:]
    while len(toks) >= 2 and is_region(toks[-1], address):
        toks = toks[:-1]
    n = " ".join(toks)
    m = DESC_TAIL.search(n)
    return n[:m.start()].strip() if m and len(n[:m.start()].strip()) >= 2 else n


def query_variants(name, address):
    """검색어 후보. 규칙 핵심 이름, 첫 어절과 지점 어절, 앞 두 어절, 마지막 어절 순이다(표본 교정 30곳을 찾은 방식)."""
    toks = [t for t in re.sub(r"\([^)]*\)", " ", name).split() if not is_region(t, address)]
    out = [core_name(name, address)]
    branch = [t for t in toks[1:] if t.endswith("점") and len(t) >= 3]
    if toks and branch:
        out.append(f"{toks[0]} {branch[0]}")
    out += [" ".join(toks[:2]), toks[-1] if toks else ""]
    seen, result = {norm(name)}, []
    for q in out:
        if len(norm(q)) >= 2 and norm(q) not in seen:
            seen.add(norm(q))
            result.append(q)
    return result


def same_name(result, query):
    a, b = norm(result), norm(query)
    if not a or not b:
        return False
    if a == b or (b in a and len(a) - len(b) <= 2):  # 화성궐리사 ← 궐리사
        return True
    A, B = bigrams(a), bigrams(b)
    return len(A & B) / max(len(A), len(B), 1) >= 0.6


def addr_keys(text):
    text = text or ""
    return {("road", *m) for m in ROAD_NUM.findall(text)} | {("jibun", *m) for m in JIBUN_NUM.findall(text)}


def rename_body(row, new_name, stamp, now, proposal=PROPOSAL):
    source = dict(row.get("source") or {})
    source["note"] = f"{(source.get('note') or '').strip()} | renamed: {proposal} {row['name']} ({stamp[:8]})".lstrip(" |")
    body = {"name": new_name, "source": source, "updated_at": now}
    links = dict(row.get("social_links") or {})
    km = links.get("kakaomap") or {}
    if set(km) == {"url"} and "map.kakao.com/link/search/" in km["url"]:
        del links["kakaomap"]  # 옛 이름 검색 링크. 앱이 새 이름으로 링크를 만든다
        body["social_links"] = links
    return body


def same_name_open(base, headers, name, row):
    """새 이름과 같은 이름의 다른 열린 행 가운데 300m 안에 있는 것."""
    found = request(f"{base}/rest/v1/spots?select=id,name,lat,lng&is_closed=eq.false&name=eq.{urllib.parse.quote(name)}", headers) or []
    return [o["id"] for o in found if o["id"] != row["id"] and o.get("lat") and row.get("lat")
            and dist_m(row["lat"], row["lng"], o["lat"], o["lng"]) <= MERGE_RADIUS_M]


def write_backup(args, kind, payload):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = os.path.join(args.backup_dir, f"p049_{kind}_{stamp}.json")
    with open_new(path) as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"백업: {f.name}")
    return stamp


def verified(args):
    from merge_duplicates import plan_merge
    result = json.load(open(args.result, encoding="utf-8"))
    subspace = {x["id"] for x in result["merge_subspace_review"]}
    fixes = [x for x in result["name_fixes_verified"] if x["id"] not in subspace]
    base, headers = connect()
    rows = {r["id"]: r for r in fetch_ids(base, headers, [x["id"] for x in fixes] + [x["merge_into"] for x in fixes if x["merge_into"]])}

    renames, groups, skipped = [], {}, {}
    for x in fixes:
        row, keep = rows.get(x["id"]), rows.get(x["merge_into"])
        if not row or row.get("is_closed") or row["name"] != x["db_name"]:
            skipped[x["id"]] = "행 없음" if not row else "닫힘" if row.get("is_closed") else f"이름 바뀜: {row['name']}"
        elif x["merge_into"] and (not keep or keep.get("is_closed")):
            skipped[x["id"]] = f"남길 행 {x['merge_into']} 닫힘"
        elif x["merge_into"]:
            groups.setdefault(x["merge_into"], []).append((row, x["kind"]))
        elif dup := same_name_open(base, headers, x["fix_name"], row):
            skipped[x["id"]] = f"300m 안에 같은 이름 열린 행 {dup}"
        else:
            renames.append((row, x["fix_name"]))

    merges = []
    for keep_id, dups in groups.items():
        keep, fill = rows[keep_id], {}
        for row, kind in dups:
            _, _, f = plan_merge([keep, row])
            if kind == "교정_소속명소":
                f = {k: v for k, v in f.items() if k in VENUE_FIELDS}
            fill.update({k: v for k, v in f.items() if k not in fill})
        patch = dict(fill)
        if keep_id == SEOULDAL_ID:
            patch.update(SEOULDAL_PATCH)
            patch["provider_ids"] = {**(keep.get("provider_ids") or {}), "kakao": SEOULDAL_KAKAO}
            links = dict(keep.get("social_links") or {})
            links["kakaomap"] = {"url": f"https://place.map.kakao.com/{SEOULDAL_KAKAO}"}  # 서울의달 평점·리뷰 수는 버린다
            patch["social_links"] = links
        merges.append({"keep": keep, "dups": [r for r, _ in dups], "patch": patch})

    for row, new in renames:
        print(f"  이름 {row['id']} {row['name']} → {new}")
    for m in merges:
        print(f"  병합 {[d['id'] for d in m['dups']]} {[d['name'] for d in m['dups']]} → {m['keep']['id']} {m['keep']['name']}"
              f" · 남는 행 고칠 필드 {sorted(m['patch'])}")
    print(f"대상 {len(fixes)}(부속 공간 {len(subspace & {x['id'] for x in result['name_fixes_verified']})} 제외) · 이름 교정 {len(renames)} · "
          f"병합 {sum(len(m['dups']) for m in merges)}행 → {len(merges)}행 · 제외 {len(skipped)} {skipped}")
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0

    stamp = write_backup(args, "verified", {
        "rows": [r for r, _ in renames] + [r for m in merges for r in (m["keep"], *m["dups"])],
        "id_map": {str(d["id"]): m["keep"]["id"] for m in merges for d in m["dups"]},
        "renames": {str(r["id"]): new for r, new in renames}, "skipped": skipped})
    now = datetime.now(timezone.utc).isoformat()
    rep = {**headers, "Prefer": "return=representation"}
    failed = []
    for row, new in renames:
        if len(request(f"{base}/rest/v1/spots?id=eq.{row['id']}&is_closed=eq.false", rep, "PATCH", rename_body(row, new, stamp, now)) or []) != 1:
            failed.append((row["id"], "rename"))
    for m in merges:
        keep = m["keep"]
        # 닫는 행을 먼저 닫는다. 도중에 멈춰도 남길 행이 잘못 바뀌지는 않는다
        for d in m["dups"]:
            source = dict(d.get("source") or {})
            source["note"] = f"{(source.get('note') or '').strip()} | merged_into:{keep['id']} ({stamp[:8]} {PROPOSAL} 설명형 이름)".lstrip(" |")
            if len(request(f"{base}/rest/v1/spots?id=eq.{d['id']}&is_closed=eq.false", rep, "PATCH",
                           {"is_closed": True, "source": source, "updated_at": now}) or []) != 1:
                failed.append((d["id"], "close"))
        if m["patch"]:
            body = {**m["patch"], "updated_at": now}
            if keep["id"] == SEOULDAL_ID:
                source = dict(keep.get("source") or {})
                source["note"] = (f"{(source.get('note') or '').strip()} | fixed: {PROPOSAL} area {keep['area']}→영등포구, 카테고리 "
                                  f"{keep['category']}→전망대, 카카오 {(keep.get('provider_ids') or {}).get('kakao')}(서울의달)→{SEOULDAL_KAKAO}"
                                  f" ({stamp[:8]})").lstrip(" |")
                body["source"] = source
            if len(request(f"{base}/rest/v1/spots?id=eq.{keep['id']}&is_closed=eq.false", rep, "PATCH", body) or []) != 1:
                failed.append((keep["id"], "fill"))
    print(f"실패 {failed}")

    after = {r["id"]: r for r in fetch_ids(base, headers, list(rows))}
    ok_rename = sum(after[r["id"]]["name"] == new and not after[r["id"]]["is_closed"] for r, new in renames)
    ok_close = sum(after[d["id"]]["is_closed"] and f"merged_into:{m['keep']['id']}" in (after[d["id"]]["source"].get("note") or "")
                   for m in merges for d in m["dups"])
    ok_keep = sum(not after[m["keep"]["id"]]["is_closed"] and all(after[m["keep"]["id"]].get(k) == v for k, v in m["patch"].items())
                  for m in merges)
    print(f"쓰기 뒤 DB 재조회: 이름 {ok_rename}/{len(renames)} · 닫힘·merged_into {ok_close}/{sum(len(m['dups']) for m in merges)} · "
          f"남는 행 열림·채움 {ok_keep}/{len(merges)}")
    return 0


def run_naver(todo, cache):
    """todo를 네이버로 찾아 cache 파일에 더한다. 캡차면 True."""
    if not todo:
        return False
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(todo, f, ensure_ascii=False)
    node = os.path.join(os.path.dirname(os.path.abspath(__file__)), "naver_place_search.mjs")
    code = subprocess.run(["npx", "-y", "-p", "playwright", "node", node, f.name, cache]).returncode
    os.unlink(f.name)
    if code not in (0, 2):
        raise SystemExit(f"네이버 검색 스크립트 실패(종료 코드 {code})")
    return code == 2


def search(args):
    rows = [r for r in json.load(open(args.input, encoding="utf-8")) if not r.get("is_closed")]
    exclude = set()
    if args.exclude:
        res = json.load(open(args.exclude, encoding="utf-8"))
        for k in ("name_fixes_verified", "merge_candidates", "merge_subspace_review", "discard_candidates", "address_errors", "unverified"):
            exclude |= {x["id"] for x in res[k]}
    names = {}
    for r in rows:
        if r.get("lat"):
            names.setdefault(norm(r.get("name")), []).append(r)
    ex = {r["id"]: export_name(r) for r in rows}
    pop = sorted(r["id"] for r in rows if (len(ex[r["id"]].split()) >= 3 or POPULATION_MARK.search(ex[r["id"]])) and r["id"] not in exclude)
    by_id = {r["id"]: r for r in rows}
    sample = sorted(random.Random(args.seed).sample(pop, min(args.sample, len(pop)))) if args.sample else pop
    print(f"열린 행 {len(rows)} · 모집단 {len(pop)}(P-049 목록 {len(exclude)} 제외) · 이번 대상 {len(sample)}")

    cache = args.cache or args.out + ".naver.json"
    hits = json.load(open(cache, encoding="utf-8")) if os.path.exists(cache) else {}
    state, addr_miss = {}, {}  # id → (판정, 내용), id → 이름은 맞았지만 주소가 다른 첫 결과
    plan_q = {i: [ex[i]] + query_variants(ex[i], by_id[i].get("address")) for i in sample if by_id[i].get("lat")}
    for i in sample:
        if i not in plan_q:
            state[i] = ("건너뜀", "좌표 없음")
    captcha = False
    for step in range(max(map(len, plan_q.values()), default=0)):
        todo = [{"key": f"{i}#{step}", "q": qs[step], "lng": by_id[i]["lng"], "lat": by_id[i]["lat"]}
                for i, qs in plan_q.items() if i not in state and step < len(qs)]
        captcha = run_naver([t for t in todo if t["key"] not in hits], cache)
        hits = json.load(open(cache, encoding="utf-8")) if os.path.exists(cache) else {}
        for t in todo:
            i, r = int(t["key"].split("#")[0]), by_id[int(t["key"].split("#")[0])]
            got = hits.get(t["key"])
            if got is None:
                continue
            near = [p for p in got["top"] if p.get("x") and dist_m(r["lat"], r["lng"], float(p["y"]), float(p["x"])) <= NAVER_RADIUS_M
                    and not NOT_PLACE_CAT.search(p.get("cat") or "")]
            if step == 0:
                hit = next((p for p in near if len(bigrams(norm(p["name"])) & bigrams(norm(ex[i])))
                            / max(1, min(len(bigrams(norm(p["name"]))), len(bigrams(norm(ex[i]))))) >= 0.5), None)
                if hit:
                    state[i] = ("검색됨", hit["name"])
                continue
            named = [p for p in near if same_name(p["name"], t["q"])]
            hit = next((p for p in named if addr_keys(r.get("address")) & (addr_keys(p["road"]) | addr_keys(p["jibun"]))), None)
            if not hit:
                if named:
                    addr_miss.setdefault(i, named[0])
                continue
            dup = [o["id"] for o in names.get(norm(hit["name"]), []) if o["id"] != i
                   and dist_m(r["lat"], r["lng"], o["lat"], o["lng"]) <= MERGE_RADIUS_M]
            if norm(hit["name"]) == norm(ex[i]) or norm(hit["name"]) == norm(r["name"]):
                state[i] = ("검색됨", hit["name"])
            elif dup:
                state[i] = ("병합 후보", {"name": hit["name"], "into": dup, "q": t["q"]})
            else:
                state[i] = ("교정", {"name": hit["name"], "q": t["q"], "road": hit["road"], "jibun": hit["jibun"], "cat": hit["cat"],
                                     "dist_m": round(dist_m(r["lat"], r["lng"], float(hit["y"]), float(hit["x"])))})
        if captcha:
            break
    for i in sample:
        if i not in state:
            miss = addr_miss.get(i)
            state[i] = ("건너뜀", "캡차로 멈춤" if captcha else
                        f"이름은 맞으나 주소 다름: {miss['name']} · {miss['road'] or miss['jibun']}" if miss else "500m 안에 같은 이름 결과 없음")

    def item(i):
        r = by_id[i]
        return {"id": i, "name": r["name"], "export_name": ex[i], "address": r.get("address"),
                "source": (r.get("source") or {}).get("type"), "result": state[i][1]}
    out = {"generated": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"), "proposal": PROPOSAL, "input": args.input,
           "open_rows": len(rows), "population": len(pop), "excluded_p049": len(exclude), "seed": args.seed, "sample": len(sample),
           "captcha": captcha, "naver_queries": sum(1 for k in hits if int(k.split("#")[0]) in set(sample)),
           "counts": {k: sum(1 for v in state.values() if v[0] == k) for k in ("교정", "병합 후보", "검색됨", "건너뜀")},
           "fix": [item(i) for i in sample if state[i][0] == "교정"],
           "merge_candidates": [item(i) for i in sample if state[i][0] == "병합 후보"],
           "searchable": [item(i) for i in sample if state[i][0] == "검색됨"],
           "skipped": [item(i) for i in sample if state[i][0] == "건너뜀"]}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"교정 {out['counts']['교정']} · 병합 후보 {out['counts']['병합 후보']} · 그대로 검색됨 {out['counts']['검색됨']} · "
          f"건너뜀 {out['counts']['건너뜀']} · 네이버 {out['naver_queries']}회{' · 캡차로 멈춤' if captcha else ''} → {args.out}")
    return 2 if captcha else 0


def apply_plan(args):
    plan = json.load(open(args.plan, encoding="utf-8"))
    base, headers = connect()
    rows = {r["id"]: r for r in fetch_ids(base, headers, [x["id"] for x in plan["fix"]])}
    todo, skipped = [], {}
    for x in plan["fix"]:
        row = rows.get(x["id"])
        if not row or row.get("is_closed") or row["name"] != x["name"]:
            skipped[x["id"]] = "행 없음" if not row else "닫힘" if row.get("is_closed") else f"이름 바뀜: {row['name']}"
        elif same_name_open(base, headers, x["result"]["name"], row):
            skipped[x["id"]] = "300m 안에 같은 이름 열린 행"
        else:
            todo.append((row, x["result"]["name"]))
    print(f"교정 {len(todo)} · 제외 {len(skipped)} {skipped}")
    if not args.apply:
        print("드라이런: DB에 쓰지 않았다")
        return 0
    stamp = write_backup(args, "rename", {"rows": [r for r, _ in todo], "renames": {str(r["id"]): n for r, n in todo}, "skipped": skipped})
    now = datetime.now(timezone.utc).isoformat()
    rep = {**headers, "Prefer": "return=representation"}
    failed = [r["id"] for r, new in todo
              if len(request(f"{base}/rest/v1/spots?id=eq.{r['id']}&is_closed=eq.false", rep, "PATCH", rename_body(r, new, stamp, now)) or []) != 1]
    after = {r["id"]: r for r in fetch_ids(base, headers, [r["id"] for r, _ in todo])}
    print(f"실패 {failed} · 쓰기 뒤 DB 재조회: 이름 {sum(after[r['id']]['name'] == n for r, n in todo)}/{len(todo)}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("verified", help="결과 파일에서 검색으로 확인한 이름 교정과 병합")
    v.add_argument("result")
    s = sub.add_parser("search", help="나머지 모집단을 네이버로 찾아 교정 계획을 낸다(DB에 쓰지 않는다)")
    s.add_argument("--input", required=True, help="열린 행 목록 JSON(OCI fetch_open_db 덤프)")
    s.add_argument("--exclude", help="P-049 결과 파일. 그 목록의 행은 모집단에서 뺀다")
    s.add_argument("--sample", type=int, default=0, help="무작위로 고를 행 수(0이면 모집단 전체)")
    s.add_argument("--seed", type=int, default=20261003)
    s.add_argument("--cache", help="네이버 응답 캐시(기본은 OUT.naver.json). 다시 돌리면 받은 검색어는 건너뛴다")
    s.add_argument("--out", required=True)
    a = sub.add_parser("apply", help="search 계획의 교정 목록을 쓴다")
    a.add_argument("plan")
    for p in (v, a):
        p.add_argument("--apply", action="store_true")
        p.add_argument("--backup-dir", default=os.path.expanduser("~/oneul-backups"))
    args = ap.parse_args()
    return {"verified": verified, "search": search, "apply": apply_plan}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
