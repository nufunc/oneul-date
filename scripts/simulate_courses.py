import json
import math
import random
import re
import sys
import time
from collections import defaultdict

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SLOT_ORDER = ['day', 'evening', 'night', 'stay']

REGIONS = [
    {'key': 'ALL', 'label': '전체', 'match': []},
    {'key': 'SEOUL', 'label': '서울', 'match': ['서울']},
    {'key': 'GYEONGGI', 'label': '경기·인천', 'match': ['경기', '인천']},
    {'key': 'GANGWON', 'label': '강원', 'match': ['강원']},
    {'key': 'CHUNGCHEONG', 'label': '충청', 'match': ['충청']},
    {'key': 'YEONGNAM', 'label': '영남', 'match': ['영남']},
    {'key': 'HONAM', 'label': '호남', 'match': ['호남']},
    {'key': 'JEJU', 'label': '제주', 'match': ['제주']},
]

REGION_MAP = {r['key']: r['match'] for r in REGIONS}

MOODS = [
    {'key': 'ALL', 'label': '전체'},
    {'key': 'romantic', 'label': '로맨틱'},
    {'key': 'trendy', 'label': '핫플'},
    {'key': 'gourmet', 'label': '미식'},
    {'key': 'healing', 'label': '힐링'},
    {'key': 'view', 'label': '뷰·전망'},
    {'key': 'luxury', 'label': '럭셔리'},
    {'key': 'retro', 'label': '레트로·전통'},
    {'key': 'active', 'label': '액티비티'},
]

STAY_CATEGORY_KEYWORDS = [
    '호텔', '리조트', '펜션', '풀빌라', '빌라', '글램핑', '캠핑', '야영', '카라반', '한옥숙소',
    '료칸', '게스트하우스', '민박', '모텔', '여관', '콘도', '숙박', '숙소', '유스호스텔',
]

LODGING_FORM_KEYWORDS = [
    '펜션', '풀빌라', '글램핑', '카라반', '료칸', '게스트하우스', '민박', '모텔', '여관', '콘도',
    '독채', '숙소', '스테이', '객실', '스위트', '롯지', '로지', '캐빈', '샬레', '코티지', '방갈로',
    '카바나', '별장', '오두막', '통나무집', '촌캉스', '호스텔', '빌라', '한채', '펜트하우스',
    '산장', '트리하우스', '나무집', '리야드',
]

SOFT_STAY_KEYWORDS = ['호텔', '리조트', '한옥', '캠핑']

NON_STAY_KEYWORDS = [
    '레스토랑', '한정식', '다이닝', '그릴', '뷔페', '라운지', '스파', '온천', '찻집', '다실',
    '전시', '미술관', '박물관', '테니스', '클라이밍', '스포츠', '골프', '서핑', '영화관', '서점',
    '해수욕장', '약국', '경찰서', '문화원', '카페', '베이커리', '디저트', '식당', '음식점', '술집',
    '주점', '와인바', '이자카야', '포차', '비스트로', '브루어리', '양조장', '탭룸', '와이너리',
    '에스테이트', '수목원', '식물원', '놀이공원', '테마파크', '워터파크', '케이블카', '백화점',
    '아울렛', '공원',
]

FACILITY_KEYWORDS = [
    '그릴', '다이닝', 'bbq', '뷔페', '라운지', '스파', '카페', '루프탑', '레스토랑', '델리',
    '클럽하우스', '바베큐', '베이커리', '펍',
]

KEYWORD_FALSE_HOSTS = {
    '스테이': ['스테이크', '스테이션', '힐스테이트', '에스테이트', '스테이지'],
    '한옥': ['한옥마을'],
    '캠핑': ['캠핑용품', '캠핑장비'],
    '스파': ['인스파이어', '에스파스', '예스파크', '아그네스파크', '파라스파라', '스파크', '스파이', '스파게티'],
    '빌라': ['타임빌라스', '빌라드'],
    '카페': ['카페거리', '카페산'],
    '공원': ['공원뷰'],
}

LISTICLE_NAME_PATTERNS = [
    re.compile(r'[0-9]+\s*선(?!착)'),
    re.compile(r'상세\s*(분석|명세)'),
    re.compile(r'트렌드\s*분석'),
    re.compile(r'마크다운|아카이브'),
    re.compile(r'\bpart\s*[0-9]', re.I),
    re.compile(r'\bchapter\s*[0-9]', re.I),
    re.compile(r'카테고리\s*[0-9]'),
    re.compile(r'[0-9]+\s*부\.'),
    re.compile(r'curation\s+(criteria|philosophy)', re.I),
    re.compile(r'출처\s*메모'),
]

