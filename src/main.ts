import './style.css';
import rawSpotsData from './data/spots.sample.json';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SlotKey = 'day' | 'evening' | 'night' | 'stay';

interface Spot {
  id: number;
  name: string;
  slot: SlotKey | null;
  region: string;
  mood: string[]; // 'romantic' | 'healing' | 'luxury' | 'gourmet' | 'active' | 'view' | 'retro' | 'trendy'
  /** 시·군·구 단위 근접 지역 (파서가 병렬 추가 중 — 필드 부재/null 허용, spotArea()로만 접근) */
  area?: string | null;
  /** 도로명 또는 지번 정밀 주소 (검색 및 지역 분류 무결성용) */
  address?: string | null;
  location: string;
  price: string | null;
  summary: string;
  category?: string | null;
  image_url?: string | null;
  lat?: number | null;
  lng?: number | null;
  quality_score?: number;
  source: { type: string; url: string | null; note: string };
  verified: boolean;
  is_closed?: boolean;
  social_links?: import('./supabase').SocialLinks;
  metrics?: import('./supabase').SpotMetrics;
  hot_score?: number;
}

interface CourseStep {
  slot: SlotKey;
  spotId: number | null; // null = 후보 없음
}

interface SavedCourse {
  id: string;
  createdAt: string; // ISO
  /** region: 현재 포맷은 배열(다중 선택), 과거 저장분은 문자열 — normalizeRegionCond로 복원 */
  conditions: { region: string[] | string; subZones?: string[]; mood: string; slots: SlotKey[] };
  spotIds: number[];
}

const SLOT_ORDER: SlotKey[] = ['day', 'evening', 'night', 'stay'];

const SLOT_META: Record<SlotKey, { emoji: string; label: string }> = {
  day: { emoji: '☀️', label: '낮' },
  evening: { emoji: '🌆', label: '저녁' },
  night: { emoji: '🌙', label: '밤' },
  stay: { emoji: '🏠', label: '숙박' },
};

// 지역 필터: key → 매칭되는 데이터 region 값 목록 ('전국' region은 항상 포함)
const REGIONS: { key: string; label: string; match: string[] }[] = [
  { key: 'ALL', label: '전체', match: [] },
  { key: 'SEOUL', label: '서울', match: ['서울'] },
  { key: 'GYEONGGI', label: '경기·인천', match: ['경기', '인천'] },
  { key: 'GANGWON', label: '강원', match: ['강원'] },
  { key: 'CHUNGCHEONG', label: '충청', match: ['충청'] },
  { key: 'YEONGNAM', label: '영남', match: ['영남'] },
  { key: 'HONAM', label: '호남', match: ['호남'] },
  { key: 'JEJU', label: '제주', match: ['제주'] },
];

const MOODS: { key: string; emoji: string; label: string }[] = [
  { key: 'ALL', emoji: '', label: '전체' },
  { key: 'romantic', emoji: '✨', label: '로맨틱' },
  { key: 'trendy', emoji: '🔥', label: '핫플' },
  { key: 'gourmet', emoji: '🍷', label: '미식' },
  { key: 'healing', emoji: '🌲', label: '힐링' },
  { key: 'view', emoji: '🌅', label: '뷰·전망' },
  { key: 'luxury', emoji: '👑', label: '럭셔리' },
  { key: 'retro', emoji: '🏮', label: '레트로·전통' },
  { key: 'active', emoji: '🛶', label: '액티비티' },
];

interface PopularZone {
  key: string;
  regionKey: string;
  label: string;
  keywords: string[];
}

const POPULAR_ZONES: PopularZone[] = [
  // 서울 (SEOUL) — 핵심 핫플레이스 존
  { key: 'seongsu', regionKey: 'SEOUL', label: '성수·서울숲', keywords: ['성동구', '성수', '서울숲', '뚝섬'] },
  { key: 'mullae', regionKey: 'SEOUL', label: '영등포·문래·여의도', keywords: ['영등포구', '문래', '여의도', '당산', '영등포', '양평'] },
  { key: 'yeonnam', regionKey: 'SEOUL', label: '연남·연희·홍대', keywords: ['마포구', '서대문구', '연남', '연희', '서교', '망원', '상수', '합정'] },
  { key: 'hannam', regionKey: 'SEOUL', label: '한남·이태원·용산', keywords: ['용산구', '한남', '이태원', '용리단', '해방촌', '경리단', '삼각지'] },
  { key: 'apgujeong', regionKey: 'SEOUL', label: '압구정·신사·청담', keywords: ['강남구', '압구정', '신사', '청담', '도산', '가로수', '논현'] },
  { key: 'jongno', regionKey: 'SEOUL', label: '서촌·북촌·을지로', keywords: ['종로구', '중구', '서촌', '북촌', '삼청', '익선', '을지로', '광화문', '명동'] },
  { key: 'jamsil', regionKey: 'SEOUL', label: '잠실·송리단길', keywords: ['송파구', '잠실', '송리단', '방이', '석촌', '문정'] },
  { key: 'hyehwa', regionKey: 'SEOUL', label: '대학로·혜화·동대문', keywords: ['혜화', '대학로', '동대문', '성북', '낙산', '이화동'] },

  // 경기·인천 (GYEONGGI) — 수도권 핵심 데이트존
  { key: 'bundang', regionKey: 'GYEONGGI', label: '분당·판교', keywords: ['성남시', '분당', '판교', '백현', '정자', '야탑'] },
  { key: 'suwon', regionKey: 'GYEONGGI', label: '수원·행궁동', keywords: ['수원시', '행궁', '인계', '광교', '영통'] },
  { key: 'songdo', regionKey: 'GYEONGGI', label: '송도·영종도', keywords: ['연수구', '송도', '영종', '을왕리', '인천', '부평', '구월'] },
  { key: 'gapyeong', regionKey: 'GYEONGGI', label: '가평·양평', keywords: ['가평군', '양평군', '청평', '두물머리', '설악'] },
  { key: 'ilsan', regionKey: 'GYEONGGI', label: '일산·파주', keywords: ['고양시', '파주시', '헤이리', '출판도시', '킨텍스', '야당'] },
  { key: 'hanam', regionKey: 'GYEONGGI', label: '하남·남양주', keywords: ['하남시', '남양주시', '미사', '팔당', '별내', '다산'] },
  { key: 'anyang', regionKey: 'GYEONGGI', label: '안양·광명·부천', keywords: ['안양시', '광명시', '부천시', '평촌', '범계', '철산'] },

  // 강원 (GANGWON)
  { key: 'gangneung', regionKey: 'GANGWON', label: '강릉 안목·경포', keywords: ['강릉시', '안목', '경포', '초당', '주문진'] },
  { key: 'sokcho', regionKey: 'GANGWON', label: '속초·양양', keywords: ['속초시', '양양군', '인구', '하조대', '낙산', '서피비치'] },
  { key: 'chuncheon', regionKey: 'GANGWON', label: '춘천·홍천', keywords: ['춘천시', '홍천군', '남이섬', '소양강'] },
  { key: 'wonju', regionKey: 'GANGWON', label: '원주·평창', keywords: ['원주시', '평창군', '뮤지엄산', '대관령'] },

  // 충청 (CHUNGCHEONG)
  { key: 'daejeon', regionKey: 'CHUNGCHEONG', label: '대전 둔산·소제동', keywords: ['대전', '둔산', '소제동', '유성', '갈마동', '대흥동', '성심당'] },
  { key: 'cheongju', regionKey: 'CHUNGCHEONG', label: '청주 성안길·수암골', keywords: ['청주시', '성안길', '수암골', '오창', '가경'] },
  { key: 'cheonan', regionKey: 'CHUNGCHEONG', label: '천안·아산', keywords: ['천안시', '아산시', '불당', '신부', '지중해마을'] },
  { key: 'taean', regionKey: 'CHUNGCHEONG', label: '태안·안면도·서산', keywords: ['태안군', '서산시', '안면도', '만리포', '꽃지'] },
  { key: 'gongju', regionKey: 'CHUNGCHEONG', label: '공주·부여', keywords: ['공주시', '부여군', '제민천', '궁남지'] },

  // 호남 (HONAM)
  { key: 'jeonju', regionKey: 'HONAM', label: '전주 한옥마을·객리단길', keywords: ['전주시', '한옥마을', '객리단', '완산', '덕진'] },
  { key: 'yeosu', regionKey: 'HONAM', label: '여수 밤바다·오동도', keywords: ['여수시', '돌산', '이순신광장', '웅천', '해양공원'] },
  { key: 'gwangju', regionKey: 'HONAM', label: '광주 동명동·양림동', keywords: ['광주', '동명동', '양림동', '상무지구', '충장로'] },
  { key: 'suncheon', regionKey: 'HONAM', label: '순천·담양', keywords: ['순천시', '담양군', '순천만', '죽녹원', '메타세콰이어'] },

  // 영남 (YEONGNAM)
  { key: 'busan_gwangalli', regionKey: 'YEONGNAM', label: '부산 광안리·영도', keywords: ['수영구', '영도구', '광안리', '민락', '흰여울'] },
  { key: 'busan_haeundae', regionKey: 'YEONGNAM', label: '부산 해운대·기장', keywords: ['해운대', '기장', '송정', '달맞이', '청사포'] },
  { key: 'busan_seomyeon', regionKey: 'YEONGNAM', label: '부산 서면·전포', keywords: ['부산진구', '서면', '전포', '부전', '카페거리'] },
  { key: 'gyeongju', regionKey: 'YEONGNAM', label: '경주 황리단길', keywords: ['경주시', '황리단', '보문', '월정교', '첨성대'] },
  { key: 'daegu', regionKey: 'YEONGNAM', label: '대구 동성로·교동', keywords: ['중구', '남구', '동성로', '교동', '앞산', '수성못', '삼덕동'] },
  { key: 'pohang', regionKey: 'YEONGNAM', label: '포항 영일대·호미곶', keywords: ['포항시', '영일대', '호미곶', '구룡포', '스페이스워크'] },

  // 제주 (JEJU)
  { key: 'jeju_aewol', regionKey: 'JEJU', label: '제주 애월·한림', keywords: ['애월', '한림', '협재', '판포', '금능'] },
  { key: 'jeju_gujwa', regionKey: 'JEJU', label: '제주 구좌·성산', keywords: ['구좌', '성산', '세화', '종달', '월정리', '우도'] },
  { key: 'jeju_jungmun', regionKey: 'JEJU', label: '제주 중문·서귀포', keywords: ['서귀포', '중문', '안덕', '대정', '이중섭'] },
  { key: 'jeju_city', regionKey: 'JEJU', label: '제주 시내·탑동', keywords: ['제주시', '탑동', '아라동', '노형', '연동', '용담'] },
];

const STORAGE_KEY = 'oneul_saved_courses';
const RECENT_KEY = 'oneul_recent_spots';
import { loadSpots } from './supabase';

const RECENT_MAX = 100;

let spots: Spot[] = rawSpotsData as unknown as Spot[];

// ---------------------------------------------------------------------------
// 순수 함수 — 필터 · 후보 계산 · 랜덤 픽 · 코스 생성 · 텍스트 포맷 (상태/DOM 없음)
// ---------------------------------------------------------------------------

function isValidSlot(value: unknown): value is SlotKey {
  return value === 'day' || value === 'evening' || value === 'night' || value === 'stay';
}

/** 선택된 지역 키들의 합집합으로 매칭. 빈 배열 = 전체 */
function matchesRegion(spot: Spot, regionKeys: string[]): boolean {
  if (regionKeys.length === 0) return true;
  if (spot.region === '전국') return true;
  return regionKeys.some((key) => {
    const region = REGIONS.find((r) => r.key === key);
    return region ? region.match.includes(spot.region) : false;
  });
}

function matchesZone(spot: Spot, zoneKeys: string[]): boolean {
  if (zoneKeys.length === 0) return true;
  const targetText = `${spot.name} ${spot.location} ${spot.area || ''}`;
  return zoneKeys.some((zk) => {
    const zone = POPULAR_ZONES.find((z) => z.key === zk);
    return zone ? zone.keywords.some((kw) => targetText.includes(kw)) : false;
  });
}

function matchesMood(spot: Spot, moodKey: string): boolean {
  if (moodKey === 'ALL') return true;
  return Array.isArray(spot.mood) && spot.mood.includes(moodKey);
}

