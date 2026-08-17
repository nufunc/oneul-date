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
  { key: 'healing', emoji: '🌲', label: '힐링' },
  { key: 'luxury', emoji: '👑', label: '럭셔리' },
  { key: 'gourmet', emoji: '🍷', label: '미식' },
  { key: 'active', emoji: '🛶', label: '액티비티' },
  { key: 'view', emoji: '🌅', label: '뷰·전망' },
  { key: 'retro', emoji: '🏮', label: '레트로·전통' },
  { key: 'trendy', emoji: '🔥', label: '핫플' },
];

interface PopularZone {
  key: string;
  regionKey: string;
  label: string;
  keywords: string[];
}

const POPULAR_ZONES: PopularZone[] = [
  // 서울 (SEOUL)
  { key: 'seongsu', regionKey: 'SEOUL', label: '성수·서울숲', keywords: ['성동구', '성수', '서울숲', '뚝섬'] },
  { key: 'hannam', regionKey: 'SEOUL', label: '한남·이태원·용산', keywords: ['용산구', '한남', '이태원', '용리단', '해방촌', '경리단'] },
  { key: 'yeonnam', regionKey: 'SEOUL', label: '연남·연희·홍대', keywords: ['마포구', '서대문구', '연남', '연희', '서교', '망원', '상수'] },
  { key: 'apgujeong', regionKey: 'SEOUL', label: '압구정·신사·청담', keywords: ['강남구', '압구정', '신사', '청담', '도산', '가로수'] },
  { key: 'jongno', regionKey: 'SEOUL', label: '서촌·북촌·을지로', keywords: ['종로구', '중구', '서촌', '북촌', '삼청', '익선', '을지로'] },
  { key: 'jamsil', regionKey: 'SEOUL', label: '잠실·송리단길', keywords: ['송파구', '잠실', '송리단', '방이', '석촌'] },

  // 경기·인천 (GYEONGGI)
  { key: 'bundang', regionKey: 'GYEONGGI', label: '분당·판교', keywords: ['성남시', '분당', '판교', '백현', '정자'] },
  { key: 'suwon', regionKey: 'GYEONGGI', label: '수원·행궁동', keywords: ['수원시', '행궁', '인계', '광교'] },
  { key: 'gapyeong', regionKey: 'GYEONGGI', label: '가평·양평', keywords: ['가평군', '양평군', '청평', '두물머리'] },
  { key: 'ilsan', regionKey: 'GYEONGGI', label: '일산·파주', keywords: ['고양시', '파주시', '헤이리', '출판도시'] },
  { key: 'hanam', regionKey: 'GYEONGGI', label: '하남·남양주', keywords: ['하남시', '남양주시', '미사', '팔당', '별내'] },
  { key: 'songdo', regionKey: 'GYEONGGI', label: '송도·영종도', keywords: ['연수구', '송도', '영종', '을왕리', '인천'] },

  // 강원 (GANGWON)
  { key: 'gangneung', regionKey: 'GANGWON', label: '강릉 안목·경포', keywords: ['강릉시', '안목', '경포', '초당'] },
  { key: 'sokcho', regionKey: 'GANGWON', label: '속초·양양', keywords: ['속초시', '양양군', '인구', '하조대', '낙산'] },
  { key: 'chuncheon', regionKey: 'GANGWON', label: '춘천·홍천', keywords: ['춘천시', '홍천군'] },

  // 영남 (YEONGNAM)
  { key: 'busan_haeundae', regionKey: 'YEONGNAM', label: '부산 해운대·기장', keywords: ['해운대', '기장', '송정'] },
  { key: 'busan_gwangalli', regionKey: 'YEONGNAM', label: '부산 광안리·영도', keywords: ['수영구', '영도구', '광안리', '민락', '흰여울'] },
  { key: 'gyeongju', regionKey: 'YEONGNAM', label: '경주 황리단길', keywords: ['경주시', '황리단', '보문', '월정교'] },

  // 제주 (JEJU)
  { key: 'jeju_aewol', regionKey: 'JEJU', label: '제주 애월·한림', keywords: ['애월', '한림', '협재', '판포'] },
  { key: 'jeju_gujwa', regionKey: 'JEJU', label: '제주 구좌·성산', keywords: ['구좌', '성산', '세화', '종달'] },
  { key: 'jeju_jungmun', regionKey: 'JEJU', label: '제주 중문·서귀포', keywords: ['서귀포', '중문', '안덕'] },
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
      !excludeIds.includes(s.id),
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

/** rng 주입 가능 랜덤 픽 — 오늘의 코스(시드 PRNG)와 일반 생성(Math.random)이 공유 */
function pickRandom<T>(arr: T[], rng: () => number = Math.random): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/** 스폿의 area 안전 접근 — 필드 부재·null·빈 문자열은 모두 null 취급 */
function spotArea(spot: Spot | undefined): string | null {
  if (!spot) return null;
  return typeof spot.area === 'string' && spot.area.length > 0 ? spot.area : null;
}

/**
 * 앵커 area 기준 근접 랜덤 선택.
 * ① anchorArea와 같은 area 후보에서 랜덤 (area가 null인 스폿 제외)
 * ② 없으면 전체 후보(=같은 권역 조건 통과분, area null 포함)에서 랜덤 폴백
 */
function pickNearRandom(
  candidates: Spot[],
  anchorArea: string | null,
  rng: () => number = Math.random,
): Spot | undefined {
  if (anchorArea !== null) {
    const near = pickRandom(candidates.filter((s) => spotArea(s) === anchorArea), rng);
    if (near) return near;
  }
  return pickRandom(candidates, rng);
}

/** 스텝 목록에서 excludeIndex를 제외한 스폿들의 최빈 area (null 제외, 동률은 선착순) */
function dominantArea(
  steps: CourseStep[],
  byId: Map<number, Spot>,
  excludeIndex: number,
): string | null {
  const counts = new Map<string, number>();
  steps.forEach((st, i) => {
    if (i === excludeIndex || st.spotId === null) return;
    const area = spotArea(byId.get(st.spotId));
    if (area !== null) counts.set(area, (counts.get(area) ?? 0) + 1);
  });
  let best: string | null = null;
  let bestCount = 0;
  for (const [area, count] of counts) {
    if (count > bestCount) {
      best = area;
      bestCount = count;
    }
  }
  return best;
}

interface GenerateOptions {
  /** 시드 PRNG 주입 (오늘의 코스). 미지정 시 Math.random */
  rng?: () => number;
  /** 체감 랜덤 보정 — 소프트 제외할 최근 노출 스폿 ID (오늘의 코스는 미적용) */
  avoidIds?: ReadonlySet<number>;
}

/**
 * 앵커 기반 근접 코스 생성.
 * 1) 켠 슬롯 중 후보 수가 가장 적은(단, 1개 이상) 슬롯을 앵커로 먼저 랜덤 선택
 * 2) 나머지 슬롯은 앵커의 area 기준 ① 같은 area → ② 권역 전체 폴백으로 랜덤 선택
 * 후보 0건 슬롯은 spotId: null. area 데이터가 전무하면 전부 ②폴백 = 기존 동작과 동일.
 * avoidIds(최근 노출 이력)는 슬롯별 소프트 제외 — 제외 후 0건이면 이력 무시.
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
  let anchorArea: string | null = null;
  let anchorSpotId: number | null = null;
  if (anchorSlot !== null) {
    const anchor = pickRandom(anchorPool, rng);
    if (anchor) {
      picked.push(anchor.id);
      anchorSpotId = anchor.id;
      anchorArea = spotArea(anchor);
    }
  }

  return slotsOn.map((slot) => {
    if (slot === anchorSlot) return { slot, spotId: anchorSpotId };
    const candidates = excludeRecent(
      getCandidates(all, slot, regionKeys, moodKey, picked, zoneKeys),
      avoid,
    );
    const chosen = pickNearRandom(candidates, anchorArea, rng);
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

  // 6. 긴 업종/체험/클래스 수식어 다이어트
  const descriptorRegex = /\s+(VIP|VVIP|프리미엄|명품|수제|원데이클래스|원데이\s*클래스|클래스|아틀리에|갤러리|스튜디오|살롱|공방|옻칠|나전칠기|도자기|가죽공방|도예공방|체험장|체험관|투어|산책로|산책코스|야시장|먹거리|거리|골목|본점|직영점).*$/i;
  if (descriptorRegex.test(cleanName)) {
    const trimmed = cleanName.replace(descriptorRegex, '').trim();
    if (trimmed.length >= 2) {
      cleanName = trimmed;
    }
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

  // 8. 스마트 지역 결합 로직
  let candidateArea: string | null = null;

  // 8-0. spot.address 우선 활용 (도로명/지번 주소에서 동/로/길 또는 상세구역 추출)
  if (spot.address && spot.address.trim().length > 0) {
    const addr = spot.address.trim();
    // '은하수로', '성수이로', '신사동', '한남동' 등 유효 도로명/법정동 추출
    const roadMatch = addr.match(/([가-힣0-9]+(?:로|길|동|읍|면)(?:\s+[0-9]+(?:-[0-9]+)?)?)/);
    const guMatch = addr.match(/([가-힣]+(?:시|군|구))/g);
    if (roadMatch) {
      candidateArea = roadMatch[1];
    } else if (guMatch && guMatch.length > 0) {
      candidateArea = guMatch[guMatch.length - 1];
    }
  }

  // 8-1. spot.location 내 괄호나 세부 명소/지명 추출 (예: '영종도', '행궁동', '구읍뱃터')
  if (!candidateArea && spot.location) {
    const subLocMatch = spot.location.match(/(영종도|을왕리|월미도|송도|청라|행궁동|성수|한남|연남|서촌|북촌|익선|송리단|문래|대부도|제부도|안목|경포|초당|해운대|광안리|전포)/);
    if (subLocMatch) {
      candidateArea = subLocMatch[1];
    }
  }

  // 8-2. spot.area (시·군·구 단위)
  if (!candidateArea) {
    const spArea = spotArea(spot);
    if (spArea && spArea !== '전국' && spArea !== '수도권') {
      candidateArea = spArea.trim();
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

/** 스폿의 네이버 지도 검색 URL — 정식 플레이스 URL 최우선 지원 및 정제된 질의 연동 */
function naverMapUrl(spot: Spot): string {
  if (spot.source?.url && (spot.source.url.includes('map.naver.com') || spot.source.url.includes('naver.me'))) {
    return spot.source.url;
  }
  return `https://map.naver.com/p/search/${encodeURIComponent(mapQuery(spot))}`;
}

/**
 * 텍스트 복사 포맷 v2 (PLAN.md 3절) — 카톡에 붙였을 때 그대로 예쁜 정형 포맷.
 * 헤더(✨/📍) + 슬롯 블록(슬롯 이모지 · 스폿명 / 전각 들여쓰기 위치 — 이유 / 지도 링크)
 */
function formatCourseText(
  steps: CourseStep[],
  byId: Map<number, Spot>,
  regionKeys: string[],
  moodKey: string,
  zoneKeys: string[] = [],
): string {
  const blocks: string[] = [];
  blocks.push(`✨ 데이트 코스\n📍 ${regionsLabel(regionKeys, zoneKeys)} · ${moodLabel(moodKey)}`);
  const filled = steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);
  for (const step of filled) {
    const spot = byId.get(step.spotId);
    if (!spot) continue;
    const meta = SLOT_META[step.slot];
    const lines: string[] = [];
    lines.push(`${meta.emoji} ${meta.label} · ${spot.name}`);
    lines.push(`　${spot.location}${spot.summary ? ` — ${spot.summary}` : ''}`);
    lines.push(`　🗺️ ${naverMapUrl(spot)}`);
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

// --- 내 위치 중심 맞춤 추천 코스 ---------------------------------------------

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

const state: AppState = {
  slots: { day: true, evening: true, night: false, stay: false },
  regions: [],
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

const APP_VERSION = 'v0.5.0';

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
      <h1 class="app-title">오늘 데이트</h1>
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

  function applyCourse(steps: CourseStep[]) {
    state.slots = { day: true, evening: true, night: true, stay: false };
    state.regions = [];
    state.subZones = [];
    state.mood = 'ALL';
    state.course = steps.map((st) => ({ ...st }));
    state.courseConditions = { regions: [], subZones: [], mood: 'ALL' };
    renderConditions();
    renderResults();
  }

  btn.addEventListener('click', () => {
    if (!userCoords && 'geolocation' in navigator) {
      const labelSpan = btn.querySelector('.today-course-label');
      if (labelSpan) labelSpan.textContent = '📍 내 위치 찾는 중...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const nearby = buildNearbyCourse(userCoords);
          applyCourse(nearby.steps);
        },
        () => {
          const fallback = buildNearbyCourse(null);
          applyCourse(fallback.steps);
        },
        { timeout: 4000 }
      );
    } else {
      const res = buildNearbyCourse(userCoords);
      applyCourse(res.steps);
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
  area.innerHTML = `
    <div class="course-head">
      <span class="course-title">✨ ${escapeHtml(regionsLabel(cond.regions, cond.subZones))} · ${escapeHtml(moodLabel(cond.mood))} 코스</span>
      <button class="btn-regenerate" id="btn-regenerate" aria-label="전체 다시 추천받기">
        ${ICON_REFRESH_SVG}
        <span class="btn-regenerate-text">전체 다시 추천</span>
      </button>
    </div>
    <div class="step-list">
      ${state.course.map((step, i) => renderStepCard(step, i)).join('')}
    </div>
    <div class="result-actions result-actions-3">
      <button class="btn-secondary" id="btn-copy">📋 복사</button>
      <button class="btn-secondary" id="btn-share-link">🔗 링크</button>
      <button class="btn-primary" id="btn-save">💾 저장</button>
    </div>
  `;
  bindResultEvents(area);
}

function renderStepCard(
  step: CourseStep,
  index: number,
  opts: { swappable?: boolean } = {},
): string {
  const swappable = opts.swappable !== false;
  const meta = SLOT_META[step.slot];
  if (step.spotId === null) {
    return `
      <article class="step-card empty">
        <div class="step-slot">${meta.emoji} ${meta.label}</div>
        <p class="step-empty-msg">이 조건에 맞는 장소를 찾지 못했어요</p>
      </article>
    `;
  }
  const spot = spotById.get(step.spotId);
  if (!spot) {
    return `
      <article class="step-card empty">
        <div class="step-slot">${meta.emoji} ${meta.label}</div>
        <p class="step-empty-msg">장소 정보를 불러올 수 없어요</p>
      </article>
    `;
  }
  const moodTags = moodTagLabels(spot);
  const metaRow =
    spot.verified || moodTags.length > 0 || spot.category
      ? `
      <div class="step-meta">
        ${spot.category ? `<span class="step-category-tag">${escapeHtml(spot.category)}</span>` : ''}
        ${spot.verified ? `<span class="badge-verified">✓ 확인된 장소</span>` : ''}
        ${moodTags.length > 0 ? `<span class="step-mood-tags">${escapeHtml(moodTags.join(' · '))}</span>` : ''}
      </div>`
      : '';
  const imageBlock = spot.image_url
    ? `
      <div class="step-image-wrap">
        <img class="step-image" src="${escapeHtml(spot.image_url)}" alt="${escapeHtml(spot.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none';" />
      </div>`
    : '';

  return `
    <article class="step-card ${spot.image_url ? 'has-image' : ''}">
      <div class="step-card-head">
        <div class="step-slot">${meta.emoji} ${meta.label}</div>
        ${swappable ? `<button class="btn-swap" data-step-index="${index}" aria-label="${meta.label} 스텝 교체" title="이 장소만 다시 추천받기">${ICON_SWAP_SVG}</button>` : ''}
      </div>
      ${imageBlock}
      <h3 class="step-name">${escapeHtml(spot.name)}</h3>
      <p class="step-location">📍 ${escapeHtml(spot.location)}</p>
      ${metaRow}
      ${spot.summary ? `<blockquote class="step-quote">“${escapeHtml(spot.summary)}”</blockquote>` : ''}
      ${spot.price ? `<p class="step-price">${escapeHtml(spot.price)}</p>` : ''}
      <a class="step-map-link" href="${naverMapUrl(spot)}" target="_blank" rel="noopener noreferrer">지도 ↗</a>
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
  const anchorArea = dominantArea(state.course, spotById, index);
  const chosen = pickNearRandom(candidates, anchorArea);
  if (!chosen) {
    showToast('이 조건에 다른 추천 장소가 없어요');
    return;
  }
  state.course[index] = { slot: step.slot, spotId: chosen.id };
  addRecentSpotIds([chosen.id]);

  // 대상 카드만 부드럽게 swap-in 교체
  const cardList = document.querySelectorAll<HTMLElement>('.step-list > .step-card');
  const targetCard = cardList[index];
  if (!targetCard) {
    renderResults();
    return;
  }

  const temp = document.createElement('div');
  temp.innerHTML = renderStepCard(state.course[index], index);
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
  area.querySelector('#btn-copy')?.addEventListener('click', () => {
    if (!state.course || !state.courseConditions) return;
    const text = formatCourseText(
      state.course,
      spotById,
      state.courseConditions.regions,
      state.courseConditions.mood,
      state.courseConditions.subZones,
    );
    navigator.clipboard
      .writeText(text)
      .then(() => showToast('📋 코스가 복사되었어요'))
      .catch(() => showToast('복사하지 못했어요'));
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
  app.innerHTML = `
    <header class="topbar">
      <h1 class="app-title">오늘 데이트</h1>
    </header>
    <section class="receiver-view">
      <p class="receiver-title">✨ 친구가 보낸 데이트 코스</p>
      <div class="step-list">
        ${steps.map((step, i) => renderStepCard(step, i, { swappable: false })).join('')}
      </div>
      <button class="btn-primary btn-make-own" id="btn-make-own">나만의 코스 만들기 →</button>
    </section>
    <footer class="app-footer">
      <p class="footer-copy">오늘 데이트 <span class="footer-version">${APP_VERSION}</span></p>
      <p class="footer-sub">조건만 고르면 완성되는 시간대별 데이트 코스</p>
    </footer>
  `;
  document.getElementById('btn-make-own')!.addEventListener('click', () => {
    clearCourseHash();
    renderShell();
  });
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

function init(): void {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.savedOpen) {
      closeOverlay();
    }
  });

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

  // Supabase 실시간 DB 동기화 (환경변수 VITE_SUPABASE_URL 설정 시 비동기 활성화)
  loadSpots().then((liveSpots) => {
    if (liveSpots && liveSpots.length > 0 && liveSpots !== spots) {
      spots = liveSpots;
      spotById = new Map(spots.filter((s) => typeof s.id === 'number').map((s) => [s.id, s]));
      renderTodayCourse();
      renderConditions();
      console.log(`⚡ [Supabase Live] ${spots.length}개 스팟 동기화 완료`);
    }
  });
}

init();