def is_valid_slot(value):
    return value in ('day', 'evening', 'night', 'stay')

def matches_region(spot, region_keys):
    if not region_keys:
        return True
    for key in region_keys:
        matches = REGION_MAP.get(key, [])
        if spot.get('region') in matches:
            return True
    return False

def matches_mood(spot, mood_key):
    if mood_key == 'ALL':
        return True
    m = spot.get('mood')
    return isinstance(m, list) and mood_key in m

def has_keyword(text, keyword):
    if not text:
        return False
    hosts = KEYWORD_FALSE_HOSTS.get(keyword)
    if not hosts:
        return keyword in text
    stripped = text
    for host in hosts:
        stripped = stripped.replace(host, ' ')
    return keyword in stripped

def has_any_keyword(text, keywords):
    return any(has_keyword(text, kw) for kw in keywords)

def name_tokens(name):
    return [t for t in re.split(r'[\s&,·\-—~/()[\]]+', name) if t]

def has_bar_token(name):
    if re.search(r'(?:칵테일|와인|루프탑|스카이|재즈|샴페인|위스키|하이볼|오마카세)\s?바(?![다렌])', name):
        return True
    return any(t in ('바', 'bar') for t in name_tokens(name))

def has_facility_token(name):
    return any(t in FACILITY_KEYWORDS for t in name_tokens(name)) or has_bar_token(name)

def has_facility_conflict(name):
    if not (has_keyword(name, '호텔') or has_keyword(name, '리조트')):
        return False
    return has_facility_token(name)

def has_lodging_price(price):
    if not price:
        return False
    p = price.lower()
    per_night = bool(re.search(r'[0-9]\s*박', p))
    if re.search(r'[0-9]\s*시간|1인|인당|코스|오마카세|입장료', p):
        return per_night
    if per_night:
        return True
    return ('평일' in p) and ('주말' in p)

def is_listicle_entry(spot):
    name = (spot.get('name') or '').strip()
    if not name:
        return True
    if not re.search(r'[0-9A-Za-z가-힣]', name):
        return True
    return any(pat.search(name) for pat in LISTICLE_NAME_PATTERNS)

def is_real_stay_spot(spot):
    if spot.get('slot') != 'stay':
        return True
    name = (spot.get('name') or '').lower()
    cat = (spot.get('category') or '').strip().lower()

    if is_listicle_entry(spot):
        return False
    if spot.get('region') == '전국' and not (isinstance(spot.get('area'), str) and spot.get('area').strip()):
        return False
    if has_facility_conflict(name):
        return False

    if cat and has_any_keyword(cat, STAY_CATEGORY_KEYWORDS):
        return True
    if has_lodging_price(spot.get('price')):
        return True
    if cat:
        return False

    if has_bar_token(name):
        return False
    if has_any_keyword(name, LODGING_FORM_KEYWORDS):
        return True
    if has_any_keyword(name, NON_STAY_KEYWORDS):
        return False
    if has_any_keyword(name, SOFT_STAY_KEYWORDS):
        return not has_facility_token(name)
    return False

def is_course_eligible(spot):
    return is_valid_slot(spot.get('slot')) and not is_listicle_entry(spot) and is_real_stay_spot(spot)