const STAY_KEYWORDS = ['호텔', '리조트', '펜션', '풀빌라', '글램핑', '캠핑', '카라반', '한옥', '료칸', '게스트하우스', '스테이', '민박', '모텔', '독채', '숙소', '콘도'];
const NON_STAY_KEYWORDS = ['카페', '베이커리', '디저트', '식당', '음식점', '술집', '주점', '와인바', '이자카야', '영화관', '서점', '해수욕장', '공원', '약국', '경찰서', '문화원'];

/** 숙박(stay) 슬롯 장소의 진위 여부 엄격 검증 (카페/식당/영화관 등 오분류 원천 차단) */
function isRealStaySpot(spot: Spot): boolean {
  if (spot.slot !== 'stay') return true;
  const name = spot.name.toLowerCase();
  const cat = (spot.category || '').toLowerCase();
  const summary = (spot.summary || '').toLowerCase();
  const text = `${name} ${cat} ${summary}`;

  if (NON_STAY_KEYWORDS.some((kw) => cat.includes(kw) || name.includes(kw))) {
    if (!STAY_KEYWORDS.some((stay) => name.includes(stay))) {
      return false;
    }
  }
  return STAY_KEYWORDS.some((kw) => text.includes(kw));
}

/** 슬롯 + 지역 + 세부존 + 분위기 조건에 맞는 후보 목록 (excludeIds 제외) */
function getCandidates(
  all: Spot[],
  slot: SlotKey,
  regionKeys: string[],
  moodKey: string,
  excludeIds: number[],
  zoneKeys: string[] = [],
): Spot[] {
  const base = all.filter(
    (s) =>
      isValidSlot(s.slot) &&
      s.slot === slot &&
      matchesRegion(s, regionKeys) &&
      matchesMood(s, moodKey) &&
      !excludeIds.includes(s.id) &&
      (slot !== 'stay' || isRealStaySpot(s)),
  );
  if (zoneKeys.length === 0) return base;
  const zoneFiltered = base.filter((s) => matchesZone(s, zoneKeys));
  return zoneFiltered.length > 0 ? zoneFiltered : base;
}

/**
 * 체감 랜덤 보정 — 최근 노출 이력 스폿을 소프트 제외.
 * 제외하면 후보가 0이 되는 경우 이력을 무시하고 원본 반환 (기능이 후보를 굶기면 안 됨).
 */
function excludeRecent(candidates: Spot[], recentIds: ReadonlySet<number>): Spot[] {
  if (recentIds.size === 0) return candidates;
  const filtered = candidates.filter((s) => !recentIds.has(s.id));
  return filtered.length > 0 ? filtered : candidates;
}

/** 두 위경도 좌표 간의 거리 계산 (km) */
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** rng 주입 가능 랜덤 픽 — 오늘의 코스(시드 PRNG)와 일반 생성(Math.random)이 공유 */
function pickRandom<T>(arr: T[], rng: () => number = Math.random): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/** 스폿의 자치구/지역 안전 추출 — spot.area 우선 사용, 없으면 spot.location에서 구/시/군 정규식 파싱 */
function spotArea(spot: Spot | undefined): string | null {
  if (!spot) return null;
  if (typeof spot.area === 'string' && spot.area.trim().length > 0) {
    return spot.area.trim();
  }
  if (typeof spot.location === 'string' && spot.location.trim().length > 0) {
    const m = spot.location.match(/([가-힣]+(?:구|시|군))/);
    if (m) return m[1];
  }
  return null;
}

/**
 * 앵커 스폿 기준 스마트 근접 랜덤 선택 (물리적 거리 + 동일 자치구 클러스터링).
 * 1순위: 앵커와 물리적 거리 5km 이내 초근접 스폿 (실제 데이트 도보/대중교통 최적 동선)
 * 2순위: 앵커와 동일 자치구/행정구역 스폿 (예: 둘 다 영등포구, 마포구, 성동구 등)
 * 3순위: 앵커와 물리적 거리 10km 이내 인접 생활권 스폿
 * 4순위: 전체 조건 통과 후보 폴백
 */
function pickNearRandom(
  candidates: Spot[],
  anchor: Spot | null | undefined,
  rng: () => number = Math.random,
): Spot | undefined {
  if (!anchor || candidates.length === 0) {
    return pickRandom(candidates, rng);
  }

  // 1순위: 위경도 반경 5km 이내 초근접
  if (anchor.lat != null && anchor.lng != null) {
    const within5km = candidates.filter(
      (s) => s.lat != null && s.lng != null && getDistanceKm(anchor.lat!, anchor.lng!, s.lat!, s.lng!) <= 5.0,
    );
    if (within5km.length > 0) {
      return pickRandom(within5km, rng);
    }
  }

  // 2순위: 동일 자치구/행정구역
  const aArea = spotArea(anchor);
  if (aArea !== null) {
    const sameArea = candidates.filter((s) => spotArea(s) === aArea);
    if (sameArea.length > 0) {
      return pickRandom(sameArea, rng);
    }
  }

  // 3순위: 위경도 반경 10km 이내 생활권
  if (anchor.lat != null && anchor.lng != null) {
    const within10km = candidates.filter(
      (s) => s.lat != null && s.lng != null && getDistanceKm(anchor.lat!, anchor.lng!, s.lat!, s.lng!) <= 10.0,
    );
    if (within10km.length > 0) {
      return pickRandom(within10km, rng);
    }
  }

  // 4순위: 전체 후보 폴백
  return pickRandom(candidates, rng);
}

/** 스텝 목록에서 excludeIndex를 제외한 스폿 중 가장 대표적인 앵커 스폿 반환 */
function dominantAnchorSpot(
  steps: CourseStep[],
  byId: Map<number, Spot>,
  excludeIndex: number,
): Spot | null {
  for (let i = 0; i < steps.length; i++) {
    if (i !== excludeIndex && steps[i].spotId !== null) {
      const s = byId.get(steps[i].spotId!);
      if (s) return s;
    }
  }
  return null;
}

interface GenerateOptions {
  /** 시드 PRNG 주입 (오늘의 코스). 미지정 시 Math.random */
  rng?: () => number;
  /** 체감 랜덤 보정 — 소프트 제외할 최근 노출 스폿 ID (오늘의 코스는 미적용) */
  avoidIds?: ReadonlySet<number>;
}

/**
 * 앵커 기반 근접 코스 생성 (물리적 거리 및 자치구 클러스터링).
 * 1) 켠 슬롯 중 후보 수가 가장 적은(단, 1개 이상) 슬롯을 앵커로 먼저 랜덤 선택
 * 2) 나머지 슬롯은 앵커와의 거리(5~10km) 및 자치구 기준으로 밀착 선택
 */
function generateCourse(
  all: Spot[],
  slotsOn: SlotKey[],
  regionKeys: string[],
  moodKey: string,
  opts: GenerateOptions = {},
  zoneKeys: string[] = [],
): CourseStep[] {
  const rng = opts.rng ?? Math.random;
  const avoid = opts.avoidIds ?? new Set<number>();

  // 앵커 슬롯: 후보가 1개 이상인 슬롯 중 후보 수 최소 (동률은 슬롯 순서 선착순)
  let anchorSlot: SlotKey | null = null;
  let anchorPool: Spot[] = [];
  for (const slot of slotsOn) {
    const candidates = excludeRecent(getCandidates(all, slot, regionKeys, moodKey, [], zoneKeys), avoid);
    if (candidates.length > 0 && (anchorSlot === null || candidates.length < anchorPool.length)) {
      anchorSlot = slot;
      anchorPool = candidates;
    }
  }

  const picked: number[] = [];
  let anchorSpot: Spot | null = null;
  if (anchorSlot !== null) {
    const anchor = pickRandom(anchorPool, rng);
    if (anchor) {
      picked.push(anchor.id);
      anchorSpot = anchor;
    }
  }

  return slotsOn.map((slot) => {
    if (slot === anchorSlot) return { slot, spotId: anchorSpot ? anchorSpot.id : null };
    const candidates = excludeRecent(
      getCandidates(all, slot, regionKeys, moodKey, picked, zoneKeys),
      avoid,
    );
    const chosen = pickNearRandom(candidates, anchorSpot, rng);
    if (chosen) picked.push(chosen.id);
    return { slot, spotId: chosen ? chosen.id : null };
  });
}

/** 선택 지역 라벨을 '·'로 연결. 세부존이 있으면 세부존 라벨 표시 */
function regionsLabel(regionKeys: string[], zoneKeys: string[] = []): string {
  if (zoneKeys.length > 0) {
    const zoneLabels = zoneKeys
      .map((zk) => POPULAR_ZONES.find((z) => z.key === zk)?.label ?? zk)
      .filter((lbl): lbl is string => Boolean(lbl));
    if (zoneLabels.length > 0) return zoneLabels.join('·');
  }
  if (regionKeys.length === 0) return '전국';
  return regionKeys
    .map((key) => REGIONS.find((r) => r.key === key)?.label ?? key)
    .join('·');
}

/** 조회수 숫자 축약 포맷 (예: 154000 -> 15.4만) */
function formatViews(views: number): string {
  if (views >= 10000) {
    const man = views / 10000;
    return man >= 10 ? `${Math.floor(man)}만` : `${man.toFixed(1)}만`;
  }
  if (views >= 1000) {
    return `${(views / 1000).toFixed(0)}천`;
  }
  return `${views}`;
}

/** 저장 포맷 하위호환 — 과거 문자열 region('ALL' 포함)을 배열로 정규화 */
function normalizeRegionCond(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.filter((k) => k !== 'ALL');
  if (typeof value === 'string' && value !== 'ALL') return [value];
  return [];
}

function moodLabel(moodKey: string): string {
  if (moodKey === 'ALL') return '전체';
  return MOODS.find((m) => m.key === moodKey)?.label ?? moodKey;
}

/** 스폿 mood 키 → 한글 라벨 1~2개 (스텝 카드 신뢰 장치용) */
function moodTagLabels(spot: Spot): string[] {
  if (!Array.isArray(spot.mood)) return [];
  return spot.mood
    .map((key) => MOODS.find((m) => m.key === key)?.label)
    .filter((label): label is string => Boolean(label))
    .slice(0, 2);
}

const KNOWN_NAME_MAP: Record<string, string> = {
  aquafield: '아쿠아필드',
  termeden: '테르메덴',
  'simmons terrace': '시몬스테라스',
};
const FAMOUS_AREAS = [
  '성수', '청담', '한남', '이태원', '홍대', '서촌', '북촌', '강남', '여의도', '압구정',
  '송파', '잠실', '판교', '분당', '송도', '해운대', '광안리', '서면', '동성로',
  '여수', '경주', '제천', '태안', '공주', '강릉', '속초', '춘천', '평창', '양양',
  '제주', '서귀포', '애월', '협재', '중문', '전주', '익산', '군산', '포항', '안동',
  '가평', '양평', '파주', '수원', '용인', '화성', '안성', '이천', '하남', '남양주',
  '김포', '광명', '안양', '부천', '인천', '대전', '대구', '부산', '울산', '광주',
];

/**
 * 네이버 지도 검색어 고도화 정제.
 */
function mapQuery(spot: Spot): string {
  const rawName = (spot.name || '').trim();

  const bracketHints: string[] = [];
  const bracketMatches = rawName.match(/\(([^)]+)\)|\[([^\]]+)\]|（([^）]+)）|【([^】]+)】/g);
  if (bracketMatches) {
    for (const b of bracketMatches) {
      const inside = b.replace(/[\(\)\[\]（）\【\】]/g, '').trim();
      bracketHints.push(inside);
    }
  }

  let cleanName = rawName
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/【[^】]*】/g, '')
    .trim();

  if (!cleanName && bracketHints.length > 0) {
    cleanName = bracketHints[0];
  }
  if (!cleanName) cleanName = rawName;

  if (cleanName.includes(':')) {
    const parts = cleanName.split(':');
    const prefix = parts[0].trim();
    const suffix = parts.slice(1).join(' ').trim();
    if (/산책|코스|투어|탐방|데이트|스팟|명소|거리|골목|여행|체험|기준|DB/.test(prefix)) {
      cleanName = suffix || prefix;
    } else {
      cleanName = prefix || suffix;
    }
  }

  if (/(&|\+|↔|&amp;|\s및\s|\s\/\s)/.test(cleanName)) {
    const parts = cleanName.split(/&|\+|↔|&amp;|\s및\s|\s\/\s/);
    if (parts[0].trim().length > 0) {
      cleanName = parts[0].trim();
    }
  }

  if (cleanName.includes(' - ')) {
    const parts = cleanName.split(' - ');
    const brand = parts[0].replace(/서울|강남|호텔/g, '').trim();
    const sub = parts[1].trim();
    if (brand && sub && !brand.includes(sub) && !sub.includes(brand)) {
      cleanName = `${brand} ${sub}`;
    } else {
      cleanName = parts[1].trim() || parts[0].trim();
    }
  }

  // 6. 긴 업종/체험/패키지/상품 수식어 다이어트
  const descriptorRegex =
    /\s+(VIP|VVIP|프리미엄|명품|수제|원데이클래스|원데이\s*클래스|클래스|아틀리에|갤러리|스튜디오|살롱|공방|옻칠|나전칠기|도자기|가죽공방|도예공방|체험장|체험관|투어|산책로|산책코스|야시장|먹거리|거리|골목|본점|직영점|요트|보트|샴페인|라운지|바베큐|바베큐장|테라스|그릴|다이닝|루프탑|루프탑가든|디너|런치|오마카세|코스요리|패키지|렌탈|이용권|피크닉|캠크닉|캠핑|글램핑|스파|사우나).*$/i;
  if (descriptorRegex.test(cleanName)) {
    const trimmed = cleanName.replace(descriptorRegex, '').trim();
    if (trimmed.length >= 2) {
      cleanName = trimmed;
    }
  }

  // 6-1. 3단어 이상의 복합 패키지명 상호의 경우 앞부분 핵심 상호 우선 추출 (예: '골든블루마리나 리치몬드 ...' -> '골든블루마리나')
  const words = cleanName.split(/\s+/);
  if (words.length >= 3 && words[0].length >= 3) {
    cleanName = words.slice(0, 2).join(' ');
  }

  // 7. 특수기호 제거 (알파벳, 한글, 숫자, 공백, 온점, 하이픈 외)
  cleanName = cleanName
    .replace(/[^\w\s가-힣0-9.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 8. 영문 상호 한글화 사전 매핑
  const lower = cleanName.toLowerCase();
  for (const [eng, kor] of Object.entries(KNOWN_NAME_MAP)) {
    if (lower === eng || lower.startsWith(eng + ' ') || lower.endsWith(' ' + eng) || lower.includes(' ' + eng + ' ')) {
      cleanName = cleanName.replace(new RegExp(eng, 'ig'), kor);
    }
  }

  // 8. 스마트 지역 결합 로직 (시/군/구 또는 동/읍/면 단위로만 스마트 결합, 번지수 절대 배제)
  let candidateArea: string | null = null;

  // 8-0. spot.location 내 주요 명소/핵심 지명 우선 추출 (예: '영종도', '성수', '한남', '해운대')
  if (spot.location) {
    const subLocMatch = spot.location.match(/(영종도|을왕리|월미도|송도|청라|행궁동|성수|한남|연남|서촌|북촌|익선|송리단|문래|대부도|제부도|안목|경포|초당|해운대|광안리|전포)/);
    if (subLocMatch) {
      candidateArea = subLocMatch[1];
    }
  }

  // 8-1. spot.area (시·군·구 단위)
  if (!candidateArea) {
    const spArea = spotArea(spot);
    if (spArea && spArea !== '전국' && spArea !== '수도권') {
      candidateArea = spArea.trim();
    }
  }

  // 8-2. spot.address에서 시/군/구 또는 동/읍/면만 깔끔하게 추출 (번지수, 도로번호 배제)
  if (!candidateArea && spot.address && spot.address.trim().length > 0) {
    const addr = spot.address.trim();
    const guMatch = addr.match(/([가-힣]+(?:시|군|구))/g);
    const dongMatch = addr.match(/([가-힣]+(?:동|읍|면))/);
    if (guMatch && guMatch.length > 0) {
      candidateArea = guMatch[guMatch.length - 1];
    } else if (dongMatch) {
      candidateArea = dongMatch[1];
    }
  }

  // 8-3. spot.location에서 유효 행정구역 추출 (시/군/구/동/읍/면)
  if (!candidateArea && spot.location && spot.location !== '전국' && spot.location !== '수도권') {
    const locMatch = spot.location.match(/([가-힣0-9]+(?:시|군|구|동|읍|면))/);
    if (locMatch && !['전국', '수도권', '서울시', '경기도', '인천시', '강원도', '충청도', '전라도', '경상도', '제주도'].includes(locMatch[1])) {
      candidateArea = locMatch[1];
    }
  }

  // 8-4. 괄호 힌트에서 영문 지명 매핑 (Hanam -> 하남, Icheon -> 이천 등)
  if (!candidateArea && bracketHints.length > 0) {
    const hintText = bracketHints.join(' ');
    if (/hanam/i.test(hintText)) candidateArea = '하남';
    else if (/icheon/i.test(hintText)) candidateArea = '이천';
    else if (/goyang/i.test(hintText)) candidateArea = '고양';
    else if (/yeosu/i.test(hintText)) candidateArea = '여수';
    else if (/gangneung/i.test(hintText)) candidateArea = '강릉';
    else if (/sokcho/i.test(hintText)) candidateArea = '속초';
    else if (/chuncheon/i.test(hintText)) candidateArea = '춘천';
    else if (/jeju/i.test(hintText)) candidateArea = '제주';
  }

  // 8-5. spot.region 폴백 (광역명 제외)
  if (!candidateArea && spot.region && !['전국', '수도권', '서울', '경기', '인천', '강원', '충청', '영남', '호남', '제주'].includes(spot.region)) {
    candidateArea = spot.region.trim();
  }

  // 8-6. 모호한 전국 공통 구 이름('중구', '서구', '동구', '남구', '북구', '강서구') 방어 처리
  const AMBIGUOUS_GU = ['중구', '서구', '동구', '남구', '북구', '강서구'];
  if (candidateArea && AMBIGUOUS_GU.includes(candidateArea)) {
    // 상호명이 2단어 이상이거나 유니크한 경우 모호한 구 이름 단독 결합은 검색을 망치므로 생략하거나 시·도 접두사를 결합
    if (spot.region && ['서울', '인천', '부산', '대구', '대전', '광주', '울산'].includes(spot.region)) {
      candidateArea = `${spot.region} ${candidateArea}`;
    } else {
      candidateArea = null;
    }
  }

  // 8-7. 중복 결합 방지 검사 및 결합
  if (candidateArea) {
    const simpleArea = candidateArea.replace(/(시|군|구|동|읍|면)$/, '');
    const alreadyHasArea =
      cleanName.includes(candidateArea) ||
      (simpleArea.length >= 2 && cleanName.includes(simpleArea)) ||
      FAMOUS_AREAS.some(
        (reg) =>
          cleanName.includes(reg) &&
          (candidateArea?.includes(reg) || (spot.location && spot.location.includes(reg))),
      );

    if (!alreadyHasArea) {
      cleanName = `${cleanName} ${candidateArea}`.trim();
    }
  }

  return cleanName || spot.name.trim();
}

/** 스폿의 네이버/카카오 지도 바로가기 URL — 정식 지도 도메인으로만 엄격하게 한정 */
function naverMapUrl(spot: Spot): string {
  // 1. source.url이 정식 네이버 지도/플레이스 링크인 경우만 허용 (블로그/일반 웹페이지 배제)
  if (spot.source?.url) {
    const u = spot.source.url;
    if (u.includes('map.naver.com') || u.includes('naver.me') || u.includes('m.place.naver.com')) {
      return u;
    }
  }
  // 2. 카카오맵 정식 플레이스 상세 링크인 경우
  if (spot.social_links?.kakaomap?.url) {
    const ku = spot.social_links.kakaomap.url;
    if (ku.includes('place.map.kakao.com') || ku.includes('map.kakao.com/link/map/')) {
      return ku;
    }
  }
  // 3. 그 외 블로그/일반 웹/뉴스 링크 등은 배제하고 정제된 네이버 지도 검색 URL로 통일
  return `https://map.naver.com/p/search/${encodeURIComponent(mapQuery(spot))}`;
}

/** 복사 텍스트용 스팟 한 줄 소개 정제 (영문 날것 태그 방지 & 한국어 보강) */
function getCleanSpotSummary(spot: Spot): string {
  if (spot.summary && spot.summary.trim().length > 0) {
    const raw = spot.summary.trim();
    // 영문 키워드 나열(예: 'trendy, romantic', 'campnic') 형태인지 검사
    if (!/^[a-zA-Z0-9,\s_-]+$/.test(raw)) {
      return raw;
    }
  }
  
  // 한국어 카테고리 및 무드 태그로 자연스럽게 구성
  const moods = moodTagLabels(spot);
  if (spot.category && moods.length > 0) {
    return `${moods.join(' · ')} 분위기의 감성 ${spot.category}`;
  }
  if (spot.category) {
    return `분위기 좋은 감성 ${spot.category}`;
  }
  if (moods.length > 0) {
    return `${moods.join(' · ')} 추천 데이트 스팟`;
  }
  return '에디터가 검증한 추천 데이트 명소';
}

const urlCache = new Map<string, string>();

/** URL을 TinyURL API로 실시간 초단축 (캐시 및 타임아웃 1.2초/폴백 내장) */
async function shortenUrl(longUrl: string): Promise<string> {
  if (urlCache.has(longUrl)) {
    return urlCache.get(longUrl)!;
  }
  // 이미 네이버 공식 단축링크(naver.me)인 경우 그대로 사용
  if (longUrl.includes('naver.me') || longUrl.length <= 30) {
    return longUrl;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200); // 1.2초 타임아웃
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const short = (await res.text()).trim();
      if (short.startsWith('http://') || short.startsWith('https://')) {
        urlCache.set(longUrl, short);
        return short;
      }
    }
  } catch {
    // 실패 시 원본 longUrl 사용
  }
  return longUrl;
}

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
const aiStoryCache = new Map<string, string>();

/**
 * Groq Llama 3.3 초고속 무료 API를 호출하여 세련된 AI 에디터 코스 브리핑 한 줄 생성
 * API 키가 없거나 호출 실패 시 null을 반환하여 기존 텍스트의 불필요한 깜빡임 방지
 */
async function fetchGroqAiStory(
  steps: CourseStep[],
  byId: Map<number, Spot>,
  moodKey: string,
): Promise<string | null> {
  const filled = steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);
  if (filled.length === 0) return null;

  const cacheKey = `${moodKey}_${filled.map((s) => s.spotId).join('-')}`;
  if (aiStoryCache.has(cacheKey)) {
    return aiStoryCache.get(cacheKey)!;
  }

  if (!GROQ_API_KEY) {
    return null;
  }

  const spotDescriptions = filled
    .map((st) => {
      const s = byId.get(st.spotId);
      if (!s) return '';
      const meta = SLOT_META[st.slot];
      return `${meta.label}: ${s.name} (${s.category || ''}, ${s.summary || ''})`;
    })
    .filter(Boolean)
    .join('\n');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000); // 2초 타임아웃

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `당신은 킨포크(Kinfolk)와 아이즈매거진(eyesmag)의 수석 데이트 큐레이터입니다.
[필수 원칙]
1. 단순 동선 나열식 문형(~에서 시작해 ~를 거쳐 ~로 마무리하는 코스예요)은 '절대 금지'합니다.
2. 공간의 질감, 빛과 분위기, 두 사람의 감정선이 자연스럽게 이어지는 깊이 있는 에디토리얼 산문(1~2문장, 70~100자)으로 작성하세요.
3. 장소명은 억지로 욱여넣지 않고 이야기 속에 유려하게 녹여내세요.
4. 불필요한 따옴표나 서두 없이 정제된 본문 텍스트만 출력하세요.

[에디터 모범 톤앤매너 예시]
- 나른한 오후를 깨우는 러스트베이커리의 향긋한 버터 풍미, 양키통닭의 바삭한 온기 너머 신흥상회의 잔잔한 와인 한잔으로 젖어드는 둘만의 깊은 밤.
- 따스한 햇살이 머무는 서울숲의 감성 공간에서 정갈한 다이닝으로, 그리고 달빛 아래 루프탑의 그윽한 무드로 이어지는 완벽한 템포의 하루.
- 번잡한 일상을 잊고 마주 앉아 나누는 공간의 미학과 미식의 깊이, 두 사람의 계절을 가장 로맨틱하게 기록할 여정.`,
          },
          {
            role: 'user',
            content: `[스팟 리스트]\n${spotDescriptions}\n\n[무드 테마]: ${moodLabel(moodKey)}\n\n위 장소들이 빚어내는 공간의 분위기와 감정선을 살려, 잡지 에디터 노트 스타일의 감도 높은 브리핑을 작성해줘.`,
          },
        ],
        temperature: 0.72,
        max_tokens: 150,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.choices?.[0]?.message?.content?.trim();
      if (rawText && rawText.length >= 15) {
        const cleanText = rawText.replace(/^["'“”]/, '').replace(/["'“”]$/, '').trim();
        aiStoryCache.set(cacheKey, cleanText);
        return cleanText;
      }
    }
  } catch (err) {
    // 타임아웃 또는 네트워크 오류 시 조용히 null 반환
  }

  return null;
}