def get_distance_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    d_lat = (lat2 - lat1) * 0.017453292519943295
    d_lng = (lng2 - lng1) * 0.017453292519943295
    a = (math.sin(d_lat * 0.5) ** 2 +
         math.cos(lat1 * 0.017453292519943295) * math.cos(lat2 * 0.017453292519943295) *
         (math.sin(d_lng * 0.5) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def spot_area(spot):
    if not spot:
        return None
    area = spot.get('area')
    if isinstance(area, str) and area.strip():
        return area.strip()
    loc = spot.get('location')
    if isinstance(loc, str) and loc.strip():
        m = re.search(r'([가-힣]+(?:구|시|군))', loc)
        if m:
            return m.group(1)
    return None

def exclude_recent(candidates, recent_ids):
    if not recent_ids:
        return candidates
    filtered = [s for s in candidates if s['id'] not in recent_ids]
    return filtered if filtered else candidates

def pick_random(arr):
    if not arr:
        return None
    return random.choice(arr)

def pick_near_random(candidates, anchor):
    if not anchor or not candidates:
        return pick_random(candidates)

    a_lat = anchor.get('lat')
    a_lng = anchor.get('lng')

    # Tier 1: 5km
    if a_lat is not None and a_lng is not None:
        within_5km = [
            s for s in candidates
            if s.get('lat') is not None and s.get('lng') is not None
            and get_distance_km(a_lat, a_lng, s['lat'], s['lng']) <= 5.0
        ]
        if within_5km:
            return pick_random(within_5km)

    # Tier 2: Same area
    a_area = anchor.get('_area')
    if a_area is not None:
        same_area = [s for s in candidates if s.get('_area') == a_area]
        if same_area:
            return pick_random(same_area)

    # Tier 3: 10km
    if a_lat is not None and a_lng is not None:
        within_10km = [
            s for s in candidates
            if s.get('lat') is not None and s.get('lng') is not None
            and get_distance_km(a_lat, a_lng, s['lat'], s['lng']) <= 10.0
        ]
        if within_10km:
            return pick_random(within_10km)

    # Tier 4: Same region top 3 closest
    same_region = [s for s in candidates if s.get('region') == anchor.get('region')]
    pool = same_region if same_region else candidates

    if a_lat is not None and a_lng is not None:
        with_dist = [
            (s, get_distance_km(a_lat, a_lng, s['lat'], s['lng']))
            for s in pool
            if s.get('lat') is not None and s.get('lng') is not None
        ]
        if with_dist:
            with_dist.sort(key=lambda x: x[1])
            top3 = [x[0] for x in with_dist[:3]]
            return pick_random(top3)

    return pick_random(pool)

class CourseEngine:
    def __init__(self, raw_spots):
        self.eligible_spots = []
        for s in raw_spots:
            if is_course_eligible(s):
                s_copy = dict(s)
                s_copy['_area'] = spot_area(s)
                self.eligible_spots.append(s_copy)

        # Pre-index candidates for every (slot, region_key, mood_key)
        self.index = {}
        for slot in SLOT_ORDER:
            slot_spots = [s for s in self.eligible_spots if s.get('slot') == slot]
            for reg in REGIONS:
                r_key = reg['key']
                r_match = reg['match']
                if r_key == 'ALL':
                    reg_spots = slot_spots
                else:
                    reg_spots = [s for s in slot_spots if s.get('region') in r_match]

                for mood in MOODS:
                    m_key = mood['key']
                    if m_key == 'ALL':
                        combo_spots = reg_spots
                    else:
                        combo_spots = [s for s in reg_spots if isinstance(s.get('mood'), list) and m_key in s['mood']]

                    self.index[(slot, r_key, m_key)] = combo_spots

    def get_candidates(self, slot, r_key, mood_key, exclude_ids):
        pool = self.index.get((slot, r_key, mood_key), [])
        if not exclude_ids:
            return pool
        ex_set = set(exclude_ids)
        return [s for s in pool if s['id'] not in ex_set]

    def generate_course(self, slots_on, r_key, mood_key, avoid_ids=None):
        avoid = avoid_ids or set()

        anchor_slot = None
        anchor_pool = []
        for slot in slots_on:
            cands = exclude_recent(self.get_candidates(slot, r_key, mood_key, []), avoid)
            if cands and (anchor_slot is None or len(cands) < len(anchor_pool)):
                anchor_slot = slot
                anchor_pool = cands

        picked = []
        picked_spots = []
        anchor_spot = None

        if anchor_slot is not None:
            anchor = pick_random(anchor_pool)
            if anchor:
                picked.append(anchor['id'])
                picked_spots.append(anchor)
                anchor_spot = anchor

        steps = []
        for slot in slots_on:
            if slot == anchor_slot:
                steps.append({'slot': slot, 'spot': anchor_spot})
                continue

            cands = exclude_recent(
                self.get_candidates(slot, r_key, mood_key, picked),
                avoid
            )
            chosen = pick_near_random(cands, anchor_spot)
            if chosen:
                picked.append(chosen['id'])
                picked_spots.append(chosen)
            steps.append({'slot': slot, 'spot': chosen})

        return steps

# ---------------------------------------------------------------------------
# Simulation Runner
# ---------------------------------------------------------------------------

def run_simulations(data_path, iterations_per_combo=100):
    t0 = time.time()
    with open(data_path, 'r', encoding='utf-8') as f:
        spots = json.load(f)

    print(f"Loaded {len(spots)} spots from {data_path}")
    engine = CourseEngine(spots)
    print(f"Eligible course spots: {len(engine.eligible_spots)} / {len(spots)}")

    slot_counts = defaultdict(int)
    region_counts = defaultdict(int)
    for s in engine.eligible_spots:
        slot_counts[s.get('slot')] += 1
        region_counts[s.get('region')] += 1
    print(f"Eligible spots by slot: {dict(slot_counts)}")
    print(f"Eligible spots by region: {dict(region_counts)}")

    results = {
        'total_simulations': 0,
        'cross_contamination_count': 0,
        'cross_contamination_details': [],
        'duplicates_in_course_count': 0,
        'duplicates_in_course_details': [],
        'all_region_cross_region_count': 0,
        'all_region_total_count': 0,
        'empty_slot_by_region': defaultdict(lambda: defaultdict(int)),
        'empty_slot_by_mood': defaultdict(lambda: defaultdict(int)),
        'empty_slot_by_combo': defaultdict(lambda: defaultdict(int)),
        'candidate_counts_by_combo': {},
        'combo_totals': defaultdict(int),
        'distances': [],
        'consecutive_distances_by_region': defaultdict(list),
        'diversity_by_combo': {},
        'outliers_gt_15km': 0,
        'outliers_gt_30km': 0,
        'outliers_gt_50km': 0,
        'outliers_gt_100km': 0,
        'outlier_details': [],
        'slot_requests': defaultdict(int),
        'slot_filled': defaultdict(int),
    }

    # Record candidate counts for each combination
    for reg in REGIONS:
        r_key = reg['key']
        for mood in MOODS:
            m_key = mood['key']
            for slot in SLOT_ORDER:
                cands = engine.get_candidates(slot, r_key, m_key, [])
                results['candidate_counts_by_combo'][f"{r_key}:{m_key}:{slot}"] = len(cands)

    slot_configs = [
        ('3_slots', ['day', 'evening', 'night']),
        ('4_slots', ['day', 'evening', 'night', 'stay'])
    ]

    for config_name, slots_on in slot_configs:
        for reg in REGIONS:
            r_key = reg['key']
            r_match = reg['match']

            for mood in MOODS:
                m_key = mood['key']
                combo_key = f"{config_name}:{r_key}:{m_key}"
                picked_ids_set = set()
                session_avoid = set()

                for sim_idx in range(iterations_per_combo):
                    results['total_simulations'] += 1
                    results['combo_totals'][combo_key] += 1
                    if r_key == 'ALL':
                        results['all_region_total_count'] += 1

                    course = engine.generate_course(slots_on, r_key, m_key, session_avoid)

                    for step in course:
                        if step['spot']:
                            session_avoid.add(step['spot']['id'])
                    if len(session_avoid) > 30:
                        session_avoid = set(list(session_avoid)[-15:])

                    # 1. Check duplicates within course
                    spot_ids = [step['spot']['id'] for step in course if step['spot']]
                    if len(spot_ids) != len(set(spot_ids)):
                        results['duplicates_in_course_count'] += 1
                        results['duplicates_in_course_details'].append({
                            'combo': combo_key,
                            'sim_idx': sim_idx,
                            'spot_ids': spot_ids
                        })

                    for sid in spot_ids:
                        picked_ids_set.add(sid)

                    # 2. Check cross contamination
                    course_spots = [step['spot'] for step in course if step['spot']]
                    if r_key != 'ALL':
                        for s in course_spots:
                            if s.get('region') not in r_match:
                                results['cross_contamination_count'] += 1
                                results['cross_contamination_details'].append({
                                    'requested_region': r_key,
                                    'expected_matches': r_match,
                                    'spot_id': s.get('id'),
                                    'spot_name': s.get('name'),
                                    'spot_region': s.get('region'),
                                    'combo': combo_key
                                })
                    else:
                        regions_in_course = set(s.get('region') for s in course_spots)
                        if len(regions_in_course) > 1:
                            results['all_region_cross_region_count'] += 1

                    # 3. Check empty slots
                    for step in course:
                        slot = step['slot']
                        results['slot_requests'][slot] += 1
                        if step['spot'] is None:
                            results['empty_slot_by_region'][r_key][slot] += 1
                            results['empty_slot_by_mood'][m_key][slot] += 1
                            results['empty_slot_by_combo'][combo_key][slot] += 1
                        else:
                            results['slot_filled'][slot] += 1

                    # 4. Check consecutive distances
                    valid_coords = []
                    for step in course:
                        sp = step['spot']
                        if sp and sp.get('lat') is not None and sp.get('lng') is not None:
                            valid_coords.append(sp)

                    for i in range(len(valid_coords) - 1):
                        s1 = valid_coords[i]
                        s2 = valid_coords[i+1]
                        dist = get_distance_km(s1['lat'], s1['lng'], s2['lat'], s2['lng'])
                        results['distances'].append(dist)
                        results['consecutive_distances_by_region'][r_key].append(dist)

                        if dist > 15.0:
                            results['outliers_gt_15km'] += 1
                        if dist > 30.0:
                            results['outliers_gt_30km'] += 1
                        if dist > 50.0:
                            results['outliers_gt_50km'] += 1
                        if dist > 100.0:
                            results['outliers_gt_100km'] += 1
                            if len(results['outlier_details']) < 50:
                                results['outlier_details'].append({
                                    'dist_km': round(dist, 2),
                                    'region_key': r_key,
                                    'combo': combo_key,
                                    'spot1': {'id': s1['id'], 'name': s1['name'], 'region': s1.get('region'), 'area': s1.get('_area')},
                                    'spot2': {'id': s2['id'], 'name': s2['name'], 'region': s2.get('region'), 'area': s2.get('_area')},
                                })

                results['diversity_by_combo'][combo_key] = {
                    'unique_spots': len(picked_ids_set),
                    'total_simulations': iterations_per_combo
                }

    elapsed = time.time() - t0
    print(f"Completed {results['total_simulations']} simulations in {elapsed:.2f}s")
    return results

if __name__ == '__main__':
    data_path = sys.argv[1] if len(sys.argv) > 1 else 'src/data/spots.json'
    results = run_simulations(data_path, iterations_per_combo=100)

    with open('simulation_results.json', 'w', encoding='utf-8') as f:
        serializable = {
            'total_simulations': results['total_simulations'],
            'cross_contamination_count': results['cross_contamination_count'],
            'cross_contamination_details': results['cross_contamination_details'][:20],
            'duplicates_in_course_count': results['duplicates_in_course_count'],
            'all_region_cross_region_count': results['all_region_cross_region_count'],
            'all_region_total_count': results['all_region_total_count'],
            'empty_slot_by_region': {k: dict(v) for k, v in results['empty_slot_by_region'].items()},
            'empty_slot_by_mood': {k: dict(v) for k, v in results['empty_slot_by_mood'].items()},
            'empty_slot_by_combo': {k: dict(v) for k, v in results['empty_slot_by_combo'].items()},
            'candidate_counts_by_combo': results['candidate_counts_by_combo'],
            'slot_requests': dict(results['slot_requests']),
            'slot_filled': dict(results['slot_filled']),
            'outliers_gt_15km': results['outliers_gt_15km'],
            'outliers_gt_30km': results['outliers_gt_30km'],
            'outliers_gt_50km': results['outliers_gt_50km'],
            'outliers_gt_100km': results['outliers_gt_100km'],
            'total_distance_hops': len(results['distances']),
            'outlier_details': results['outlier_details'][:30]
        }
        json.dump(serializable, f, ensure_ascii=False, indent=2)

    print("\n================== SIMULATION SUMMARY ==================")
    print(f"Total Course Generations: {results['total_simulations']}")
    print(f"Cross Contamination (Specific Region Mismatch): {results['cross_contamination_count']}")
    print(f"Duplicates within same course: {results['duplicates_in_course_count']}")
    print(f"ALL-Region cross-region courses: {results['all_region_cross_region_count']} / {results['all_region_total_count']} ({results['all_region_cross_region_count']/max(1, results['all_region_total_count'])*100:.2f}%)")

    dists = results['distances']
    if dists:
        dists.sort()
        avg_d = sum(dists) / len(dists)
        med_d = dists[len(dists)//2]
        p90_d = dists[int(len(dists)*0.90)]
        p95_d = dists[int(len(dists)*0.95)]
        max_d = dists[-1]
        print(f"\nDistance Hops ({len(dists)} hops analyzed):")
        print(f"  Average: {avg_d:.2f} km")
        print(f"  Median : {med_d:.2f} km")
        print(f"  P90    : {p90_d:.2f} km")
        print(f"  P95    : {p95_d:.2f} km")
        print(f"  Max    : {max_d:.2f} km")
        print(f"  Hops > 15km: {results['outliers_gt_15km']} ({results['outliers_gt_15km']/len(dists)*100:.2f}%)")
        print(f"  Hops > 30km: {results['outliers_gt_30km']} ({results['outliers_gt_30km']/len(dists)*100:.2f}%)")
        print(f"  Hops > 50km: {results['outliers_gt_50km']} ({results['outliers_gt_50km']/len(dists)*100:.2f}%)")
        print(f"  Hops > 100km: {results['outliers_gt_100km']} ({results['outliers_gt_100km']/len(dists)*100:.2f}%)")