/**
 * 완성된 코스의 슬롯별 스팟들을 종합 분석하여 감성 매거진 에디토리얼 스타일의 10가지 다채로운 브리핑 생성
 * 단순 나열식 문형을 완전히 탈피하고, 공간의 질감, 빛의 흐름, 감정선 중심의 10대 고감도 스타일 템플릿 적용
 */
function generateCourseStory(
  steps: CourseStep[],
  byId: Map<number, Spot>,
  moodKey: string,
  forHtml: boolean = true,
): string {
  const filled = steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);
  if (filled.length === 0) return '두 사람의 취향을 온전히 담아낸 프라이빗 데이트 코스예요.';

  // 스팟 ID 기반 결정론적 시드 (동일 코스에서 텍스트 일관성 보장)
  const idSum = filled.reduce((acc, st) => acc + st.spotId, 0);

  const spotMap = new Map<SlotKey, Spot>();
  filled.forEach((st) => {
    const s = byId.get(st.spotId);
    if (s) spotMap.set(st.slot, s);
  });

  const day = spotMap.get('day');
  const eve = spotMap.get('evening');
  const night = spotMap.get('night');
  const stay = spotMap.get('stay');

  const wrap = (name: string) => (forHtml ? `<strong>${escapeHtml(name)}</strong>` : name);

  // 단일 슬롯 선택 시
  if (filled.length === 1) {
    const s = filled[0];
    const spot = byId.get(s.spotId)!;
    const singleStyles = [
      `남다른 감각과 무드가 돋보이는 ${wrap(spot.name)}에서 오롯이 둘만의 시간에 집중해보세요.`,
      `공간 그 자체로 특별한 영감을 전하는 ${wrap(spot.name)}에서의 여유로운 순간이에요.`,
      `취향을 섬세하게 어루만지는 ${wrap(spot.name)}에서 잊지 못할 여운을 만끽해보세요.`,
    ];
    return singleStyles[idSum % singleStyles.length];
  }

  const moodClosing: Record<string, string> = {
    romantic: '영화 속 한 장면처럼 로맨틱하게 기억될 코스예요 ✨',
    healing: '마음의 여백을 넉넉하게 채워줄 다정한 힐링 여정이에요 🌿',
    scenic: '시선이 머무는 곳마다 그림 같은 풍경을 선사하는 코스예요 🌅',
    luxury: '일상에 우아한 감각과 특별함을 더해줄 하이엔드 데이트예요 🥂',
    gourmet: '오감을 풍요롭게 자극하는 감각적인 미식 코스예요 🍷',
    trendy: '트렌디한 감각과 독보적인 감성이 돋보이는 코스예요 힙 ✨',
    active: '지루할 틈 없이 활기찬 에너지를 채워줄 데이트예요 ⚡',
  };
  const defaultClosing = moodClosing[moodKey] || '일상 속에서 잊지 못할 설렘을 선물할 추천 코스예요 💖';

  // 10가지 다채로운 에디토리얼 스타일 패턴 (0 ~ 9)
  const pattern = idSum % 10;

  switch (pattern) {
    // 0. 공간의 감각 & 템포 연결형 (Cinematic Rhythm)
    case 0: {
      const parts: string[] = [];
      if (day) parts.push(`${wrap(day.name)}의 나른하고 따스한 공기`);
      if (eve) parts.push(`${wrap(eve.name)}에서 마주하는 정갈한 미식`);
      if (night) parts.push(`${wrap(night.name)}의 은은한 조명 아래 낭만으로 물드는 밤`);
      if (stay) parts.push(`${wrap(stay.name)}에서 누리는 아늑한 여운`);
      return `${parts.join(', ')} — 두 사람의 템포에 꼭 맞춘 특별한 하루예요.`;
    }

    // 1. 에디토리얼 스토리텔링형 (Sensory Narrative)
    case 1: {
      if (day && eve && night) {
        return `${wrap(day.name)}에서 나누는 설레는 대화가 ${wrap(eve.name)}의 근사한 테이블로, 그리고 ${wrap(night.name)}의 감미로운 무드로 자연스레 젖어드는 완벽한 여정이에요.`;
      }
      if (day && eve) {
        return `${wrap(day.name)}의 여유로운 감성에서 시작해 ${wrap(eve.name)}의 황홀한 맛으로 이어지는 감각적인 데이트예요.`;
      }
      if (eve && night) {
        return `${wrap(eve.name)}의 로맨틱한 식사 뒤에 ${wrap(night.name)}에서 깊어가는 밤의 정취를 온전히 누려보세요.`;
      }
      break;
    }

    // 2. 공간 미학과 감정선 중심형 (Atmospheric Romance)
    case 2: {
      const segments: string[] = [];
      if (day) segments.push(`햇살이 머무는 ${wrap(day.name)}의 여유`);
      if (eve) segments.push(`${wrap(eve.name)}에서 나누는 특별한 한 끼`);
      if (night) segments.push(`${wrap(night.name)}에서 이어지는 둘만의 밀도 높은 대화`);
      if (stay) segments.push(`${wrap(stay.name)}에서의 온전한 쉼`);
      return `${segments.join(', ')}. ${defaultClosing}`;
    }

    // 3. 시적 계절감 & 빛의 흐름형 (Lyrical Light & Shadow)
    case 3: {
      const lights: string[] = [];
      if (day) lights.push(`오후의 따스한 볕을 품은 ${wrap(day.name)}`);
      if (eve) lights.push(`노을빛 아래 그윽해지는 ${wrap(eve.name)}`);
      if (night) lights.push(`달빛 아래 잔잔한 속삭임이 맴도는 ${wrap(night.name)}`);
      if (stay) lights.push(`별빛을 마주하는 ${wrap(stay.name)}`);
      return `${lights.join('부터 ')}까지, 시간의 결을 따라 물드는 로맨틱한 하루예요.`;
    }

    // 4. 취향 & 큐레이션 찬사형 (Curated Taste)
    case 4: {
      const tastes: string[] = [];
      if (day) tastes.push(`${wrap(day.name)}의 감각적인 무드`);
      if (eve) tastes.push(`${wrap(eve.name)}의 섬세한 요리`);
      if (night) tastes.push(`${wrap(night.name)}의 아늑한 온기`);
      if (stay) tastes.push(`${wrap(stay.name)}의 편안한 휴식`);
      return `${tastes.join('와 ')}가 조화롭게 어우러져 두 사람의 취향을 온전히 만족시킬 셀렉션이에요.`;
    }

    // 5. 일상 탈출 & 몰입형 (Urban Sanctuary)
    case 5: {
      const escapes: string[] = [];
      if (day) escapes.push(`${wrap(day.name)}에서 찾는 작은 쉼`);
      if (eve) escapes.push(`${wrap(eve.name)}의 깊은 풍미`);
      if (night) escapes.push(`${wrap(night.name)}의 은은한 밤공기`);
      if (stay) escapes.push(`${wrap(stay.name)}에서의 하룻밤`);
      return `도심의 소음을 벗어나 ${escapes.join(', 그리고 ')}에 오롯이 빠져보는 낭만적인 시간이에요.`;
    }

    // 6. 시네마틱 모먼트형 (Cinematic Moments)
    case 6: {
      if (day && eve && night) {
        return `${wrap(day.name)}의 기분 좋은 시작, ${wrap(eve.name)}에서 마주하는 설레는 순간, ${wrap(night.name)}의 감미로운 음악이 더해져 영화 속 한 장면처럼 기억될 코스예요.`;
      }
      if (day && eve) {
        return `${wrap(day.name)}에서 빚어낸 미소와 ${wrap(eve.name)}에서의 로맨틱한 순간이 오래도록 마음에 남을 데이트예요.`;
      }
      if (eve && night) {
        return `${wrap(eve.name)}의 황홀한 테이블과 ${wrap(night.name)}의 반짝이는 밤 풍경이 한 편의 영화처럼 이어져요.`;
      }
      break;
    }

    // 7. 비밀스러운 아지트 & 낭만형 (Secret Hideout)
    case 7: {
      const spots: string[] = [];
      if (day) spots.push(`둘만의 아지트 같은 ${wrap(day.name)}`);
      if (eve) spots.push(`정성 어린 요리가 있는 ${wrap(eve.name)}`);
      if (night) spots.push(`시간이 멈춘 듯 아늑한 ${wrap(night.name)}`);
      if (stay) spots.push(`프라이빗한 쉼터 ${wrap(stay.name)}`);
      return `${spots.join(', ')}에서 다른 누구에게도 방해받지 않는 둘만의 온기를 느껴보세요.`;
    }

    // 8. 오감 자극 미식 & 감성형 (Sensory Symphony)
    case 8: {
      const senses: string[] = [];
      if (day) senses.push(`${wrap(day.name)}의 향긋한 티타임`);
      if (eve) senses.push(`${wrap(eve.name)}에서 터져 나오는 풍성한 미식`);
      if (night) senses.push(`${wrap(night.name)}의 감미로운 한잔`);
      if (stay) senses.push(`${wrap(stay.name)}의 포근한 침구`);
      return `${senses.join('과 ')}으로 오감이 충만해지는 감각적인 코스예요 ✨`;
    }

    // 9. 기억 & 영원성형 (Everlasting Memory)
    case 9:
    default: {
      const memories: string[] = [];
      if (day) memories.push(`${wrap(day.name)}에서 피어난 다정한 미소`);
      if (eve) memories.push(`${wrap(eve.name)}의 따뜻한 식탁`);
      if (night) memories.push(`${wrap(night.name)}의 깊은 밤하늘`);
      if (stay) memories.push(`${wrap(stay.name)}의 고요한 아침`);
      return `${memories.join('가 ')} 하나로 이어져, 두 사람에게 가장 소중한 계절의 한 페이지로 기록될 여정이에요.`;
    }
  }

  // 폴백
  const firstSpot = byId.get(filled[0].spotId);
  const lastSpot = byId.get(filled[filled.length - 1].spotId);
  if (firstSpot && lastSpot) {
    return `${wrap(firstSpot.name)}부터 ${wrap(lastSpot.name)}까지 감각적인 무드가 자연스럽게 흐르는 완벽한 데이트예요.`;
  }
  return '두 사람의 취향을 온전히 담아낸 프라이빗 데이트 코스예요.';
}

/**
 * 텍스트 복사 포맷 (시안 A: 모던 불릿 카드형 — Short URL & 표준 URL 인코딩 지원)
 * 전각 공백을 제거하고 네이버 공식 naver.me 또는 초단축 Short URL로 깔끔하게 출력
 */
async function formatCourseTextAsync(
  steps: CourseStep[],
  byId: Map<number, Spot>,
  regionKeys: string[],
  moodKey: string,
  zoneKeys: string[] = [],
): Promise<string> {
  const blocks: string[] = [];
  const regionText = regionsLabel(regionKeys, zoneKeys);
  const moodText = moodLabel(moodKey);
  const story = await fetchGroqAiStory(steps, byId, moodKey);

  blocks.push(`[ 오늘 데이트 코스 ]\n${regionText} · ${moodText}\n\n✨ AI 브리핑: "${story}"`);

  const filled = steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);
  
  // 병렬로 단축 URL 생성
  const mapUrls = await Promise.all(
    filled.map(async (step) => {
      const spot = byId.get(step.spotId);
      if (!spot) return '';
      // 네이버 공식 링크가 있으면 최우선, 없으면 인코딩 검색 URL 생성
      const rawUrl = naverMapUrl(spot);
      return await shortenUrl(rawUrl);
    })
  );

  for (let i = 0; i < filled.length; i++) {
    const step = filled[i];
    const spot = byId.get(step.spotId);
    if (!spot) continue;
    const meta = SLOT_META[step.slot];
    const summary = getCleanSpotSummary(spot);
    const shortMapUrl = mapUrls[i] || naverMapUrl(spot);

    const lines: string[] = [];
    lines.push(`${meta.emoji} ${meta.label} · ${spot.name}`);
    lines.push(`• 위치: ${spot.address || spot.location}`);
    lines.push(`• 소개: ${summary}`);
    lines.push(`• 지도: ${shortMapUrl}`);
    if (spot.social_links?.youtube?.url) {
      const shortYt = await shortenUrl(spot.social_links.youtube.url);
      lines.push(`• 영상: ${shortYt}`);
    }
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

// --- 내 위치 중심 맞춤 추천 코스 ---------------------------------------------

let userCoords: { lat: number; lng: number } | null = null;

/**
 * 내 위치 중심 / 실시간 추천 코스 생성 (날짜 제거, 위치 우선)
 */
function buildNearbyCourse(coords: { lat: number; lng: number } | null): { label: string; steps: CourseStep[] } {
  let pool = spots;
  let label = '✨ 지금 가기 좋은 맞춤 코스';

  if (coords && coords.lat && coords.lng) {
    const spotsWithDist = spots
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({ spot: s, dist: getDistanceKm(coords.lat, coords.lng, s.lat!, s.lng!) }))
      .sort((a, b) => a.dist - b.dist);

    if (spotsWithDist.length >= 10) {
      pool = spotsWithDist.slice(0, 35).map((item) => item.spot);
      const nearestDist = Math.round(spotsWithDist[0].dist * 10) / 10;
      label = `📍 내 주변 추천 코스 (${nearestDist}km 이내)`;
    }
  }

  const steps = generateCourse(pool, ['day', 'evening', 'night'], [], 'ALL');
  return { label, steps };
}

// --- URL 링크 공유 (코스 = 스폿 ID 배열 → 해시 인코딩) -----------------------------

/** 현재 코스의 공유 URL — 배포 base는 location 기반 동적 생성 (로컬에서도 동작) */
function buildShareUrl(spotIds: number[]): string {
  return `${location.origin}${location.pathname}${location.search}#c=${spotIds.join('.')}`;
}

/** hash에서 공유 코스 ID 배열 파싱. `#c=` 형태가 아니면 null */
function parseCourseHash(hash: string): number[] | null {
  const match = hash.match(/^#c=([0-9.]+)$/);
  if (!match) return null;
  return match[1]
    .split('.')
    .map((part) => Number(part))
    .filter((n) => Number.isInteger(n) && n > 0);
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

interface AppState {
  slots: Record<SlotKey, boolean>;
  /** 선택된 지역 키 다중 선택 — 빈 배열이면 '전체' */
  regions: string[];
  /** 선택된 세부 인기 데이트존 키 다중 선택 — 빈 배열이면 '제한 없음' */
  subZones: string[];
  mood: string;
  course: CourseStep[] | null;
  /** 코스 생성 시점의 조건 스냅샷 — 교체 후보·저장·복사가 이 조건 기준으로 동작 */
  courseConditions: { regions: string[]; subZones: string[]; mood: string } | null;
  savedOpen: boolean;
}

/** 현재 시각 기준 최적의 기본 시간대 슬롯 반환 (15시 기준 낮 자동 제외) */
function getDefaultSlots(): Record<SlotKey, boolean> {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 15) {
    // 05:00 ~ 14:59: 낮 + 저녁
    return { day: true, evening: true, night: false, stay: false };
  } else if (hour >= 15 && hour < 20) {
    // 15:00 ~ 19:59: 저녁 + 밤 (낮 제외)
    return { day: false, evening: true, night: true, stay: false };
  } else {
    // 20:00 ~ 04:59: 밤 + 숙박 (낮/저녁 제외)
    return { day: false, evening: false, night: true, stay: true };
  }
}

/** GPS 위·경도 좌표 기반 대한민국 권역 자동 판정 */
function detectRegionFromCoords(lat: number, lng: number): string {
  // 제주도
  if (lat < 34.0) return 'JEJU';
  // 서울
  if (lat >= 37.42 && lat <= 37.71 && lng >= 126.76 && lng <= 127.18) return 'SEOUL';
  // 경기·인천
  if (lat >= 36.8 && lat <= 38.3 && lng >= 126.3 && lng <= 127.8) return 'GYEONGGI';
  // 강원
  if (lng > 127.8 && lat > 37.0) return 'GANGWON';
  // 호남
  if (lat < 36.1 && lng <= 127.8) return 'HONAM';
  // 영남
  if (lat < 37.1 && lng > 127.8) return 'YEONGNAM';
  // 충청
  if (lat >= 36.0 && lat <= 37.2) return 'CHUNGCHEONG';

  return 'SEOUL';
}

const state: AppState = {
  slots: getDefaultSlots(),
  regions: ['SEOUL'],
  subZones: [],
  mood: 'ALL',
  course: null,
  courseConditions: null,
  savedOpen: false,
};

let spotById = new Map<number, Spot>(spots.filter((s) => typeof s.id === 'number').map((s) => [s.id, s]));

function activeSlots(): SlotKey[] {
  return SLOT_ORDER.filter((k) => state.slots[k]);
}

declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v0.7.0';

function courseSpotIds(): number[] {
  if (!state.course) return [];
  return state.course.filter((st) => st.spotId !== null).map((st) => st.spotId as number);
}

// ---------------------------------------------------------------------------
// localStorage — 저장한 코스 · 최근 노출 이력
// ---------------------------------------------------------------------------

function loadSavedCourses(): SavedCourse[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as SavedCourse[]) : [];
  } catch {
    return [];
  }
}

function persistSavedCourses(list: SavedCourse[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** 최근 노출 스폿 ID 이력 (오래된 순 → 최신 순, 최대 RECENT_MAX개 FIFO) */
function loadRecentSpotIds(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

/** 노출된 스폿을 이력 맨 뒤에 추가 (중복은 최신 위치로 이동), RECENT_MAX 초과분은 앞에서 제거 */
function addRecentSpotIds(ids: number[]): void {
  if (ids.length === 0) return;
  const merged = [...loadRecentSpotIds().filter((id) => !ids.includes(id)), ...ids];
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(merged.slice(-RECENT_MAX)));
  } catch {
    // 저장 실패(용량 등)는 무시 — 보정 기능은 있으면 좋고 없어도 동작
  }
}

function recentSpotIdSet(): ReadonlySet<number> {
  return new Set(loadRecentSpotIds());
}

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let toastTimer: number | null = null;

function showToast(msg: string): void {
  let toast = document.querySelector('.toast-msg') as HTMLElement | null;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');

  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toast?.classList.remove('show');
    toastTimer = null;
  }, 2200);
}

// ---------------------------------------------------------------------------
// 렌더 — 영역별 분할 (앱 셸은 1회, 오늘의코스/조건/결과/오버레이는 개별 재렌더)
// ---------------------------------------------------------------------------

const app = document.getElementById('app')!;

function renderShell(): void {
  app.innerHTML = `
    <header class="topbar">
      <h1 class="app-title"><a href="#" class="app-title-link" id="brand-home-link" title="홈으로 이동">오늘 데이트</a></h1>
      <button class="btn-saved" id="btn-open-saved">저장한 코스</button>
    </header>
    <section class="today-course-area" id="today-area"></section>
    <section class="conditions" id="conditions-area"></section>
    <section class="results" id="results-area"></section>
    <footer class="app-footer">
      <p class="footer-copy">오늘 데이트 <span class="footer-version">${APP_VERSION}</span></p>
      <p class="footer-sub">조건만 고르면 완성되는 시간대별 데이트 코스</p>
    </footer>
    <div class="overlay-root" id="overlay-root"></div>
  `;
  document.getElementById('brand-home-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearCourseHash();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('btn-open-saved')!.addEventListener('click', () => {
    state.savedOpen = true;
    renderOverlay();
  });
  renderTodayCourse();
  renderConditions();
  renderResults();
  renderOverlay();
}

// --- 오늘의 코스 (S1) -----------------------------------------------------------

function renderTodayCourse(): void {
  const area = document.getElementById('today-area');
  if (!area) return;
  const initial = buildNearbyCourse(userCoords);
  const filled = initial.steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);

  if (filled.length === 0) {
    area.innerHTML = '';
    return;
  }

  area.innerHTML = `
    <button class="today-course" id="btn-today-course" aria-label="내 주변 맞춤 코스 불러오기">
      <span class="today-course-label">${initial.label}</span>
      <span class="today-course-arrow" aria-hidden="true">→</span>
    </button>
  `;

  const btn = document.getElementById('btn-today-course');
  if (!btn) return;

  function applyCourse(steps: CourseStep[], customLabel?: string) {
    state.slots = { day: true, evening: true, night: true, stay: false };
    state.regions = [];
    state.subZones = [];
    state.mood = 'ALL';
    state.course = steps.map((st) => ({ ...st }));
    state.courseConditions = { regions: [], subZones: [], mood: 'ALL' };

    // 버튼 라벨을 원래의 맞춤/주변 추천 문구로 복원
    const labelSpan = btn?.querySelector('.today-course-label');
    if (labelSpan) {
      labelSpan.textContent = customLabel || buildNearbyCourse(userCoords).label;
    }

    renderConditions();
    renderResults();
  }

  btn.addEventListener('click', () => {
    if (!userCoords && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      const labelSpan = btn.querySelector('.today-course-label');
      if (labelSpan) labelSpan.textContent = '📍 내 위치 찾는 중...';

      let resolved = false;

      // 2.5초 자체 안전 타이머: 브라우저 GPS 무응답/지연 시 즉시 기본 코스로 안전 전환
      const timer = window.setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const fallback = buildNearbyCourse(null);
          applyCourse(fallback.steps, fallback.label);
        }
      }, 2500);

      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(timer);
            userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const nearby = buildNearbyCourse(userCoords);
            applyCourse(nearby.steps, nearby.label);
          },
          () => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(timer);
            const fallback = buildNearbyCourse(null);
            applyCourse(fallback.steps, fallback.label);
          },
          { timeout: 2500, maximumAge: 600000, enableHighAccuracy: false },
        );
      } catch {
        if (!resolved) {
          resolved = true;
          window.clearTimeout(timer);
          const fallback = buildNearbyCourse(null);
          applyCourse(fallback.steps, fallback.label);
        }
      }
    } else {
      const res = buildNearbyCourse(userCoords);
      applyCourse(res.steps, res.label);
    }
  });
}

// --- 조건 영역 -------------------------------------------------------------

function renderConditions(): void {
  const area = document.getElementById('conditions-area');
  if (!area) return;

  // 특정 지역이 선택되었을 때만 해당 지역의 세부 인기 데이트존 노출 (전체일 때는 서브존 행 숨김)
  const activeZones =
    state.regions.length > 0
      ? POPULAR_ZONES.filter((z) => state.regions.includes(z.regionKey))
      : [];

  area.innerHTML = `
    <div class="slot-toggles" role="group" aria-label="시간대 선택">
      ${SLOT_ORDER.map((k) => {
        const meta = SLOT_META[k];
        return `
          <button class="slot-toggle ${state.slots[k] ? 'on' : ''}" data-slot="${k}" aria-pressed="${state.slots[k]}">
            <span class="slot-emoji">${meta.emoji}</span>
            <span class="slot-label">${meta.label}</span>
          </button>`;
      }).join('')}
    </div>

    <div class="filter-row">
      <span class="filter-label">지역</span>
      <div class="pill-scroll" id="region-pills">
        ${REGIONS.map((r) => {
          const active = r.key === 'ALL' ? state.regions.length === 0 : state.regions.includes(r.key);
          return `<button class="pill ${active ? 'active' : ''}" data-region="${r.key}" aria-pressed="${active}">${r.label}</button>`;
        }).join('')}
      </div>
    </div>

    ${
      activeZones.length > 0
        ? `
    <div class="filter-row filter-row-subzone">
      <span class="filter-label">인기 데이트존</span>
      <div class="pill-scroll" id="zone-pills">
        ${activeZones
          .map((z) => {
            const active = state.subZones.includes(z.key);
            return `<button class="pill pill-subzone ${active ? 'active' : ''}" data-zone="${z.key}" aria-pressed="${active}">📍 ${escapeHtml(z.label)}</button>`;
          })
          .join('')}
      </div>
    </div>`
        : ''
    }

    <div class="filter-row">
      <span class="filter-label">분위기</span>
      <div class="pill-scroll" id="mood-pills">
        ${MOODS.map(
          (m) =>
            `<button class="pill ${state.mood === m.key ? 'active' : ''}" data-mood="${m.key}">${m.emoji ? `${m.emoji} ` : ''}${m.label}</button>`,
        ).join('')}
      </div>
    </div>

    <button class="btn-primary btn-generate" id="btn-generate">코스 만들기</button>
  `;
  bindConditionEvents(area);
}

function bindConditionEvents(area: HTMLElement): void {
  area.querySelectorAll<HTMLButtonElement>('.slot-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.slot as SlotKey;
      state.slots[slot] = !state.slots[slot];
      renderConditions();
    });
  });
  area.querySelectorAll<HTMLButtonElement>('#region-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.region || 'ALL';
      if (key === 'ALL') {
        // 전체: 모든 개별 선택 해제 및 서브존 초기화
        state.regions = [];
        state.subZones = [];
      } else {
        const next = new Set(state.regions);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        // REGIONS 정의 순서 유지 — 모두 끄면 빈 배열이 되어 자동으로 '전체' 복귀
        state.regions = REGIONS.filter((r) => next.has(r.key)).map((r) => r.key);
        // 비활성화된 권역의 subZone 정리
        if (state.regions.length > 0) {
          state.subZones = state.subZones.filter((zk) => {
            const z = POPULAR_ZONES.find((item) => item.key === zk);
            return z ? state.regions.includes(z.regionKey) : false;
          });
        } else {
          state.subZones = [];
        }
      }
      renderConditions();
    });
  });
  area.querySelectorAll<HTMLButtonElement>('#zone-pills .pill-subzone').forEach((btn) => {
    btn.addEventListener('click', () => {
      const zk = btn.dataset.zone;
      if (!zk) return;
      const next = new Set(state.subZones);
      if (next.has(zk)) next.delete(zk);
      else next.add(zk);
      state.subZones = Array.from(next);
      renderConditions();
    });
  });
  area.querySelectorAll<HTMLButtonElement>('#mood-pills .pill[data-mood]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mood = btn.dataset.mood || 'ALL';
      renderConditions();
    });
  });
  area.querySelector('#btn-generate')!.addEventListener('click', () => {
    const slotsOn = activeSlots();
    if (slotsOn.length === 0) {
      showToast('시간대를 하나 이상 선택해 주세요');
      return;
    }
    state.course = generateCourse(
      spots,
      slotsOn,
      state.regions,
      state.mood,
      { avoidIds: recentSpotIdSet() },
      state.subZones,
    );
    state.courseConditions = {
      regions: [...state.regions],
      subZones: [...state.subZones],
      mood: state.mood,
    };
    addRecentSpotIds(courseSpotIds());
    renderResults();
  });
}

// --- 결과 영역 -------------------------------------------------------------

const ICON_REFRESH_SVG = `<svg class="icon-refresh" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`;
const ICON_SWAP_SVG = `<svg class="icon-swap" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`;

function renderResults(): void {
  const area = document.getElementById('results-area');
  if (!area) return;
  if (!state.course || !state.courseConditions) {
    area.innerHTML = `
      <div class="results-empty">
        시간대와 조건을 고르고<br /><strong>코스 만들기</strong>를 눌러보세요
      </div>
    `;
    return;
  }

  const cond = state.courseConditions;
  const usedImages = new Set<string>();
  const cacheKey = `${cond.mood}_${courseSpotIds().join('-')}`;
  const hasCachedStory = aiStoryCache.has(cacheKey);

  let initialStoryHtml = '';
  if (hasCachedStory) {
    initialStoryHtml = `“${aiStoryCache.get(cacheKey)!}”`;
  } else if (GROQ_API_KEY) {
    initialStoryHtml = `<span class="ai-loading-pulse">두 사람만을 위한 맞춤 코스 브리핑을 작성하고 있어요...</span>`;
  } else {
    initialStoryHtml = `“${generateCourseStory(state.course, spotById, cond.mood, true)}”`;
  }

  area.innerHTML = `
    <div class="course-head">
      <span class="course-title">${escapeHtml(regionsLabel(cond.regions, cond.subZones))} · ${escapeHtml(moodLabel(cond.mood))}</span>
      <button class="btn-regenerate" id="btn-regenerate" aria-label="전체 다시 추천받기">
        ${ICON_REFRESH_SVG}
        <span class="btn-regenerate-text">전체 다시 추천</span>
      </button>
    </div>
    <div class="ai-briefing-card" id="ai-briefing-box">
      <div class="ai-briefing-badge">
        <span class="ai-sparkle-icon">✨</span>
        <span>AI 에디터 브리핑</span>
      </div>
      <p class="ai-briefing-text ${!hasCachedStory && GROQ_API_KEY ? 'is-loading' : ''}" id="ai-briefing-content">${initialStoryHtml}</p>
    </div>
    <div class="step-list">
      ${state.course.map((step, i) => renderStepCard(step, i, { usedImages })).join('')}
    </div>
    <div class="result-actions result-actions-3">
      <button class="btn-secondary" id="btn-copy">📋 복사</button>
      <button class="btn-secondary" id="btn-share-link">🔗 링크</button>
      <button class="btn-primary" id="btn-save">💾 저장</button>
    </div>
  `;
  bindResultEvents(area);

  // Groq LLM API 비동기 고도화 브리핑 (결과 도착 시 단 1회 최종 문장 렌더링)
  if (GROQ_API_KEY && !hasCachedStory && state.course) {
    const currentCourse = state.course;
    fetchGroqAiStory(currentCourse, spotById, cond.mood).then((aiText) => {
      const el = document.getElementById('ai-briefing-content');
      if (!el) return;
      const finalText = aiText || generateCourseStory(currentCourse, spotById, cond.mood, false);
      el.style.opacity = '0';
      setTimeout(() => {
        el.classList.remove('is-loading');
        el.innerHTML = `“${escapeHtml(finalText)}”`;
        el.style.opacity = '1';
      }, 100);
    });
  }
}

// Lucide SVG Icons — 모던하고 정갈한 미니멀 벡터 라인 아이콘 세트
const ICON_VERIFIED_CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-verified-check"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`;

const LUCIDE_ICONS = {
  coffee: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h12Z"/><path d="M6 2v2"/><path d="M17 8h1a4 4 0 1 1 0 8h-1"/></svg>`,
  utensils: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"/><path d="M15 2v19"/><path d="M5 2v5a3 3 0 0 0 3 3 3 3 0 0 0 3-3V2"/><path d="M8 2v19"/></svg>`,
  wine: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/></svg>`,
  bed: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/></svg>`,
  palette: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`,
  trees: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.4"/></svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  sunset: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`,
  moon: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
};

/** 장소의 카테고리/이름/슬롯 정보를 분석하여 가장 적절한 Lucide 아이콘 매핑 */
function getSpotFallbackIcon(spot: Spot, slot: SlotKey): string {
  const cat = (spot.category || '').toLowerCase();
  const name = (spot.name || '').toLowerCase();
  const summary = (spot.summary || '').toLowerCase();
  const combined = `${cat} ${name} ${summary}`;

  if (combined.includes('카페') || combined.includes('커피') || combined.includes('디저트') || combined.includes('베이커리') || combined.includes('tea') || combined.includes('cafe')) {
    return LUCIDE_ICONS.coffee;
  }
  if (combined.includes('바') || combined.includes('와인') || combined.includes('칵테일') || combined.includes('주점') || combined.includes('펍') || combined.includes('beer') || combined.includes('wine')) {
    return LUCIDE_ICONS.wine;
  }
  if (combined.includes('호텔') || combined.includes('숙박') || combined.includes('펜션') || combined.includes('리조트') || combined.includes('스테이') || slot === 'stay') {
    return LUCIDE_ICONS.bed;
  }
  if (combined.includes('미술관') || combined.includes('전시') || combined.includes('박물관') || combined.includes('갤러리') || combined.includes('공연') || combined.includes('영화') || combined.includes('공방') || combined.includes('체험')) {
    return LUCIDE_ICONS.palette;
  }
  if (combined.includes('공원') || combined.includes('산책') || combined.includes('자연') || combined.includes('전망') || combined.includes('뷰') || combined.includes('숲') || combined.includes('호수') || combined.includes('해변')) {
    return LUCIDE_ICONS.trees;
  }
  if (combined.includes('식당') || combined.includes('맛집') || combined.includes('다이닝') || combined.includes('양식') || combined.includes('한식') || combined.includes('일식') || combined.includes('중식') || combined.includes('고기') || combined.includes('레스토랑') || combined.includes('파스타')) {
    return LUCIDE_ICONS.utensils;
  }
  
  // 슬롯별 기본 아이콘
  if (slot === 'day') return LUCIDE_ICONS.sun;
  if (slot === 'evening') return LUCIDE_ICONS.sunset;
  if (slot === 'night') return LUCIDE_ICONS.moon;
  if (slot === 'stay') return LUCIDE_ICONS.bed;
  return LUCIDE_ICONS.sparkles;
}

// 카테고리별 고화질 감성 큐레이션 이미지 풀 (각 카테고리별 8~10장 엄선 Unsplash 에디토리얼)
const CURATED_CATEGORY_IMAGES: Record<string, string[]> = {
  cafe: [
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=500&q=80&auto=format&fit=crop', // 브루잉 커피
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=500&q=80&auto=format&fit=crop', // 따뜻한 카페 인테리어
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&q=80&auto=format&fit=crop', // 디저트와 라떼
    'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=500&q=80&auto=format&fit=crop', // 감성 테라스 카페
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&q=80&auto=format&fit=crop', // 베이커리 크루아상
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&q=80&auto=format&fit=crop', // 앤티크 찻잔 & 드립
    'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=500&q=80&auto=format&fit=crop', // 모던 미니멀 카페
    'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=500&q=80&auto=format&fit=crop', // 에스프레소 바
  ],
  dining: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500&q=80&auto=format&fit=crop', // 분위기 있는 다이닝
    'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&q=80&auto=format&fit=crop', // 스테이크 플레이팅
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&q=80&auto=format&fit=crop', // 캔들라이트 디너 테이블
    'https://images.unsplash.com/photo-1579027989536-b7b1f875659b?w=500&q=80&auto=format&fit=crop', // 파스타 & 와인
    'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=500&q=80&auto=format&fit=crop', // 모던 비스트로
    'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=500&q=80&auto=format&fit=crop', // 파인다이닝 코스요리
    'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=500&q=80&auto=format&fit=crop', // 감성 브런치 테이블
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&q=80&auto=format&fit=crop', // 고급 요리 플레이팅
  ],
  bar: [
    'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=500&q=80&auto=format&fit=crop', // 레드와인 글라스
    'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=500&q=80&auto=format&fit=crop', // 칵테일 바 카운터
    'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=500&q=80&auto=format&fit=crop', // 재즈바 무드
    'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=500&q=80&auto=format&fit=crop', // 루프탑 샴페인
    'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=500&q=80&auto=format&fit=crop', // 위스키 온더락
    'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&q=80&auto=format&fit=crop', // 네온 바 칵테일
    'https://images.unsplash.com/photo-1560512823-829485b8bf24?w=500&q=80&auto=format&fit=crop', // 샴페인 토스트
    'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?w=500&q=80&auto=format&fit=crop', // 무드 펍 테라스
  ],
  stay: [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500&q=80&auto=format&fit=crop', // 부티크 호텔
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=500&q=80&auto=format&fit=crop', // 아늑한 스테이 룸
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=500&q=80&auto=format&fit=crop', // 리조트 인테리어
    'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=500&q=80&auto=format&fit=crop', // 감성 한옥 스테이
    'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=500&q=80&auto=format&fit=crop', // 모던 호텔 베드
    'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=500&q=80&auto=format&fit=crop', // 숲속 프라이빗 빌라
    'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=500&q=80&auto=format&fit=crop', // 미니멀 침실 무드
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=500&q=80&auto=format&fit=crop', // 오션뷰 테라스 호텔
  ],
  culture: [
    'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=500&q=80&auto=format&fit=crop', // 모던 갤러리
    'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=500&q=80&auto=format&fit=crop', // 미술관 전시 감상
    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=500&q=80&auto=format&fit=crop', // 아트 스페이스
    'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=500&q=80&auto=format&fit=crop', // 도자기 공방 & 작업실
    'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=500&q=80&auto=format&fit=crop', // 페인팅 아뜰리에
    'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&q=80&auto=format&fit=crop', // 클래식 콘서트 홀
  ],
  nature: [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80&auto=format&fit=crop', // 노을 해변 산책
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=500&q=80&auto=format&fit=crop', // 푸른 숲길 공원
    'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=500&q=80&auto=format&fit=crop', // 로맨틱 도시 야경
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=500&q=80&auto=format&fit=crop', // 숲속 햇살 산책로
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&q=80&auto=format&fit=crop', // 호수 풍경 & 힐링
    'https://images.unsplash.com/photo-1499346030926-9a72daac6c63?w=500&q=80&auto=format&fit=crop', // 노을빛 스카이라인
  ],
};

/** 이미지 URL 사전 유효성 검사 */
function isValidImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  if (trimmed.length < 10) return false;
  return true;
}

/**
 * 장소의 고화질 이미지 결정 (코스 내 중복 방지 usedImages 세트 지원)
 */
function getSpotImageUrl(spot: Spot, slot: SlotKey, usedImages?: Set<string>): string {
  // 1. 기존 DB image_url이 유효하고, 네이버 차단 도메인(pstatic.net)이 아닌 경우
  if (isValidImageUrl(spot.image_url)) {
    const raw = spot.image_url!.trim();
    if (!raw.includes('pstatic.net')) {
      if (!usedImages || !usedImages.has(raw)) {
        usedImages?.add(raw);
        return raw;
      }
    }
  }

  // 2. 카테고리/슬롯 기반 큐레이션 풀 선택
  const cat = (spot.category || '').toLowerCase();
  const name = (spot.name || '').toLowerCase();
  const summary = (spot.summary || '').toLowerCase();
  const combined = `${cat} ${name} ${summary}`;

  let pool = CURATED_CATEGORY_IMAGES.cafe;
  if (combined.includes('바') || combined.includes('와인') || combined.includes('칵테일') || combined.includes('주점') || combined.includes('펍')) {
    pool = CURATED_CATEGORY_IMAGES.bar;
  } else if (combined.includes('호텔') || combined.includes('숙박') || combined.includes('펜션') || combined.includes('리조트') || slot === 'stay') {
    pool = CURATED_CATEGORY_IMAGES.stay;
  } else if (combined.includes('미술관') || combined.includes('전시') || combined.includes('박물관') || combined.includes('갤러리') || combined.includes('공방') || combined.includes('문화')) {
    pool = CURATED_CATEGORY_IMAGES.culture;
  } else if (combined.includes('공원') || combined.includes('산책') || combined.includes('자연') || combined.includes('전망') || combined.includes('뷰') || combined.includes('숲')) {
    pool = CURATED_CATEGORY_IMAGES.nature;
  } else if (combined.includes('식당') || combined.includes('맛집') || combined.includes('다이닝') || combined.includes('고기') || combined.includes('레스토랑') || combined.includes('파스타') || slot === 'evening') {
    pool = CURATED_CATEGORY_IMAGES.dining;
  }

  const hash = Math.abs(spot.id || spot.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));
  const baseIdx = hash % pool.length;

  // 코스 내 중복 방지: 이미 쓰인 이미지면 풀 내에서 안 쓰인 다음 이미지 탐색
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(baseIdx + i) % pool.length];
    if (!usedImages || !usedImages.has(candidate)) {
      usedImages?.add(candidate);
      return candidate;
    }
  }

  // 모든 이미지가 이미 쓰였으면 기본 해시 이미지 반환
  const fallbackUrl = pool[baseIdx];
  usedImages?.add(fallbackUrl);
  return fallbackUrl;
}

function renderStepCard(
  step: CourseStep,
  index: number,
  opts: { swappable?: boolean; usedImages?: Set<string> } = {},
): string {
  const swappable = opts.swappable !== false;
  const meta = SLOT_META[step.slot];
  if (step.spotId === null) {
    return `
      <article class="step-card empty">
        <div class="step-card-head">
          <div class="step-slot">${meta.emoji} ${meta.label}</div>
        </div>
        <p class="step-empty-msg">이 조건에 맞는 장소를 찾지 못했어요</p>
      </article>
    `;
  }
  const spot = spotById.get(step.spotId);
  if (!spot) {
    return `
      <article class="step-card empty">
        <div class="step-card-head">
          <div class="step-slot">${meta.emoji} ${meta.label}</div>
        </div>
        <p class="step-empty-msg">장소 정보를 불러올 수 없어요</p>
      </article>
    `;
  }
  const moodTags = moodTagLabels(spot);
  const themeParts: string[] = [];
  if (spot.category) themeParts.push(spot.category);
  if (moodTags.length > 0) themeParts.push(...moodTags);
  const themeText = themeParts.slice(0, 3).join(', ');

  const fallbackIcon = getSpotFallbackIcon(spot, step.slot);
  const targetImgUrl = getSpotImageUrl(spot, step.slot, opts.usedImages);

  const thumbHtml = `
    <div class="step-thumb-col">
      <div class="step-fallback-box">${fallbackIcon}</div>
      <img class="step-thumb-img" src="${escapeHtml(targetImgUrl)}" alt="${escapeHtml(spot.name)}" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('is-loaded');" onerror="this.classList.add('is-hidden'); this.previousElementSibling?.classList.add('is-active');" />
    </div>`;

  return `
    <article class="step-card has-image">
      <div class="step-card-head">
        <div class="step-slot">${meta.emoji} ${meta.label}</div>
        ${themeText ? `<span class="step-slot-theme">${escapeHtml(themeText)}</span>` : ''}
      </div>
      <div class="step-card-split">
        ${thumbHtml}
        <div class="step-content-col">
          <h3 class="step-name">
            <span>${escapeHtml(spot.name)}</span>
            ${spot.verified ? `<span class="icon-verified-badge" title="에디터가 직접 검증한 데이트 장소예요 ✨" aria-label="검증된 데이트 장소">${ICON_VERIFIED_CHECK_SVG}</span>` : ''}
          </h3>
          <p class="step-location">📍 ${escapeHtml(spot.location)}</p>
          ${spot.summary ? `<blockquote class="step-quote">“${escapeHtml(spot.summary)}”</blockquote>` : ''}
          ${spot.price ? `<p class="step-price">${escapeHtml(spot.price)}</p>` : ''}
        </div>
      </div>
      <div class="step-actions-bar">
        ${swappable ? `<button class="btn-swap btn-swap-chip" data-step-index="${index}" aria-label="${meta.label} 장소 변경" title="이 장소만 다시 추천받기">${ICON_SWAP_SVG}<span>다른 장소</span></button>` : ''}
        ${(() => {
          const yt = spot.social_links?.youtube;
          if (!yt?.url) return '';
          const views = yt.views || 0;
          if (views >= 10000) {
            return `<a class="step-social-chip yt-chip" href="${escapeHtml(yt.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(yt.title || '유튜브 핫클립')}">▶ 핫클립 (${formatViews(views)})</a>`;
          }
          if (views >= 3000) {
            return `<a class="step-social-chip yt-chip yt-review" href="${escapeHtml(yt.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(yt.title || '유튜브 영상')}">▶ 영상리뷰 (${formatViews(views)})</a>`;
          }
          return '';
        })()}
        ${spot.social_links?.kakaomap?.rating ? `<a class="step-social-chip kakao-chip" href="${escapeHtml(spot.social_links.kakaomap.url || '')}" target="_blank" rel="noopener noreferrer" title="카카오맵 리뷰 보기">★ ${spot.social_links.kakaomap.rating}</a>` : ''}
        <a class="step-map-chip" href="${naverMapUrl(spot)}" target="_blank" rel="noopener noreferrer">지도 보기 ↗</a>
      </div>
    </article>
  `;
}

function bindSwapButton(btn: HTMLButtonElement): void {
  btn.addEventListener('click', () => {
    btn.classList.add('is-spinning');
    setTimeout(() => {
      swapStep(Number(btn.dataset.stepIndex));
    }, 150);
  });
}

/**
 * 스텝 하나를 조건 스냅샷 내 후보에서 랜덤 교체 (현재 코스 스폿·자기 자신 제외).
 * 다른 스텝들의 최빈 area 기준 ① 같은 area → ② 권역 전체 폴백으로 근접 선택.
 * 최근 노출 이력은 소프트 제외 (제외 후 0건이면 이력 무시).
 * 전체 renderResults 대신 해당 카드만 DOM 교체 + swap-in 트랜지션 적용.
 */
function swapStep(index: number): void {
  if (!state.course || !state.courseConditions) return;
  const step = state.course[index];
  if (!step) return;
  const cond = state.courseConditions;
  const candidates = excludeRecent(
    getCandidates(spots, step.slot, cond.regions, cond.mood, courseSpotIds(), cond.subZones),
    recentSpotIdSet(),
  );
  const anchor = dominantAnchorSpot(state.course, spotById, index);
  const chosen = pickNearRandom(candidates, anchor);
  if (!chosen) {
    showToast('이 조건에 다른 추천 장소가 없어요');
    return;
  }
  state.course[index] = { slot: step.slot, spotId: chosen.id };
  addRecentSpotIds([chosen.id]);

  // 대상 카드만 부드럽게 swap-in 교체 (현재 코스의 다른 카드들이 쓰고 있는 이미지 Set 수집하여 중복 방지)
  const usedImages = new Set<string>();
  state.course.forEach((st, idx) => {
    if (idx !== index && st.spotId !== null) {
      const otherSpot = spotById.get(st.spotId);
      if (otherSpot) {
        usedImages.add(getSpotImageUrl(otherSpot, st.slot));
      }
    }
  });

  const cardList = document.querySelectorAll<HTMLElement>('.step-list > .step-card');
  const targetCard = cardList[index];
  if (!targetCard) {
    renderResults();
    return;
  }

  const temp = document.createElement('div');
  temp.innerHTML = renderStepCard(state.course[index], index, { usedImages });
  const newCard = temp.firstElementChild as HTMLElement | null;
  if (!newCard) {
    renderResults();
    return;
  }

  newCard.classList.add('swap-in');
  targetCard.replaceWith(newCard);

  const newSwapBtn = newCard.querySelector<HTMLButtonElement>('.btn-swap');
  if (newSwapBtn) {
    bindSwapButton(newSwapBtn);
  }

  // 장소 변경 시 AI 브리핑 텍스트도 실시간 자동 갱신
  const briefingEl = document.getElementById('ai-briefing-content');
  if (briefingEl && state.courseConditions) {
    const mood = state.courseConditions.mood;
    const cacheKey = `${mood}_${courseSpotIds().join('-')}`;
    if (aiStoryCache.has(cacheKey)) {
      briefingEl.innerHTML = `“${aiStoryCache.get(cacheKey)!}”`;
      briefingEl.classList.remove('is-loading');
    } else if (GROQ_API_KEY && state.course) {
      const currentCourse = state.course;
      briefingEl.classList.add('is-loading');
      briefingEl.innerHTML = `<span class="ai-loading-pulse">새로운 코스에 맞춰 브리핑을 작성하고 있어요...</span>`;
      fetchGroqAiStory(currentCourse, spotById, mood).then((aiText) => {
        const el = document.getElementById('ai-briefing-content');
        if (!el) return;
        const finalText = aiText || generateCourseStory(currentCourse, spotById, mood, false);
        el.style.opacity = '0';
        setTimeout(() => {
          el.classList.remove('is-loading');
          el.innerHTML = `“${escapeHtml(finalText)}”`;
          el.style.opacity = '1';
        }, 100);
      });
    } else if (state.course) {
      briefingEl.innerHTML = `“${generateCourseStory(state.course, spotById, mood, true)}”`;
      briefingEl.classList.remove('is-loading');
    }
  }
}

/** 동일 조건 스냅샷으로 모든 스텝 재생성 (체감 랜덤 보정 적용) */
function regenerateCourse(): void {
  if (!state.course || !state.courseConditions) return;
  const cond = state.courseConditions;
  const slotsOn = state.course.map((st) => st.slot);
  state.course = generateCourse(
    spots,
    slotsOn,
    cond.regions,
    cond.mood,
    { avoidIds: recentSpotIdSet() },
    cond.subZones,
  );
  addRecentSpotIds(courseSpotIds());
  renderResults();
}

function bindResultEvents(area: HTMLElement): void {
  area.querySelectorAll<HTMLButtonElement>('.btn-swap').forEach((btn) => {
    bindSwapButton(btn);
  });
  area.querySelector('#btn-regenerate')?.addEventListener('click', function (this: HTMLButtonElement) {
    this.classList.add('is-spinning');
    setTimeout(() => {
      regenerateCourse();
    }, 150);
  });
  area.querySelector('#btn-copy')?.addEventListener('click', async () => {
    if (!state.course || !state.courseConditions) return;
    try {
      const text = await formatCourseTextAsync(
        state.course,
        spotById,
        state.courseConditions.regions,
        state.courseConditions.mood,
        state.courseConditions.subZones,
      );
      await navigator.clipboard.writeText(text);
      showToast('📋 코스가 복사되었어요');
    } catch {
      showToast('복사하지 못했어요');
    }
  });
  area.querySelector('#btn-share-link')?.addEventListener('click', () => {
    const ids = courseSpotIds();
    if (ids.length === 0) {
      showToast('공유할 장소가 없어요');
      return;
    }
    navigator.clipboard
      .writeText(buildShareUrl(ids))
      .then(() => showToast('🔗 공유 링크가 복사되었어요'))
      .catch(() => showToast('복사하지 못했어요'));
  });
  area.querySelector('#btn-save')?.addEventListener('click', () => {
    if (!state.course || !state.courseConditions) return;
    const ids = courseSpotIds();
    if (ids.length === 0) {
      showToast('저장할 장소가 없어요');
      return;
    }
    const list = loadSavedCourses();
    const item: SavedCourse = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      conditions: {
        region: [...state.courseConditions.regions],
        subZones: [...state.courseConditions.subZones],
        mood: state.courseConditions.mood,
        slots: state.course.map((st) => st.slot),
      },
      spotIds: ids,
    };
    list.unshift(item);
    persistSavedCourses(list);
    showToast('💾 코스를 저장했어요');
  });
}

// --- 수신자 뷰 (S5 — 링크로 열었을 때) ---------------------------------------------

/** 공유 ID 배열 → 스텝 목록 (존재하지 않는 스폿·slot 없는 스폿은 건너뜀, 슬롯 순 정렬) */
function buildSharedSteps(ids: number[]): CourseStep[] {
  const steps: CourseStep[] = [];
  for (const id of ids) {
    const spot = spotById.get(id);
    if (spot && isValidSlot(spot.slot)) {
      steps.push({ slot: spot.slot, spotId: id });
    }
  }
  steps.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  return steps;
}

/** URL에서 코스 hash 제거 (히스토리 오염 없이) */
function clearCourseHash(): void {
  history.replaceState(null, '', location.pathname + location.search);
}

/** 조건 영역·오늘의코스·교체 없이 코스 카드만 + [나도 코스 만들기] CTA 하나 */
function renderReceiverView(steps: CourseStep[]): void {
  const usedImages = new Set<string>();
  const storyHtml = generateCourseStory(steps, spotById, 'ALL', true);

  app.innerHTML = `
    <header class="topbar">
      <h1 class="app-title"><a href="#" class="app-title-link" id="receiver-home-link" title="홈으로 이동">오늘 데이트</a></h1>
    </header>
    <section class="receiver-view">
      <p class="receiver-title">✨ 친구가 보낸 데이트 코스</p>
      <div class="ai-briefing-card">
        <div class="ai-briefing-badge">
          <span class="ai-sparkle-icon">✨</span>
          <span>AI 에디터 브리핑</span>
        </div>
        <p class="ai-briefing-text">“${storyHtml}”</p>
      </div>
      <div class="step-list">
        ${steps.map((step, i) => renderStepCard(step, i, { swappable: false, usedImages })).join('')}
      </div>
      <button class="btn-primary btn-make-own" id="btn-make-own">나만의 코스 만들기 →</button>
    </section>
    <footer class="app-footer">
      <p class="footer-copy">오늘 데이트 <span class="footer-version">${APP_VERSION}</span></p>
      <p class="footer-sub">조건만 고르면 완성되는 시간대별 데이트 코스</p>
    </footer>
  `;
  const goHome = (e: Event) => {
    e.preventDefault();
    clearCourseHash();
    renderShell();
  };
  document.getElementById('receiver-home-link')?.addEventListener('click', goHome);
  document.getElementById('btn-make-own')?.addEventListener('click', goHome);
}

// --- 저장한 코스 오버레이 ------------------------------------------------------

function savedCourseSpotsHtml(item: SavedCourse): string {
  const steps = item.spotIds
    .map((id) => {
      const spot = spotById.get(id);
      if (!spot) return null;
      return { spot, slot: spot.slot };
    })
    .filter((entry): entry is { spot: Spot; slot: SlotKey | null } => entry !== null);

  if (steps.length === 0) {
    return `<span class="saved-spots-empty">(장소 정보 없음)</span>`;
  }

  return `
    <div class="saved-step-flow">
      ${steps
        .map((entry) => {
          const emoji = entry.slot && SLOT_META[entry.slot] ? SLOT_META[entry.slot].emoji : '📍';
          return `
            <span class="saved-step-chip">
              <span class="saved-step-emoji">${emoji}</span>
              <span class="saved-step-name">${escapeHtml(entry.spot.name)}</span>
            </span>
          `;
        })
        .join('<span class="saved-step-sep" aria-hidden="true">›</span>')}
    </div>
  `;
}

let isClosingOverlay = false;

function closeOverlay(callback?: () => void): void {
  if (isClosingOverlay || !state.savedOpen) return;
  const root = document.getElementById('overlay-root');
  if (!root) return;
  const backdrop = root.querySelector('.overlay-backdrop');
  const panel = root.querySelector('.overlay-panel');
  if (!backdrop || !panel) {
    state.savedOpen = false;
    renderOverlay();
    callback?.();
    return;
  }
  isClosingOverlay = true;
  backdrop.classList.add('is-closing');
  panel.classList.add('is-closing');
  window.setTimeout(() => {
    state.savedOpen = false;
    isClosingOverlay = false;
    renderOverlay();
    callback?.();
  }, 220);
}

function renderOverlay(): void {
  const root = document.getElementById('overlay-root');
  if (!root) return;
  if (!state.savedOpen) {
    root.innerHTML = '';
    return;
  }
  const list = loadSavedCourses();
  root.innerHTML = `
    <div class="overlay-backdrop" id="overlay-backdrop"></div>
    <div class="overlay-panel" role="dialog" aria-label="저장한 코스">
      <div class="overlay-head">
        <span class="overlay-title">저장한 코스 <span class="overlay-count">${list.length}</span></span>
        <button class="overlay-close" id="overlay-close" aria-label="닫기">✕</button>
      </div>
      <div class="overlay-body">
        ${
          list.length === 0
            ? `<div class="overlay-empty">아직 저장한 코스가 없어요</div>`
            : list
                .map((item) => {
                  const date = new Date(item.createdAt);
                  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
                  return `
              <div class="saved-item">
                <button class="saved-item-main" data-course-id="${escapeHtml(item.id)}">
                  <span class="saved-item-meta">${dateStr} · ${escapeHtml(regionsLabel(normalizeRegionCond(item.conditions.region)))} · ${escapeHtml(moodLabel(item.conditions.mood))}</span>
                  <div class="saved-item-spots">${savedCourseSpotsHtml(item)}</div>
                </button>
                <button class="saved-item-delete" data-delete-id="${escapeHtml(item.id)}" aria-label="삭제">🗑</button>
              </div>`;
                })
                .join('')
        }
      </div>
    </div>
  `;

  root.querySelector('#overlay-backdrop')!.addEventListener('click', () => closeOverlay());
  root.querySelector('#overlay-close')!.addEventListener('click', () => closeOverlay());

  root.querySelectorAll<HTMLButtonElement>('.saved-item-main').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = loadSavedCourses().find((c) => c.id === btn.dataset.courseId);
      if (!item) return;
      closeOverlay(() => {
        restoreCourse(item);
        showToast('코스를 불러왔어요');
      });
    });
  });
  root.querySelectorAll<HTMLButtonElement>('.saved-item-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = loadSavedCourses().filter((c) => c.id !== btn.dataset.deleteId);
      persistSavedCourses(next);
      renderOverlay();
      showToast('삭제했어요');
    });
  });
}

/** 저장한 코스를 결과 영역에 복원 (조건 상태도 함께 복원) */
function restoreCourse(item: SavedCourse): void {
  // spotId → 해당 스폿의 slot으로 스텝 재구성 (스폿 데이터가 사라진 ID는 건너뜀)
  const steps: CourseStep[] = [];
  for (const id of item.spotIds) {
    const spot = spotById.get(id);
    if (spot && isValidSlot(spot.slot)) {
      steps.push({ slot: spot.slot, spotId: id });
    }
  }
  steps.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

  // 하위호환: 과거 저장분은 region이 문자열 — 배열로 정규화해 복원
  const regions = normalizeRegionCond(item.conditions.region);
  const subZones = Array.isArray(item.conditions.subZones) ? item.conditions.subZones : [];
  state.regions = regions;
  state.subZones = subZones;
  state.mood = item.conditions.mood;
  for (const k of SLOT_ORDER) {
    state.slots[k] = item.conditions.slots.includes(k);
  }
  state.course = steps;
  state.courseConditions = {
    regions: [...regions],
    subZones: [...subZones],
    mood: item.conditions.mood,
  };

  renderConditions();
  renderResults();
}

// ---------------------------------------------------------------------------
// 시작 — hash에 공유 코스(#c=)가 있으면 수신자 뷰, 아니면 홈
// ---------------------------------------------------------------------------

function handleRoute(): void {
  const sharedIds = parseCourseHash(location.hash);
  if (sharedIds !== null) {
    const steps = buildSharedSteps(sharedIds);
    if (steps.length > 0) {
      renderReceiverView(steps);
      return;
    }
    // 전부 무효 ID → 안내 후 홈으로
    clearCourseHash();
    showToast('공유된 코스를 찾을 수 없어요');
  }
  renderShell();
}

async function init(): Promise<void> {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.savedOpen) {
      closeOverlay();
    }
  });

  window.addEventListener('hashchange', () => {
    handleRoute();
  });

  // 1. Supabase 실시간 DB를 먼저 로드하여 공유 링크의 spot ID가 정상 매핑되도록 보장
  try {
    const liveSpots = await loadSpots();
    if (liveSpots && liveSpots.length > 0) {
      spots = liveSpots;
      spotById = new Map(spots.filter((s) => typeof s.id === 'number').map((s) => [s.id, s]));
      console.log(`⚡ [Supabase Live] ${spots.length}개 스팟 로드 완료`);
    }
  } catch (err) {
    console.warn('초기 데이터 로드 오류:', err);
  }

  // 2. 라우팅 처리 (공유 링크 수신자 뷰 또는 홈 셸)
  handleRoute();

  // 3. 브라우저 위치(GPS) 기반 현재 지역 비동기 자동 선택 (기본값 'SEOUL'에서 실제 위치로 스마트 전환)
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const detected = detectRegionFromCoords(pos.coords.latitude, pos.coords.longitude);
        // 사용자가 아직 수동으로 다른 지역을 선택하지 않았을 때만 자동 갱신
        if (state.regions.length === 1 && state.regions[0] === 'SEOUL' && detected !== 'SEOUL') {
          state.regions = [detected];
          renderConditions();
          console.log(`📍 [GPS] 현재 위치 기반 지역 자동 선택: ${detected}`);
        }
      },
      () => {
        // 권한 거부 또는 타임아웃 시 기본값 'SEOUL' 유지
      },
      { timeout: 5000, maximumAge: 600000 },
    );
  }
}

init();
