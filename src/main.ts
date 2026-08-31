import './style.css';
import rawSpotsData from './data/spots.sample.json';
import { renderNativeInfeedAdCard, initAdSense } from './ads';

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

  // v4.0 메타 확장
  parking_type?: string;
  parking_info?: import('./supabase').ParkingInfo;
  parking_detail?: string;
  subway_info?: string;

  business_hours?: Record<string, string>;
  break_time?: Record<string, string>;
  closed_days?: string[];
  is_24h?: boolean;

  reservation_type?: string;
  reservation_url?: string;
  booking_tips?: string;
  booking_info?: import('./supabase').BookingInfo;

  price_tier?: '₩' | '₩₩' | '₩₩₩' | '₩₩₩₩' | 'FREE' | null;
  avg_price_per_person?: number | null;
  signature_items?: string[];

  mood_tags?: string[];
  date_contexts?: string[];

  curation_badges?: import('./supabase').CurationBadges;
  provider_ids?: import('./supabase').ProviderIds;
  ai_summary_editorial?: string;

  social_links?: import('./supabase').SocialLinks;
  metrics?: import('./supabase').SpotMetrics;
  hot_score?: number;
  last_verified_at?: string;
  created_at?: string;
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

// 지역 필터: key → 매칭되는 데이터 region 값 목록 (matchesRegion 주석 참고)
const REGIONS: { key: string; label: string; match: string[] }[] = [
  { key: 'ALL', label: '전국', match: [] },
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
  { key: 'mullae', regionKey: 'SEOUL', label: '영등포·문래·여의도', keywords: ['영등포구', '문래', '여의도', '당산', '영등포', '양평동'] },
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
  { key: 'daegu', regionKey: 'YEONGNAM', label: '대구 동성로·교동', keywords: ['대구', '동성로', '교동', '앞산', '수성못', '삼덕동'] },
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

export interface QuickTagItem {
  label: string; // 화면에 표시될 뱃지 텍스트 (예: '#삼겹살')
  query: string; // 실제 검색창에 입력될 키워드 (예: '삼겹살')
  synonyms: string[]; // 확장 동의어/연관어 매칭 풀
}

export const POPULAR_QUICK_TAGS: QuickTagItem[] = [
  { label: '#성수핫플', query: '성수핫플', synonyms: ['성수', '성수동', '성수1가', '성수2가', '서울숲', '뚝섬', '연무장길', '성동구'] },
  { label: '#비오는날', query: '비오는날', synonyms: ['실내', '비', '비오는날', '전시', '미술관', '박물관', '아쿠아리움', '스파', '온천', '찜질', '사우나', '공방', '원데이', '영화관', '보드게임', '방탈출', '드로잉', '몰', '백화점', '식물원', '도예', '향수'] },
  { label: '#루프탑', query: '루프탑', synonyms: ['루프탑', '오션뷰', '전망', '뷰', '테라스', '스카이', '야경', '옥상', '스카이라운지', '리버뷰', '마운틴뷰', '시티뷰'] },
  { label: '#야경', query: '야경', synonyms: ['야경', '밤', '전망', '남산', '한강', '야경명소', '일몰', '노을', '선셋', '루프탑', '스카이', '타워', '야간', '달빛'] },
  { label: '#오마카세', query: '오마카세', synonyms: ['오마카세', '파인다이닝', '스시', '한우', '코스요리', '일식', '초밥', '가이세키', '갓포', '맡김차림'] },
  { label: '#디저트카페', query: '디저트카페', synonyms: ['카페', '디저트', '베이커리', '빵집', '케이크', '커피', '브런치', '구움과자', '소금빵', '베이글', '타르트', '도넛', '마카롱', '스콘', '크루아상', '빙수', '찻집', '다실'] },
  { label: '#와인', query: '와인', synonyms: ['와인', 'wine', '와인바', '내추럴와인', '글라스와인', '비스트로', '다이닝바', '펍', '양식', '이탈리안', '프렌치', '스테이크', '파스타', '샤퀴테리'] },
  { label: '#위스키', query: '위스키', synonyms: ['위스키', 'whisky', '몰트', '싱글몰트', '하이볼', '스피크이지', '위스키바', 'lp바'] },
  { label: '#칵테일', query: '칵테일', synonyms: ['칵테일', 'cocktail', '라운지바', '논알콜', '스피크이지', '루프탑바', '믹솔로지', '칵테일바'] },
  { label: '#공방', query: '공방', synonyms: ['공방', '원데이', '원데이클래스', '도자기', '도예', '향수공방', '드로잉', '베이킹', '가죽공방', '유리공예', '반지공방', '목공', '비누공방', '캔들', '터프팅'] },
  { label: '#이색체험', query: '이색체험', synonyms: ['이색', '체험', '보드게임', '방탈출', '아쿠아리움', 'vr', '사격', '카트', '목장', '공방', '도예', '향수', '드로잉', '동물원', '미디어아트', '클라이밍', '스케이트', '짚라인', '양궁', '낚시', '서핑', '글램핑'] },
  { label: '#액티비티', query: '액티비티', synonyms: ['액티비티', '루지', '서핑', '요트', '패러글라이딩', '케이블카', '짚라인', '클라이밍', '카약', '레일바이크', '모노레일', '수상레저', '스포츠', '카트', '스케이트', '썰매', '트레킹', '하이킹', '자전거', '승마', '서바이벌', '워터파크'] },
  { label: '#스파', query: '스파', synonyms: ['스파', '온천', '마사지', '찜질방', '사우나', '테르메덴', '아쿠아필드', '피부관리', '헤드스파', '에스테틱', '노천탕', '족욕', '힐링'] },
  { label: '#맛집', query: '맛집', synonyms: ['맛집', '미식', '로컬', '노포', '삼겹살', '파스타', '스테이크', '고기', '다이닝', '식당', '음식점', '한식', '양식', '일식', '중식', '갈비', '해물', '횟집', '초밥', '피자', '버거', '분식', '레스토랑'] },
  { label: '#드라이브', query: '드라이브', synonyms: ['드라이브', '외곽', '호수', '전망대', '남한산성', '북악', '해안도로', '해변', '강변', '국도', '고개', '전망', '가평', '양평', '남양주', '포천', '강화', '영종도', '대부도', '제부도'] },
];

export interface SpotCategoryItem {
  key: string;
  label: string;
  emoji: string;
  keywords?: string[];
}

export const SPOT_EXPLORE_CATEGORIES: SpotCategoryItem[] = [
  { key: 'ALL', label: '전체', emoji: '✨' },
  { key: 'CAFE', label: '감성카페', emoji: '☕', keywords: ['카페', '디저트', '베이커리', '빵집', '케이크', '커피', '구움과자', '소금빵', '베이글', '찻집'] },
  { key: 'BRUNCH', label: '브런치·베이글', emoji: '🥐', keywords: ['브런치', '프렌치토스트', '팬케이크', '오믈렛', '베이글', '샌드위치', '샐러드', '에그베네딕트'] },
  { key: 'DINING', label: '미식·다이닝', emoji: '🍽️', keywords: ['맛집', '미식', '식당', '레스토랑', '파스타', '스테이크', '고기', '삼겹살', '한식', '일식', '양식', '초밥', '피자', '오마카세', '다이닝'] },
  { key: 'ROMANTIC', label: '기념일·로맨틱', emoji: '🕯️', keywords: ['기념일', '파인다이닝', '코스요리', '오마카세', '고급', '호텔다이닝', '분위기', '프로포즈', '데이트코스'] },
  { key: 'WINE', label: '와인·위스키', emoji: '🍷', keywords: ['와인', '와인바', '위스키', '하이볼', '바(bar)', '라운지', '칵테일', '비스트로', '주점', 'lp바'] },
  { key: 'PUB', label: '이자카야·펍', emoji: '🍺', keywords: ['이자카야', '맥주', '수제맥주', '펍', '재즈바', '야장', '포차', '꼬치', '하이볼', '심야식당'] },
  { key: 'NIGHT', label: '야경·루프탑', emoji: '🌙', keywords: ['야경', '루프탑', '전망', '스카이', '노을', '일몰', '한강', '남산', '타워', '테라스', '뷰맛집'] },
  { key: 'OCEAN', label: '오션뷰·물멍', emoji: '🌊', keywords: ['오션뷰', '리버뷰', '호수', '바다', '해변', '선셋', '물멍', '한강뷰', '해안'] },
  { key: 'EXPERIENCE', label: '공방·원데이', emoji: '🎨', keywords: ['공방', '원데이', '체험', '드로잉', '도자기', '도예', '향수', '가죽', '반지', '베이킹', '플라워'] },
  { key: 'CULTURE', label: '전시·놀거리', emoji: '🎭', keywords: ['전시', '미술관', '갤러리', '뮤지엄', '팝업', '팝업스토어', '보드게임', '방탈출', '아쿠아리움', '공연', '연극', '영화관'] },
  { key: 'HEALING', label: '숲·산책힐링', emoji: '🌿', keywords: ['숲', '식물원', '수목원', '공원', '산책', '피크닉', '자연', '정원', '잔디', '둘레길'] },
  { key: 'SPA', label: '스파·사우나', emoji: '♨️', keywords: ['스파', '온천', '찜질', '사우나', '테르메덴', '아쿠아필드', '마사지', '피부관리', '헤드스파', '힐링스파'] },
  { key: 'DRIVE', label: '근교·드라이브', emoji: '🚗', keywords: ['드라이브', '해안도로', '외곽', '전망대', '호수', '가평', '양평', '남양주', '포천', '강화', '영종도', '대부도', '근교'] },
  { key: 'STAY', label: '호캉스·감성숙소', emoji: '🏨', keywords: ['호텔', '호캉스', '감성숙소', '풀빌라', '글램핑', '카라반', '펜션', '리조트', '료칸'] },
];

export const DISTANCE_RADIUS_OPTIONS = [
  { value: 0.5, label: '500m' },
  { value: 1.0, label: '1km' },
  { value: 3.0, label: '3km' },
  { value: 5.0, label: '5km' },
  { value: 10.0, label: '10km' },
];

let spots: Spot[] = rawSpotsData as unknown as Spot[];

// ---------------------------------------------------------------------------
// 순수 함수 — 필터 · 후보 계산 · 랜덤 픽 · 코스 생성 · 텍스트 포맷 (상태/DOM 없음)
// ---------------------------------------------------------------------------

function isValidSlot(value: unknown): value is SlotKey {
  return value === 'day' || value === 'evening' || value === 'night' || value === 'stay';
}

/**
 * 선택된 지역 키들의 합집합으로 매칭. 빈 배열(= 지역 '전체')은 모든 스폿 통과.
 * 특정 지역을 고르면 region '전국'(광역 미상) 스폿은 제외된다 — 지리적으로 고정할 수 없는
 * 항목을 특정 지역 결과에 섞지 않기 위한 의도된 동작이다.
 * (기존 주석은 "'전국' region은 항상 포함"이라 되어 있었으나 구현과 반대였다.)
 */
function matchesRegion(spot: Spot, regionKeys: string[]): boolean {
  if (regionKeys.length === 0) return true;
  return regionKeys.some((key) => {
    const region = REGIONS.find((r) => r.key === key);
    return region ? region.match.includes(spot.region) : false;
  });
}

/** 행정구역 단위 접미사 — 존 키워드·area 경계 판별용 */
const ADMIN_UNIT_SUFFIXES = ['구', '시', '군', '동', '읍', '면'];

/** REGIONS에 정의된 실제 데이터 region 값 집합 ('전국' 등 미등록 값은 광역 판정에서 제외) */
const KNOWN_REGION_VALUES = new Set(REGIONS.flatMap((r) => r.match));

/** '영등포구'·'양평동'처럼 행정구역 접미사로 끝나는 지명인지 */
function hasAdminUnitSuffix(text: string): boolean {
  return ADMIN_UNIT_SUFFIXES.includes(text.slice(-1));
}

/**
 * 스폿 area(시·군·구)와 존 키워드의 행정구역 단위 일치 판정 (단순 부분일치 금지).
 * - 완전 일치: area '영등포구' vs 키워드 '영등포구' → true
 * - 접미사만 덧붙은 동일 지명: area '영등포구' vs 키워드 '영등포' / area '대전광역시' vs 키워드 '대전' → true
 * - 접미사가 다른 별개 행정구역: area '양평군' vs 키워드 '양평동' → false
 */
function areaMatchesZoneKeyword(area: string, keyword: string): boolean {
  if (area === keyword) return true;
  if (area === `${keyword}시` || area === `${keyword}군` || area === `${keyword}구`) return true;
  if (area === `${keyword}광역시` || area === `${keyword}특별시` || area === `${keyword}특별자치시`) return true;
  if (hasAdminUnitSuffix(keyword)) return false;
  return area.length === keyword.length + 1 && area.startsWith(keyword) && hasAdminUnitSuffix(area);
}

/** 스폿이 존의 광역권에 속하는지 — 서울 중구 ↔ 대구 중구처럼 동명 자치구 광역 오매칭 차단 */
function zoneCoversRegion(spot: Spot, zone: PopularZone): boolean {
  if (!KNOWN_REGION_VALUES.has(spot.region)) return true;
  const region = REGIONS.find((r) => r.key === zone.regionKey);
  if (!region || region.match.length === 0) return true;
  return region.match.includes(spot.region);
}

/**
 * 존 키워드가 텍스트 내에서 독립된 지명으로 쓰였는지 검사 (오탐 합성어·근교 표현 차단).
 * - 차단 예: '대전 근교'(타지역), '광주호'(호수), '대구탕'(음식), '인천공항'(시설)
 */
function textContainsZoneKeyword(targetText: string, keyword: string): boolean {
  if (!targetText.includes(keyword)) return false;

  // '지명 근교', '지명 인근', '지명 출발' 등 타 지역 소개 수식어 배제
  const nearbyPattern = new RegExp(`${keyword}\\s*(?:근교|인근|출발|방면|고속도로|IC)`, 'g');
  const sanitizedText = targetText.replace(nearbyPattern, '');
  if (!sanitizedText.includes(keyword)) return false;

  // 광주호, 대구탕 등 특정 복합명사 오탐 방지
  // TODO: 대전(대전차방벽), 부산(부산물), 인천(인천공항) 등 추가 지명 복합어가 발견되면 확장
  if (keyword === '광주' && /광주호/.test(sanitizedText) && !/광주(?:광역시|\s|[시구동길로]|$)/.test(sanitizedText)) {
    return false;
  }
  if (keyword === '대구' && /대구탕|대구뽈/.test(sanitizedText) && !/대구(?:광역시|\s|[시구동길로]|$)/.test(sanitizedText)) {
    return false;
  }

  return true;
}

/**
 * 세부존 매칭 — area(시·군·구) 기준 정밀 매칭이 1순위, 실패 시에만 name+location 정밀 폴백.
 * 광역/인접 시군 오매칭 4중 차단:
 * ① 존 광역권 밖 스폿 배제
 * ② area는 행정구역 단위로만 일치 인정
 * ③ 스폿 area가 명확한 독립 시·군(예: 공주시, 담양군)인데 존 키워드에 미포함된 경우, 텍스트 폴백에 의한 타 존 흡수 원천 차단
 * ④ 폴백 텍스트에서 근교·복합어(대전 근교, 광주호 등) 오탐 방지
 */
function matchesZone(spot: Spot, zoneKeys: string[]): boolean {
  if (zoneKeys.length === 0) return true;
  return zoneKeys.some((zk) => {
    const zone = POPULAR_ZONES.find((z) => z.key === zk);
    if (!zone) return false;
    if (!zoneCoversRegion(spot, zone)) return false;

    const area = spotArea(spot);
    if (area) {
      if (zone.keywords.some((kw) => areaMatchesZoneKeyword(area, kw))) return true;

      // area가 다른 기초자치단체(시/군)로 확정된 스폿은 타 시·군 존 텍스트 폴백에서 배제
      // 단, 존 키워드에 해당 시/군(또는 접미사 제거 지명)이 포함되어 있으면
      // 같은 행정 권역이므로 텍스트 폴백을 허용한다.
      // (예: area '제주시' + 존 키워드 ['애월','한림',...] → 같은 제주 권역이므로 폴백 허용)
      const isExplicitCityOrCounty = /(?:시|군)$/.test(area);
      if (isExplicitCityOrCounty) {
        const areaBase = area.replace(/(?:시|군)$/, '');
        const zoneHasArea = zone.keywords.some((kw) =>
          kw === area || kw === areaBase || kw.startsWith(areaBase)
        );
        if (!zoneHasArea) {
          return false;
        }
      }
    }

    const targetText = `${spot.name} ${spot.location}`;
    return zone.keywords.some((kw) => textContainsZoneKeyword(targetText, kw));
  });
}

function matchesMood(spot: Spot, moodKey: string): boolean {
  if (moodKey === 'ALL') return true;
  return Array.isArray(spot.mood) && spot.mood.includes(moodKey);
}

/** 숙박 카테고리 화이트리스트 — category가 이 계열이면 즉시 통과 */
const STAY_CATEGORY_KEYWORDS = [
  '호텔', '리조트', '펜션', '풀빌라', '빌라', '글램핑', '캠핑', '야영', '카라반', '한옥숙소',
  '료칸', '게스트하우스', '민박', '모텔', '여관', '콘도', '숙박', '숙소', '유스호스텔',
];

/** 숙박 '형태' 명사 — category가 없을 때(현 데이터의 77%) 통과를 인정하는 강한 근거 */
const LODGING_FORM_KEYWORDS = [
  '펜션', '풀빌라', '글램핑', '카라반', '료칸', '게스트하우스', '민박', '모텔', '여관', '콘도',
  '독채', '숙소', '스테이', '객실', '스위트', '롯지', '로지', '캐빈', '샬레', '코티지', '방갈로',
  '카바나', '별장', '오두막', '통나무집', '촌캉스', '호스텔', '빌라', '한채', '펜트하우스',
  '산장', '트리하우스', '나무집', '리야드',
];

/** 단독으로는 약한 신호 — 부대시설어와 함께 오면 숙소가 아니라 호텔 내 업장이다 */
const SOFT_STAY_KEYWORDS = ['호텔', '리조트', '한옥', '캠핑'];

/** 명백한 비숙박 업종어 (카페/식당/전시/액티비티 등 오분류 원천 차단) */
const NON_STAY_KEYWORDS = [
  '레스토랑', '한정식', '다이닝', '그릴', '뷔페', '라운지', '스파', '온천', '찻집', '다실',
  '전시', '미술관', '박물관', '테니스', '클라이밍', '스포츠', '골프', '서핑', '영화관', '서점',
  '해수욕장', '약국', '경찰서', '문화원', '카페', '베이커리', '디저트', '식당', '음식점', '술집',
  '주점', '와인바', '이자카야', '포차', '비스트로', '브루어리', '양조장', '탭룸', '와이너리',
  '에스테이트', '수목원', '식물원', '놀이공원', '테마파크', '워터파크', '케이블카', '백화점',
  '아울렛', '공원',
];

/** 호텔·리조트 부대시설/식음업장 신호 — 이름에 '호텔·리조트'가 있어도 이게 붙으면 숙소가 아니다 */
const FACILITY_KEYWORDS = [
  '그릴', '다이닝', 'bbq', '뷔페', '라운지', '스파', '카페', '루프탑', '레스토랑', '델리',
  '클럽하우스', '바베큐', '베이커리', '펍',
];

/**
 * substring 오탐 차단 — 키워드를 '숙주 단어'로 삼는 가짜 매칭을 먼저 제거한다.
 * '스테이'→스테이크·스테이션·힐스테이트, '한옥'→한옥마을(지명), '캠핑'→캠핑용품,
 * '스파'→인스파이어·에스파스·예스파크, '빌라'→타임빌라스(아울렛).
 */
const KEYWORD_FALSE_HOSTS: Record<string, string[]> = {
  '스테이': ['스테이크', '스테이션', '힐스테이트', '에스테이트', '스테이지'],
  '한옥': ['한옥마을'],
  '캠핑': ['캠핑용품', '캠핑장비'],
  '스파': ['인스파이어', '에스파스', '예스파크', '아그네스파크', '파라스파라', '스파크', '스파이', '스파게티'],
  '빌라': ['타임빌라스', '빌라드'],
  '카페': ['카페거리', '카페산'],
  '공원': ['공원뷰'],
};

function hasKeyword(text: string, keyword: string): boolean {
  const hosts = KEYWORD_FALSE_HOSTS[keyword];
  if (!hosts) return text.includes(keyword);
  let stripped = text;
  for (const host of hosts) stripped = stripped.split(host).join(' ');
  return stripped.includes(keyword);
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => hasKeyword(text, kw));
}

function nameTokens(name: string): string[] {
  return name.split(/[\s&,·\-—~/()[\]]+/).filter(Boolean);
}

/** '바'는 한글 substring 오탐(바다·바비큐·바위)이 심해 단독 토큰/명시 합성어일 때만 술집 신호로 인정 */
function hasBarToken(name: string): boolean {
  if (/(?:칵테일|와인|루프탑|스카이|재즈|샴페인|위스키|하이볼|오마카세)\s?바(?![다렌])/.test(name)) return true;
  return nameTokens(name).some((t) => t === '바' || t === 'bar');
}

/** 부대시설어는 독립 토큰일 때만 인정 ('스파리조트'·'인스파이어' 같은 합성어 오탐 차단) */
function hasFacilityToken(name: string): boolean {
  const tokens = nameTokens(name);
  return tokens.some((t) => FACILITY_KEYWORDS.includes(t)) || hasBarToken(name);
}

/** 호텔/리조트 + 부대시설어 조합 = 숙소가 아니라 그 안의 바·그릴·스파 (실측 12건 이상 제거) */
function hasFacilityConflict(name: string): boolean {
  if (!hasKeyword(name, '호텔') && !hasKeyword(name, '리조트')) return false;
  return hasFacilityToken(name);
}

/** '1박 30만원'·'평일/주말' 요금제 = 확정 숙박 신호. 시간제·1인 코스 요금은 식음/체험 업장 */
function hasLodgingPrice(price: string | null | undefined): boolean {
  if (!price) return false;
  const p = price.toLowerCase();
  const perNight = /[0-9]\s*박/.test(p);
  if (/[0-9]\s*시간|1인|인당|코스|오마카세|입장료/.test(p)) return perNight;
  if (perNight) return true;
  return p.includes('평일') && p.includes('주말');
}

/** 목차·리스티클·문서 섹션 항목 (실제 장소가 아닌 원본 노트의 제목 줄) */
const LISTICLE_NAME_PATTERNS: RegExp[] = [
  /[0-9]+\s*선(?!착)/,
  /상세\s*(분석|명세)/,
  /트렌드\s*분석/,
  /마크다운|아카이브/,
  /\bpart\s*[0-9]/i,
  /\bchapter\s*[0-9]/i,
  /카테고리\s*[0-9]/,
  /[0-9]+\s*부\./,
  /curation\s+(criteria|philosophy)/i,
  /출처\s*메모/,
];

/** '…20선 상세 명세'·'Part 2.'·이모지만 있는 제목 등 코스에 올릴 수 없는 문서 항목인지 */
function isListicleEntry(spot: Spot): boolean {
  const name = (spot.name || '').trim();
  if (name.length === 0) return true;
  if (!/[0-9A-Za-z가-힣]/.test(name)) return true;
  return LISTICLE_NAME_PATTERNS.some((re) => re.test(name));
}

/**
 * 숙박(stay) 슬롯 장소의 진위 여부 검증 — 화이트리스트 우선 구조.
 */
function isRealStaySpot(spot: Spot): boolean {
  if (spot.slot !== 'stay') return true;
  const name = (spot.name || '').toLowerCase();
  const cat = (spot.category || '').trim().toLowerCase();

  if (isListicleEntry(spot)) return false;
  if (spot.region === '전국' && !(typeof spot.area === 'string' && spot.area.trim().length > 0)) {
    return false;
  }
  if (hasFacilityConflict(name)) return false;

  if (cat.length > 0 && hasAnyKeyword(cat, STAY_CATEGORY_KEYWORDS)) return true;
  if (hasLodgingPrice(spot.price)) return true;
  if (cat.length > 0) return false;

  if (hasBarToken(name)) return false;
  if (hasAnyKeyword(name, LODGING_FORM_KEYWORDS)) return true;
  if (hasAnyKeyword(name, NON_STAY_KEYWORDS)) return false;
  if (hasAnyKeyword(name, SOFT_STAY_KEYWORDS)) return !hasFacilityToken(name);
  return false;
}

/** '서촌 / 북촌 / 삼청' 등 단일 장소가 아닌 광역 묶음 및 지자체 더미 라벨인지 검사 */
function isBroadRegionDummy(spot: Spot): boolean {
  const name = (spot.name || '').trim();
  if (name.length === 0) return true;
  // 슬래시가 2개 이상 들어간 다중 지역 나열 (예: 서촌 / 북촌 / 삼청 / 안국 / 익선)
  if (name.split('/').length >= 3) return true;
  // 단순 권역/지자체명 나열 더미
  if (/^(서울|경기|인천|강원|충청|호남|영남|제주|대전|광주|대구|부산|울산)\s*[\/&]\s*(충청|전라|경상|울산|경남|경북|전남|전북|강원)/.test(name)) return true;
  if (/.*&.*&.*권$/.test(name)) return true;
  if (/^(충북|충남|전북|전남|경북|경남|강원도?)\s+[가-힣]+(시|군|구)$/.test(name)) return true;
  return false;
}

/** '풍자 또간집', '성시경 먹을텐데' 등 방송/유튜브 채널명이 상호명으로 오염된 더미 스팟인지 검사 */
function isPollutedMediaChannelDummy(spot: Spot): boolean {
  const name = (spot.name || '').trim();
  if (name.length === 0) return true;
  const indicators = [
    '또간집', '풍자', '먹을텐데', '성시경', '줄서는식당', '줄 서는 식당', 
    '맛있는녀석들', '맛있는 녀석들', '놀라운토요일', '수요미식회', '골목식당', '백종원',
    '생활의달인', '전현무계획', '최자로드', '유튜브', '브이로그', 'vlog', 'shorts'
  ];
  return indicators.some((ind) => name.includes(ind));
}

/** 코스 후보로 올릴 수 있는 스폿인지 — 생성·공유복원·저장복원 전 경로가 공유하는 단일 관문 */
function isCourseEligible(spot: Spot): boolean {
  return isValidSlot(spot.slot) && !isListicleEntry(spot) && !isBroadRegionDummy(spot) && !isPollutedMediaChannelDummy(spot) && isRealStaySpot(spot);
}

/**
 * 존 내 후보가 0건이라 광역 전체로 완화됐을 때 숙박에 허용하는 앵커 반경 (km).
 * 실측 기준: 성수·문래·한남은 3.6~8.8km 안에 숙소가 있어 그대로 채워지고,
 * 청주(최근접 33km)·광주(최근접 76km)는 후보 없음으로 떨어져 엉뚱한 숙소 대신 안내 카드가 뜬다.
 */
const STAY_ZONE_FALLBACK_RADIUS_KM = 20;

interface CandidatePool {
  spots: Spot[];
  /** 세부존을 선택했지만 존 내 후보가 0건이라 광역 전체로 조건이 완화됐는지 */
  relaxed: boolean;
}

/**
 * 슬롯 + 지역 + 세부존 + 분위기 조건에 맞는 후보 풀 (excludeIds 제외).
 * 존 내 후보가 0건이면 광역으로 넓히되, 넓혔다는 사실을 relaxed로 호출자에게 알린다.
 */
function getCandidatePool(
  all: Spot[],
  slot: SlotKey,
  regionKeys: string[],
  moodKey: string,
  excludeIds: number[],
  zoneKeys: string[] = [],
): CandidatePool {
  const base = all.filter(
    (s) =>
      isCourseEligible(s) &&
      s.slot === slot &&
      matchesRegion(s, regionKeys) &&
      matchesMood(s, moodKey) &&
      !excludeIds.includes(s.id),
  );
  if (zoneKeys.length === 0) return { spots: base, relaxed: false };
  const zoneFiltered = base.filter((s) => matchesZone(s, zoneKeys));
  if (zoneFiltered.length > 0) return { spots: zoneFiltered, relaxed: false };
  return { spots: base, relaxed: true };
}

/**
 * 숙박만 광역 폴백 차단 — 낮/저녁/밤은 존 안에 남는데 숙박만 밀도가 낮아 조용히 광역으로
 * 튀면서 "숙박만 뜬금없이 멀다"는 체감을 만든다. 앵커 반경 밖이면 차라리 후보 없음 처리.
 */
function applyStayZonePolicy(pool: CandidatePool, slot: SlotKey, anchor: Spot | null): Spot[] {
  if (slot !== 'stay' || !pool.relaxed) return pool.spots;
  if (!anchor || anchor.lat == null || anchor.lng == null) return [];
  return pool.spots.filter(
    (s) =>
      s.lat != null &&
      s.lng != null &&
      getDistanceKm(anchor.lat!, anchor.lng!, s.lat!, s.lng!) <= STAY_ZONE_FALLBACK_RADIUS_KM,
  );
}

/** 슬롯 + 지역 + 세부존 + 분위기 조건에 맞는 후보 목록 (숙박 광역 폴백 정책 적용) */
function getCandidates(
  all: Spot[],
  slot: SlotKey,
  regionKeys: string[],
  moodKey: string,
  excludeIds: number[],
  zoneKeys: string[] = [],
  anchor: Spot | null = null,
): Spot[] {
  const pool = getCandidatePool(all, slot, regionKeys, moodKey, excludeIds, zoneKeys);
  return applyStayZonePolicy(pool, slot, anchor);
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

  // 4순위: 앵커와 동일 광역(region) 내에서 최단 거리 상위 후보 선별 (무제한 전국 난입 완전 차단)
  const sameRegion = candidates.filter((s) => s.region === anchor.region);
  const pool = sameRegion.length > 0 ? sameRegion : candidates;

  if (anchor.lat != null && anchor.lng != null) {
    const withDist = pool
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({ spot: s, dist: getDistanceKm(anchor.lat!, anchor.lng!, s.lat!, s.lng!) }))
      .sort((a, b) => a.dist - b.dist);

    if (withDist.length > 0) {
      const top3 = withDist.slice(0, 3);
      return pickRandom(top3, rng)?.spot;
    }
  }

  return pickRandom(pool, rng);
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
  /** 사용자 입력 키워드 또는 퀵 태그 (예: 삼겹살, 위스키, 성수다락 등) */
  searchQuery?: string;
  /** 비주얼 카테고리 칩 선택 키 (예: CAFE, DINING, WINE 등) */
  categoryKey?: string;
}

/** 검색어 및 퀵 태그 매칭 헬퍼 (특수문자 정제, 다중 토큰, 동의어 풀 매칭 지원) */
function matchesSearchQuery(spot: Spot, query: string): boolean {
  if (!query || !query.trim()) return true;

  // 1. # 및 구분자(·, /, , 등) 정제
  const cleanQ = query.replace(/[#·,/\\]/g, ' ').trim().toLowerCase();
  if (!cleanQ) return true;

  // 2. 검색 대상 텍스트 조립
  const targetParts: string[] = [
    spot.name || '',
    spot.category || '',
    spot.summary || '',
    spot.location || '',
    spot.area || '',
    spot.address || '',
    ...(spot.signature_items || []),
    ...(spot.mood_tags || []),
    ...(Array.isArray(spot.mood) ? spot.mood : [spot.mood || '']),
  ];
  const targetText = targetParts.join(' ').toLowerCase();

  // 3. 자연어 데이트 상황 및 퀵 태그 동의어 매칭 검사
  const NATURAL_CONTEXT_MAP: Record<string, string[]> = {
    '비': ['실내', '스파', '온천', '찜질', '사우나', '카페', '전시', '미술관', '박물관', '아쿠아리움', '공방', '영화', '보드게임', '방탈출', '식물원'],
    '비오는날': ['실내', '스파', '온천', '찜질', '사우나', '카페', '전시', '미술관', '박물관', '아쿠아리움', '공방', '영화', '보드게임', '방탈출', '식물원'],
    '비오는': ['실내', '스파', '온천', '찜질', '사우나', '카페', '전시', '미술관', '박물관', '아쿠아리움', '공방', '영화', '보드게임', '방탈출', '식물원'],
    '실내': ['실내', '스파', '전시', '미술관', '박물관', '아쿠아리움', '공방', '도자기', '향수', '식물원', '영화관', '보드게임'],
    '성수핫플': ['성수', '성수동', '서울숲', '뚝섬', '연무장길', '성동구'],
    '디저트카페': ['디저트', '베이커리', '빵집', '케이크', '커피', '브런치', '구움과자', '소금빵', '베이글', '타르트', '도넛', '마카롱', '스콘', '크루아상', '빙수', '찻집', '다실'],
    '이색체험': ['이색', '체험', '보드게임', '보드카페', '만화카페', '방탈출', '아쿠아리움', 'vr', '사격', '카트', '목장', '공방', '도예', '향수', '드로잉', '동물원', '미디어아트', '클라이밍', '스케이트', '짚라인', '양궁', '낚시', '서핑', '글램핑'],
    '보드카페': ['보드게임', '보드카페', '만화카페', '보드', '게임', '룸카페'],
    '보드게임': ['보드게임', '보드카페', '만화카페', '보드', '게임', '룸카페'],
    '만화카페': ['만화카페', '보드카페', '보드게임', '만화', '룸카페'],
    '기념일': ['럭셔리', '파인다이닝', '오마카세', '와인바', '야경', '호텔', '뷰', '스테이크'],
    '생일': ['파인다이닝', '오마카세', '레터링', '케이크', '와인바', '럭셔리', '호텔'],
    '소개팅': ['파스타', '이탈리안', '와인바', '조용한', '카페', '디저트', '스테이크'],
    '드라이브': ['뷰', '오션뷰', '루프탑', '외곽', '호수', '전망대', '남양주', '가평', '양평', '포천', '강화', '해안도로', '해변', '강변', '국도'],
    '맛집': ['맛집', '미식', '로컬', '노포', '삼겹살', '파스타', '스테이크', '고기', '다이닝', '식당', '음식점', '한식', '양식', '일식', '중식', '갈비', '해물', '횟집', '초밥', '피자', '버거', '분식', '레스토랑'],
    '야경': ['루프탑', '야경', '전망', '스카이', '와인바', '칵테일', '타워', '한강', '남산', '일몰', '노을'],
    '루프탑': ['루프탑', '야경', '테라스', '라운지', '칵테일', '와인', '오션뷰', '전망', '스카이', '옥상'],
    '힐링': ['숲', '공원', '식물원', '스파', '온천', '자연', '힐링', '한옥', '정원', '산책'],
    '오마카세': ['스시', '한우', '오마카세', '일식', '다이닝', '코스요리', '초밥', '가이세키', '갓포', '맡김차림'],
    '와인': ['와인', 'wine', '와인바', '내추럴와인', '글라스와인', '비스트로', '다이닝바', '양식', '이탈리안', '프렌치', '스테이크', '파스타', '샤퀴테리'],
    '스파': ['스파', '온천', '마사지', '찜질방', '사우나', '테르메덴', '아쿠아필드', '피부관리', '헤드스파', '에스테틱', '노천탕', '족욕'],
    '공방': ['공방', '원데이', '원데이클래스', '도자기', '도예', '향수공방', '드로잉', '베이킹', '가죽공방', '유리공예', '반지공방', '목공'],
    '액티비티': ['액티비티', '루지', '서핑', '요트', '패러글라이딩', '케이블카', '짚라인', '클라이밍', '카약', '레일바이크', '모노레일', '수상레저', '스포츠'],
    '반려동물': ['반려', '애견', '펫', '동반', '야외', '테라스', '공원'],
    '애견': ['반려', '애견', '펫', '동반', '야외', '테라스', '공원'],
    '호텔': ['호텔', '스테이', '호캉스', '리조트', '라운지', '스파', '다이닝', '오크우드', '하얏트', '메리어트', '시그니엘', '신라', '조선'],
    '호캉스': ['호텔', '스테이', '호캉스', '리조트', '라운지', '수영장', '카바나', '스파', '하얏트', '메리어트', '시그니엘', '신라'],
    '숙소': ['호텔', '스테이', '리조트', '펜션', '글램핑', '한옥', '게스트하우스', '숙박'],
    '글램핑': ['글램핑', '캠핑', '캠크닉', '카라반', '야영'],
  };

  const cleanTargetForMatching = (kw: string, text: string): string => {
    if (kw === '스파') {
      return text.replace(/스파게티|인스파이어|에스파스|예스파크/g, '');
    }
    if (kw === '디저트카페' || kw === '카페') {
      return text.replace(/만화카페|보드카페|보드게임|룸카페|키즈카페|애견카페|고양이카페|드로잉카페/g, '');
    }
    return text;
  };

  for (const [kw, syns] of Object.entries(NATURAL_CONTEXT_MAP)) {
    if (cleanQ.includes(kw) || kw.includes(cleanQ)) {
      const sanitizedText = cleanTargetForMatching(kw, targetText);
      if (syns.some((syn) => sanitizedText.includes(syn.toLowerCase()))) {
        return true;
      }
    }
  }

  const matchedQuickTag = POPULAR_QUICK_TAGS.find(
    (t) =>
      cleanQ.includes(t.query.toLowerCase()) ||
      t.query.toLowerCase().includes(cleanQ) ||
      t.label.replace(/[#·,/\\]/g, ' ').trim().toLowerCase() === cleanQ
  );

  if (matchedQuickTag && matchedQuickTag.synonyms.length > 0) {
    const sanitizedText = cleanTargetForMatching(matchedQuickTag.query, targetText);
    const hasSynonymMatch = matchedQuickTag.synonyms.some((syn) =>
      sanitizedText.includes(syn.toLowerCase())
    );
    if (hasSynonymMatch) return true;
  }

  // 4. 일반 토큰 검색 (모든 단어가 포함되거나, 분리된 토큰 중 핵심 단어가 매칭)
  const tokens = cleanQ.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  // 단일 토큰이면 부분 일치 검사
  if (tokens.length === 1) {
    return targetText.includes(tokens[0]);
  }

  // 다중 토큰이면 모든 토큰이 포함되거나 첫 번째 주요 토큰이 포함되면 통과
  return tokens.every((t) => targetText.includes(t)) || tokens.some((t) => t.length >= 2 && targetText.includes(t));
}

/**
 * 검색 매칭 시 슬롯 라벨 옆에 노출할 감성 스마트 뱃지 정보 반환
 * - 사용자가 직접 입력한 검색어를 온전히 보존하면서
 * - 복합어 우선순위 계층(체험/놀거리 -> 공방 -> 반려동물 -> 음식 -> 주류 -> 카페 등)에 맞춰 찰떡 이모지 할당
 */
function getSearchMatchBadge(query: string): { icon: string; label: string } {
  const rawQ = query.replace(/[#·,/\\]/g, ' ').trim();
  const cleanQ = rawQ.toLowerCase();

  // 1. 특수 복합어 / 체험 / 놀거리 (보드카페, 만화카페, 방탈출, VR 등)
  if (['보드카페', '보드게임', '만화카페', '방탈출', '룸카페', 'vr', '사격', '카트', '목장', '이색체험', '이색'].some((k) => cleanQ.includes(k))) {
    return { icon: '🎯', label: rawQ };
  }
  // 2. 공방 / 아트 / 원데이 클래스 (드로잉카페, 도자기카페, 향수공방 등)
  if (['드로잉카페', '도자기카페', '공방카페', '공방', '원데이', '도예', '향수', '가죽', '터프팅', '유리', '반지', '목공', '베이킹'].some((k) => cleanQ.includes(k))) {
    return { icon: '🎨', label: rawQ };
  }
  // 3. 반려동물 / 동물 체험
  if (['애견카페', '고양이카페', '동물카페', '펫카페', '반려동물', '애견', '고양이', '펫'].some((k) => cleanQ.includes(k))) {
    return { icon: '🐾', label: rawQ };
  }
  // 4. 음식 / 미식 (스파게티, 파스타, 스테이크, 삼겹살, 맛집, 피자 등)
  if (['스파게티', '파스타', '스테이크', '고기', '삼겹살', '맛집', '미식', '노포', '식당', '음식점', '피자', '버거', '초밥', '횟집', '갈비', '다이닝', '한식', '양식', '일식', '중식'].some((k) => cleanQ.includes(k))) {
    return { icon: '🍴', label: rawQ };
  }
  // 5. 오마카세 / 스시 코스
  if (['오마카세', '스시', '가이세키', '맡김차림', '코스요리'].some((k) => cleanQ.includes(k))) {
    return { icon: '🍣', label: rawQ };
  }
  // 6. 와인 / 비스트로
  if (['와인', 'wine', '와인바', '비스트로', '샤퀴테리'].some((k) => cleanQ.includes(k))) {
    return { icon: '🍷', label: rawQ };
  }
  // 7. 위스키 / LP바
  if (['위스키', 'whisky', '몰트', '하이볼', 'lp바', '스피크이지'].some((k) => cleanQ.includes(k))) {
    return { icon: '🥃', label: rawQ };
  }
  // 8. 칵테일 / 라운지
  if (['칵테일', 'cocktail', '라운지', '믹솔로지'].some((k) => cleanQ.includes(k))) {
    return { icon: '🍸', label: rawQ };
  }
  // 9. 순수 디저트 / 베이커리 / 카페
  if (['디저트', '베이커리', '빵', '케이크', '소금빵', '베이글', '타르트', '도넛', '마카롱', '스콘', '크루아상', '빙수', '찻집', '다실', '카페', '커피', '브런치'].some((k) => cleanQ.includes(k))) {
    return { icon: '🍰', label: rawQ };
  }
  // 10. 비 / 실내 (오탐 가드)
  if (['비오는', '비 오는', '실내데이트', '실내', '비'].some((k) => cleanQ.includes(k))) {
    if (!['비비큐', '비스트로', '비빔밥', '비엔나'].some((k) => cleanQ.includes(k))) {
      return { icon: '🌧️', label: rawQ };
    }
  }
  // 11. 스파 / 온천 / 힐링 (오탐 가드)
  if (['스파', '온천', '찜질', '사우나', '테르메덴', '아쿠아필드', '마사지', '족욕', '에스테틱', '피부관리', '헤드스파'].some((k) => cleanQ.includes(k))) {
    if (!['스파게티', '인스파이어', '에스파스'].some((k) => cleanQ.includes(k))) {
      return { icon: '♨️', label: rawQ };
    }
  }
  // 12. 루프탑 / 전망
  if (['루프탑', '테라스', '스카이', '전망', '옥상', '뷰', '오션뷰', '리버뷰'].some((k) => cleanQ.includes(k))) {
    return { icon: '🏙️', label: rawQ };
  }
  // 13. 야경 / 노을
  if (['야경', '노을', '일몰', '선셋', '달빛'].some((k) => cleanQ.includes(k))) {
    return { icon: '🌙', label: rawQ };
  }
  // 14. 액티비티 / 스포츠
  if (['액티비티', '서핑', '요트', '루지', '클라이밍', '짚라인', '케이블카', '수상레저', '패러글라이딩', '트레킹'].some((k) => cleanQ.includes(k))) {
    return { icon: '🏄', label: rawQ };
  }
  // 15. 드라이브
  if (['드라이브', '해안도로', '외곽', '전망대'].some((k) => cleanQ.includes(k))) {
    return { icon: '🚗', label: rawQ };
  }
  // 16. 성수 및 로컬 핫플
  if (['성수', '서울숲', '뚝섬', '연무장길'].some((k) => cleanQ.includes(k))) {
    return { icon: '✨', label: rawQ };
  }

  return { icon: '✨', label: rawQ };
}

/**
 * 앵커 기반 근접 코스 생성 (물리적 거리 및 자치구 클러스터링).
 * 1) 검색어(searchQuery)가 있는 경우 해당 키워드 매칭 스팟을 앵커로 최우선 선정
 * 2) 켠 슬롯 중 후보 수가 가장 적은(단, 1개 이상) 슬롯을 앵커로 랜덤 선택
 * 3) 나머지 슬롯은 앵커와의 거리(5~10km) 및 자치구 기준으로 밀착 선택
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
  const query = opts.searchQuery?.trim();
  const catKey = opts.categoryKey && opts.categoryKey !== 'ALL' ? opts.categoryKey : null;
  const categoryDef = catKey ? SPOT_EXPLORE_CATEGORIES.find((c) => c.key === catKey) : null;

  let anchorSlot: SlotKey | null = null;
  let anchorPool: Spot[] = [];

  // 1. 검색어가 있는 경우: 검색어 매칭 스팟을 보유한 슬롯 중 앵커 후보 최우선 탐색 (분위기 제약 완화)
  if (query) {
    // 1-1. 현재 활성화된 슬롯 중에서 매칭 스팟 탐색
    for (const slot of slotsOn) {
      // 검색어가 있을 때는 mood 제약 없이 해당 지역/존의 스팟 풀에서 폭넓게 검색
      const candidates = excludeRecent(getCandidates(all, slot, regionKeys, 'ALL', [], zoneKeys), avoid);
      const matched = candidates.filter((s) => matchesSearchQuery(s, query));
      if (matched.length > 0 && (anchorSlot === null || matched.length < anchorPool.length)) {
        anchorSlot = slot;
        anchorPool = matched;
      }
    }

    // 1-2. 현재 활성 슬롯에서 못 찾았으나 전체 슬롯(stay 포함) 중 매칭 스팟이 있는 경우
    if (anchorPool.length === 0) {
      for (const slot of SLOT_ORDER) {
        const candidates = excludeRecent(getCandidates(all, slot, regionKeys, 'ALL', [], zoneKeys), avoid);
        const matched = candidates.filter((s) => matchesSearchQuery(s, query));
        if (matched.length > 0 && (anchorSlot === null || matched.length < anchorPool.length)) {
          anchorSlot = slot;
          anchorPool = matched;
          if (!slotsOn.includes(slot)) {
            slotsOn.push(slot);
          }
        }
      }
    }
  } else if (categoryDef && categoryDef.keywords) {
    // 1-3. 카테고리 칩이 선택된 경우: 카테고리 키워드 매칭 스팟을 보유한 슬롯 앵커 최우선 탐색
    for (const slot of slotsOn) {
      const candidates = excludeRecent(getCandidates(all, slot, regionKeys, moodKey, [], zoneKeys), avoid);
      const matched = candidates.filter((s) => {
        const text = [s.name, s.category, s.summary, ...(s.signature_items || []), ...(s.mood_tags || [])].join(' ').toLowerCase();
        return categoryDef.keywords!.some((kw) => text.includes(kw.toLowerCase()));
      });
      if (matched.length > 0 && (anchorSlot === null || matched.length < anchorPool.length)) {
        anchorSlot = slot;
        anchorPool = matched;
      }
    }
  }

  // 2. 검색어 매칭이 없거나 검색어가 비어있는 경우: 기존 앵커 로직(최소 후보 슬롯) 적용
  if (anchorSlot === null || anchorPool.length === 0) {
    for (const slot of slotsOn) {
      const candidates = excludeRecent(getCandidates(all, slot, regionKeys, moodKey, [], zoneKeys), avoid);
      if (candidates.length > 0 && (anchorSlot === null || candidates.length < anchorPool.length)) {
        anchorSlot = slot;
        anchorPool = candidates;
      }
    }
  }

  const picked: number[] = [];
  const pickedSpots: Spot[] = [];
  let anchorSpot: Spot | null = null;
  if (anchorSlot !== null) {
    const anchor = pickRandom(anchorPool, rng);
    if (anchor) {
      picked.push(anchor.id);
      pickedSpots.push(anchor);
      anchorSpot = anchor;
    }
  }

  return slotsOn.map((slot) => {
    if (slot === anchorSlot) return { slot, spotId: anchorSpot ? anchorSpot.id : null };
    // 숙박 반경 판정용 기준점 — 앵커에 좌표가 없으면 이미 고른 스텝 중 좌표가 있는 것을 쓴다
    // (좌표 없는 앵커 하나 때문에 숙박이 통째로 '후보 없음'이 되는 것을 방지)
    const geoAnchor =
      anchorSpot && anchorSpot.lat != null && anchorSpot.lng != null
        ? anchorSpot
        : (pickedSpots.find((s) => s.lat != null && s.lng != null) ?? anchorSpot);
    const candidates = excludeRecent(
      getCandidates(all, slot, regionKeys, moodKey, picked, zoneKeys, geoAnchor),
      avoid,
    );
    const chosen = pickNearRandom(candidates, anchorSpot, rng);
    if (chosen) {
      picked.push(chosen.id);
      pickedSpots.push(chosen);
    }
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
  if (regionKeys.length === 0) return '전국 어디서나';
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
  if (moodKey === 'ALL') return '모든 분위기';
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

  // 6. 긴 업종/체험/패키지/상품/SEO 키워드 다이어트
  const descriptorRegex =
    /\s+(VIP|VVIP|프리미엄|명품|수제|원데이클래스|원데이\s*클래스|클래스|아틀리에|갤러리|스튜디오|살롱|공방|옻칠|나전칠기|도자기|가죽공방|도예공방|체험장|체험관|투어|산책로|산책코스|야시장|먹거리|거리|골목|본점|직영점|요트|보트|샴페인|라운지|바베큐|바베큐장|테라스|그릴|다이닝|루프탑|루프탑가든|디너|런치|오마카세|코스요리|패키지|렌탈|이용권|피크닉|캠크닉|캠핑|글램핑|스파|사우나|감성|칵테일|와인|위스키|주점|호프|데이트|핫플|분위기좋은|분위기|추천|맛집|셀프사진관|놀거리|커피디저트).*$/i;
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

  // 8-8. 일반명사/업종명 형태의 상호명인 경우 동/도로명 정밀 결합 (검색 결과 수백 개 발산 방지)
  const GENERIC_NOUNS = ['요리', '다이닝', '식당', '카페', '커피', '베이커리', '바', '펍', '파스타', '스테이크', '브런치', '공방', '스튜디오', '글램핑', '펜션', '야장', '포차'];
  const isGenericName = GENERIC_NOUNS.some((gn) => cleanName === gn || cleanName.includes(gn)) || cleanName.length <= 4;

  if (isGenericName && spot.address) {
    const dongRoadMatch = spot.address.match(/([가-힣0-9]+(?:동|읍|면|로[0-9]*길|[0-9]+길))/);
    if (dongRoadMatch && !cleanName.includes(dongRoadMatch[1])) {
      cleanName = `${cleanName} ${dongRoadMatch[1]}`.trim();
    }
  }

  return cleanName || spot.name.trim();
}

/** 스폿의 네이버/카카오 지도 바로가기 URL — 좌표 핀포인트 결합으로 100% 단독 상세 오픈 */
function naverMapUrl(spot: Spot): string {
  // 1. 공식 네이버 지도 단축 링크(naver.me)는 최우선 신뢰
  if (spot.source?.url && spot.source.url.includes('naver.me/')) {
    return spot.source.url;
  }
  // 2. 카카오맵 정식 플레이스 상세 링크인 경우
  if (spot.social_links?.kakaomap?.url) {
    const ku = spot.social_links.kakaomap.url;
    if (ku.includes('place.map.kakao.com/') || ku.includes('map.kakao.com/link/map/')) {
      return ku;
    }
  }
  // 3. 좌표(lng, lat)가 있는 경우, 네이버 지도 좌표 중심 파라미터(?c=lng,lat,16...)를 결합하여 동명 매장 오인식 방지 및 1순위 단독 플레이스 상세 오픈
  const q = encodeURIComponent(mapQuery(spot));
  if (spot.lat && spot.lng) {
    return `https://map.naver.com/p/search/${q}?c=${spot.lng},${spot.lat},16,0,0,0,dh`;
  }
  return `https://map.naver.com/p/search/${q}`;
}



/** 뉴스/사건사고/방송사 채널 등 데이트에 부적합한 영상 필터링 블랙리스트 */
const DISALLOWED_YOUTUBE_KEYWORDS = [
  'ytn', 'kbs', 'sbs', 'mbc', 'jtbc', '연합뉴스', '뉴스', 'news',
  'tv조선', '채널a', 'mbn', 'yonhap', '사건', '사고', '체포', '경찰',
  '화재', '논란', '날씨', '속보', '단독', '현장출동', '특보', '취재', '고발',
  '블랙박스', '한문철', '사망', '폭행', '살인', '음주운전', '재판', '구속'
];

/** 검증된 미식/여행/데이트 전문 크리에이터 및 브이로그 큐레이션 채널 키워드 */
const VERIFIED_YOUTUBE_CREATORS = [
  '더들리', '성시경', '또간집', '마리아주', '비밀이야', '김사원세끼', '맛상무', '정육왕', '오사사',
  '빅페이스', '윤호찌', '먹보스', '맛객리우', '츄릅켠', '수코', '딤디', '혬복', '슛뚜', '여락이들',
  '제이림', '나강', '트래블러조', '밍키', '자몽부부', '소소한날', '가든스테이', '또떠남', '체크인',
  '여행에미치다', '데이트립', '제주에딧', '부산언니', '동그라미', 'vlog', '브이로그', '데이트', '여행',
  '김pd', '산타윤', '게츠와', '유리소리', '봄비', '핫플', '카페', '맛집', '코스'
];

/** 검증된 고품질 최신 유튜브 데이트 핫클립/브이로그인지 엄격 판정 (검증 채널/브이로그 포용 & 뉴스/사건사고 철저 배제) */
function isValidYoutubeHotclip(yt?: { url?: string; title?: string; views?: number; likes?: number; published_at?: string; channel?: string } | null): boolean {
  if (!yt || !yt.url) return false;

  const title = (yt.title || '').toLowerCase();
  const channel = (yt.channel || '').toLowerCase();
  const published = (yt.published_at || '').toLowerCase();
  const combined = `${title} ${channel} ${yt.url} ${published}`;

  // 1. 뉴스/사건사고/블랙박스 영상 철저 배제
  if (DISALLOWED_YOUTUBE_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()))) {
    return false;
  }

  // 2. 2년 이상 지난 오래된 영상 배제 (2023년 이전 과거 영상 필터링)
  const stalePatterns = ['2018', '2019', '2020', '2021', '2022', '2023', '3년 전', '4년 전', '5년 전', '6년 전', '7년 전', '8년 전', '9년 전', '10년 전'];
  if (stalePatterns.some((sp) => combined.includes(sp))) {
    return false;
  }

  // 3. 조회수 및 채널 품질 검증
  const views = Number(yt.views) || 0;
  const likes = Number(yt.likes) || 0;

  // 3-1. 대형 바이럴 영상 (1만 뷰 이상 또는 500 좋아요 이상)은 즉시 통과
  if (views >= 10000 || likes >= 500) {
    return true;
  }

  // 3-2. 검증된 크리에이터/채널이거나 여행·데이트 브이로그인 경우 (1,000 뷰 이상 또는 100 좋아요 이상 또는 스팟 직결 수집)
  const isVerifiedCreator = VERIFIED_YOUTUBE_CREATORS.some((vc) => combined.includes(vc.toLowerCase()));
  if (isVerifiedCreator && (views >= 500 || likes >= 50 || yt.url.includes('youtube.com'))) {
    return true;
  }

  // 3-3. 기본 뷰 1,000회 이상
  if (views >= 1000) {
    return true;
  }

  return false;
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

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://uyhwhnnzzfhtxjernfit.supabase.co';

/** Groq 키를 프론트 번들에 노출하지 않기 위한 Supabase Edge Function 프록시 엔드포인트 */
const AI_BRIEFING_ENDPOINT = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/ai-briefing`;
/** 프록시 주소가 확보된 경우에만 AI 브리핑을 시도한다 (실패 시 로컬 템플릿 폴백) */
const AI_BRIEFING_ENABLED = Boolean(SUPABASE_URL);

const aiStoryCache = new Map<string, string>();

interface AiBriefingSpot {
  slot: string;
  name: string;
  category: string;
  summary: string;
  location?: string;
  parking_type?: string;
  price_tier?: string;
  signature_items?: string[];
  curation_badges?: import('./supabase').CurationBadges;
}

/**
 * Supabase Edge Function(ai-briefing) 프록시를 통해 AI 에디터 코스 브리핑 생성
 * 프롬프트·모델·API 키는 전부 서버가 보유하며, v4.0 메타데이터(주차, 가격대, 시그니처 메뉴, 블루리본/미쉐린 인증)를
 * 서버로 안전하게 전달하여 고감도 에디토리얼 브리핑을 생성한다.
 * 호출 실패 시 null을 반환하여 로컬 템플릿(generateCourseStory) 폴백에 위임한다.
 */
/**
 * AI 브리핑 및 코스 스토리의 문어체/해라체 종결어미를 감각적이고 다정한 에디토리얼 어조로 자동 교정
 */
function normalizeEditorialTone(text: string): string {
  if (!text) return '';

  let normalized = text
    .replace(/^["'“”]/, '')
    .replace(/["'“”]$/, '')
    .replace(/\*\*/g, '')
    .trim();

  // 문장 끝 및 문장 중간의 딱딱한 문어체/해라체 종결어미 교정 테이블
  const replacements: [RegExp, string][] = [
    [/마무리한다([.!?\s]|$)/g, '마무리하기 좋은 데이트 코스예요!$1'],
    [/남긴다([.!?\s]|$)/g, '남길 수 있어요.$1'],
    [/맞이한다([.!?\s]|$)/g, '맞이할 수 있어요.$1'],
    [/이어간다([.!?\s]|$)/g, '이어져 추천해요!$1'],
    [/선사한다([.!?\s]|$)/g, '선사해줘요.$1'],
    [/채운다([.!?\s]|$)/g, '채워보세요.$1'],
    [/즐긴다([.!?\s]|$)/g, '즐기기 제격이에요.$1'],
    [/보낸다([.!?\s]|$)/g, '보내보세요.$1'],
    [/만끽한다([.!?\s]|$)/g, '만끽해보세요.$1'],
    [/어우러진다([.!?\s]|$)/g, '어우러질 수 있어요.$1'],
    [/집중한다([.!?\s]|$)/g, '집중해보세요.$1'],
    [/기억된다([.!?\s]|$)/g, '기억될 거예요.$1'],
    [/도달한다([.!?\s]|$)/g, '도달할 수 있어요.$1'],
    [/전달한다([.!?\s]|$)/g, '전해져요.$1'],
    [/완성한다([.!?\s]|$)/g, '완성해보세요.$1'],
    [/시작한다([.!?\s]|$)/g, '시작해보세요.$1'],
    [/이끈다([.!?\s]|$)/g, '이끌어줘요.$1'],
    [/돋보인다([.!?\s]|$)/g, '돋보여요.$1'],
    [/느낀다([.!?\s]|$)/g, '느낄 수 있어요.$1'],
    [/빠져든다([.!?\s]|$)/g, '빠져들 수 있어요.$1'],
    [/머문다([.!?\s]|$)/g, '머물러보세요.$1'],
  ];

  for (const [pattern, target] of replacements) {
    normalized = normalized.replace(pattern, target);
  }

  // 혹시라도 남아있는 일반 '~한다.' 패턴 처리
  normalized = normalized.replace(/([가-힣]{2,})한다\./g, '$1해요.');

  return normalized.trim();
}

async function fetchAiBriefing(
  steps: CourseStep[],
  byId: Map<number, Spot>,
  moodKey: string,
): Promise<string | null> {
  const filled = steps.filter((st): st is CourseStep & { spotId: number } => st.spotId !== null);
  if (filled.length === 0) return null;

  const cacheKey = `${moodKey}_${filled.map((s) => s.spotId).join('-')}`;
  if (aiStoryCache.has(cacheKey)) {
    return normalizeEditorialTone(aiStoryCache.get(cacheKey)!);
  }

  if (!AI_BRIEFING_ENABLED) {
    return null;
  }

  const spots: AiBriefingSpot[] = [];
  for (const st of filled) {
    const s = byId.get(st.spotId);
    if (!s) continue;

    let parking = s.parking_type || '';
    if (!parking && s.parking_info?.type) {
      const pType = s.parking_info.type;
      parking = pType === 'valet' ? '발렛' : pType === 'free' ? '무료주차' : pType === 'paid' ? '유료주차' : '';
    }

    spots.push({
      slot: SLOT_META[st.slot].label,
      name: s.name,
      category: s.category || '',
      summary: s.summary || '',
      location: s.area || s.location || '',
      parking_type: parking || undefined,
      price_tier: s.price_tier || undefined,
      signature_items: Array.isArray(s.signature_items) && s.signature_items.length > 0 ? s.signature_items.slice(0, 3) : undefined,
      curation_badges: s.curation_badges && Object.keys(s.curation_badges).length > 0 ? s.curation_badges : undefined,
    });
  }
  if (spots.length === 0) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500); // 3.5초 타임아웃 (프록시 왕복 1단계 반영)

    const anonKey =
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5aHdobm56emZodHhqZXJuZml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MjAyNzcsImV4cCI6MjEwMjQ5NjI3N30.RobNIWS0QWNu6clFQuBHwVmr9gqbgBEUeWf8jwPCkns';

    const res = await fetch(AI_BRIEFING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ spots, mood: moodKey }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const rawText = typeof data?.text === 'string' ? data.text.trim() : '';
      if (rawText.length >= 15) {
        const cleanText = normalizeEditorialTone(rawText);
        aiStoryCache.set(cacheKey, cleanText);
        return cleanText;
      }
    }
  } catch {
    // 타임아웃·네트워크 오류·429 등 모든 실패는 조용히 null 반환 (로컬 템플릿 폴백)
  }

  return null;
}

/**
 * 완성된 코스의 슬롯별 스팟들을 종합 분석하여 감성 매거진 에디토리얼 스타일의 10가지 다채로운 브리핑 생성
 * v4.0 메타데이터(블루리본/미쉐린 인증, 시그니처 메뉴, 발렛/주차 편의, 가격대)를 반영한 스마트 폴백 템플릿
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
    const badge = spot.curation_badges?.blue_ribbon
      ? '블루리본 서베이가 인정한 '
      : spot.curation_badges?.michelin
      ? '미쉐린 가이드에 선정된 '
      : '';
    const sig = spot.signature_items && spot.signature_items.length > 0
      ? `대표 시그니처(${spot.signature_items[0]})와 함께 `
      : '';
    const singleStyles = [
      `${badge}남다른 감각과 무드가 돋보이는 ${wrap(spot.name)}에서 ${sig}오롯이 둘만의 시간에 집중해보세요.`,
      `공간 그 자체로 특별한 영감을 전하는 ${wrap(spot.name)}에서의 여유롭고 감각적인 순간이에요.`,
      `취향을 섬세하게 어루만지는 ${wrap(spot.name)}에서 잊지 못할 깊은 여운을 만끽해보세요.`,
    ];
    return singleStyles[idSum % singleStyles.length];
  }

  // v4.0 메타데이터 하이라이트 팁 (블루리본/미쉐린, 시그니처 메뉴, 발렛/주차)
  const allSpots = [day, eve, night, stay].filter((sp): sp is Spot => Boolean(sp));
  const gourmetSpot = allSpots.find((sp) => sp.curation_badges?.blue_ribbon || sp.curation_badges?.michelin);
  const valetSpot = allSpots.find((sp) => sp.parking_type?.includes('발렛') || sp.parking_info?.type === 'valet');
  const signatureSpot = allSpots.find((sp) => sp.signature_items && sp.signature_items.length > 0);

  let metaTip = '';
  if (gourmetSpot) {
    const badgeLabel = gourmetSpot.curation_badges?.michelin ? '미쉐린 가이드' : '블루리본 서베이';
    metaTip = ` ${badgeLabel} 인증을 받은 ${wrap(gourmetSpot.name)}의 정갈한 미식이 코스의 깊이를 더해줘요.`;
  } else if (valetSpot) {
    metaTip = ` ${wrap(valetSpot.name)}의 편리한 발렛 주차 지원으로 드라이브 데이트도 한결 여유로워요.`;
  } else if (signatureSpot && signatureSpot.signature_items && signatureSpot.signature_items.length > 0) {
    metaTip = ` ${wrap(signatureSpot.name)}에서는 대표 시그니처인 ${signatureSpot.signature_items[0]}을(를) 추천해요.`;
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

  // 10가지 다채로운 에디토리얼 추천 스타일 패턴 (0 ~ 9)
  const pattern = idSum % 10;

  switch (pattern) {
    // 0. 공간의 감각 & 템포 연결형
    case 0: {
      const parts: string[] = [];
      if (day) parts.push(`${wrap(day.name)}의 여유로운 낮 햇살`);
      if (eve) parts.push(`${wrap(eve.name)}에서 마주하는 정갈한 미식`);
      if (night) parts.push(`${wrap(night.name)}의 은은한 조명 아래 낭만으로 물드는 밤`);
      if (stay) parts.push(`${wrap(stay.name)}에서 누리는 아늑한 여운`);
      return `${parts.join(', ')}이 조화롭게 어우러져 두 사람의 특별한 하루를 완성하기 좋은 데이트 코스입니다.${metaTip ? metaTip : ''}`;
    }

    // 1. 에디토리얼 스토리텔링형
    case 1: {
      if (day && eve && night) {
        return `${wrap(day.name)}에서 나누는 설레는 대화가 ${wrap(eve.name)}의 근사한 테이블로, 그리고 ${wrap(night.name)}의 감미로운 무드로 자연스레 이어져 적극 추천해요!${metaTip}`;
      }
      if (day && eve) {
        return `${wrap(day.name)}의 여유로운 감성에서 시작해 ${wrap(eve.name)}의 황홀한 맛으로 이어지는 감각적인 데이트 코스예요.${metaTip}`;
      }
      if (eve && night) {
        return `${wrap(eve.name)}의 로맨틱한 식사 뒤에 ${wrap(night.name)}에서 깊어가는 밤의 낭만을 오롯이 맞이할 수 있어요.${metaTip}`;
      }
      break;
    }

    // 2. 공간 미학과 감정선 중심형
    case 2: {
      const segments: string[] = [];
      if (day) segments.push(`햇살이 머무는 ${wrap(day.name)}의 여유`);
      if (eve) segments.push(`${wrap(eve.name)}에서 나누는 특별한 한 끼`);
      if (night) segments.push(`${wrap(night.name)}에서 이어지는 둘만의 밀도 높은 대화`);
      if (stay) segments.push(`${wrap(stay.name)}에서의 온전한 쉼`);
      return `${segments.join(', ')}으로 이어져 둘만의 깊은 교감을 나누기에 참 좋아요. ${metaTip ? metaTip.trim() : defaultClosing}`;
    }

    // 3. 시적 계절감 & 빛의 흐름형
    case 3: {
      const lights: string[] = [];
      if (day) lights.push(`오후의 따스한 볕을 품은 ${wrap(day.name)}`);
      if (eve) lights.push(`노을빛 아래 그윽해지는 ${wrap(eve.name)}`);
      if (night) lights.push(`달빛 아래 잔잔한 속삭임이 맴도는 ${wrap(night.name)}`);
      if (stay) lights.push(`별빛을 마주하는 ${wrap(stay.name)}`);
      return `${lights.join('부터 ')}까지, 시간의 결을 따라 자연스럽게 어우러질 수 있는 로맨틱한 하루예요.${metaTip}`;
    }

    // 4. 취향 & 큐레이션 찬사형
    case 4: {
      const tastes: string[] = [];
      if (day) tastes.push(`${wrap(day.name)}의 감각적인 무드`);
      if (eve) tastes.push(`${wrap(eve.name)}의 섬세한 요리`);
      if (night) tastes.push(`${wrap(night.name)}의 아늑한 온기`);
      if (stay) tastes.push(`${wrap(stay.name)}의 편안한 휴식`);
      return `${tastes.join('와 ')}가 섬세하게 어우러져 두 사람의 취향을 온전히 만족시킬 셀렉션이라 강력 추천해요!${metaTip}`;
    }

    // 5. 일상 탈출 & 몰입형
    case 5: {
      const escapes: string[] = [];
      if (day) escapes.push(`${wrap(day.name)}에서 찾는 작은 쉼`);
      if (eve) escapes.push(`${wrap(eve.name)}의 깊은 풍미`);
      if (night) escapes.push(`${wrap(night.name)}의 은은한 밤공기`);
      if (stay) escapes.push(`${wrap(stay.name)}에서의 하룻밤`);
      return `도심의 번잡함을 벗어나 ${escapes.join(', 그리고 ')}에 오롯이 빠져보는 낭만적인 시간으로 맞이할 수 있어요.${metaTip}`;
    }

    // 6. 시네마틱 모먼트형
    case 6: {
      if (day && eve && night) {
        return `${wrap(day.name)}의 기분 좋은 시작, ${wrap(eve.name)}에서 마주하는 설레는 순간, ${wrap(night.name)}의 감미로운 음악이 더해져 영화 속 한 장면처럼 기억될 데이트 코스입니다.${metaTip}`;
      }
      if (day && eve) {
        return `${wrap(day.name)}에서 빚어낸 미소와 ${wrap(eve.name)}에서의 로맨틱한 순간이 오래도록 기분 좋은 여운으로 어우러질 수 있어요.${metaTip}`;
      }
      if (eve && night) {
        return `${wrap(eve.name)}의 황홀한 테이블과 ${wrap(night.name)}의 반짝이는 밤 풍경이 한 편의 영화처럼 이어져 추천해요!${metaTip}`;
      }
      break;
    }

    // 7. 비밀스러운 아지트 & 낭만형
    case 7: {
      const spots: string[] = [];
      if (day) spots.push(`둘만의 아지트 같은 ${wrap(day.name)}`);
      if (eve) spots.push(`정성 어린 요리가 있는 ${wrap(eve.name)}`);
      if (night) spots.push(`시간이 멈춘 듯 아늑한 ${wrap(night.name)}`);
      if (stay) spots.push(`프라이빗한 쉼터 ${wrap(stay.name)}`);
      return `${spots.join(', ')}에서 다른 누구에게도 방해받지 않는 둘만의 따스한 온기를 만끽해보세요.${metaTip}`;
    }

    // 8. 오감 자극 미식 & 감성형
    case 8: {
      const senses: string[] = [];
      if (day) senses.push(`${wrap(day.name)}의 향긋한 티타임`);
      if (eve) senses.push(`${wrap(eve.name)}에서 느껴지는 정갈한 미식`);
      if (night) senses.push(`${wrap(night.name)}의 감미로운 한잔`);
      if (stay) senses.push(`${wrap(stay.name)}의 포근한 침구`);
      return `${senses.join('과 ')}으로 두 사람의 하루를 기분 좋게 채워줄 감각적인 코스라 더욱 추천해요 ✨${metaTip}`;
    }

    // 9. 기억 & 영원성형
    case 9:
    default: {
      const memories: string[] = [];
      if (day) memories.push(`${wrap(day.name)}에서 피어난 다정한 미소`);
      if (eve) memories.push(`${wrap(eve.name)}의 따뜻한 식탁`);
      if (night) memories.push(`${wrap(night.name)}의 깊은 밤하늘`);
      if (stay) memories.push(`${wrap(stay.name)}의 고요한 아침`);
      return `${memories.join('가 ')} 하나로 이어져, 두 사람에게 가장 소중한 계절의 한 페이지로 기록될 특별한 여정이에요.${metaTip}`;
    }
  }

  // 폴백
  const firstSpot = byId.get(filled[0].spotId);
  const lastSpot = byId.get(filled[filled.length - 1].spotId);
  if (firstSpot && lastSpot) {
    return `${wrap(firstSpot.name)}부터 ${wrap(lastSpot.name)}까지 감각적인 무드가 자연스럽게 흐르는 완벽한 데이트예요.${metaTip}`;
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
  const aiStory = await fetchAiBriefing(steps, byId, moodKey);
  // AI 프록시 실패/타임아웃 시 로컬 템플릿으로 폴백 (복사 텍스트에 null 노출 방지)
  const story = aiStory || generateCourseStory(steps, byId, moodKey, false);

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
    const ytObj = spot.social_links?.youtube;
    if (isValidYoutubeHotclip(ytObj) && ytObj?.url) {
      const shortYt = await shortenUrl(ytObj.url);
      lines.push(`• 영상: ${shortYt}`);
    }
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

/**
 * 시간대(낮/밤) 및 세션별 다채로운 감성 서술형 검색 플레이스홀더 반환
 */
function getDynamicSearchPlaceholder(): string {
  const hour = new Date().getHours();
  const isNight = hour >= 18 || hour < 5;

  const dayPlaceholders = [
    '어디로 갈까요? 설레는 데이트 장소를 검색해보세요',
    '어디로 갈까요? 원하는 지역과 분위기를 찾아보세요',
    '어디로 갈까요? 취향에 꼭 맞는 스팟을 찾아보세요',
    '어디로 갈까요? 가고 싶은 동네나 메뉴를 입력해보세요',
    '어디로 갈까요? 따뜻한 커피와 감성 스팟을 찾아보세요',
    '어디로 갈까요? 오늘 둘만의 특별한 공간을 찾아보세요',
  ];

  const nightPlaceholders = [
    '어디로 갈까요? 설레는 데이트 장소를 검색해보세요',
    '어디로 갈까요? 오늘 밤 로맨틱한 와인바나 야경을 찾아보세요',
    '어디로 갈까요? 분위기 좋은 디너와 핫플을 검색해보세요',
    '어디로 갈까요? 취향에 꼭 맞는 스팟을 찾아보세요',
    '어디로 갈까요? 오늘 밤 둘만의 특별한 공간을 찾아보세요',
  ];

  const pool = isNight ? nightPlaceholders : dayPlaceholders;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}


// --- 내 위치 중심 맞춤 추천 코스 & 실시간 앰비언트 티커 -------------------------

let userCoords: { lat: number; lng: number } | null = null;

export interface LiveAmbientInfo {
  emoji: string;
  title: string;
  subtitle: string;
}

/**
 * 실시간 시간대 및 앰비언트 감성 정보 산출
 */
function getLiveAmbientInfo(): LiveAmbientInfo {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) {
    return { emoji: '🥐', title: '상쾌한 브런치 & 모닝 데이트', subtitle: '지금 가기 좋은 코스' };
  } else if (hour >= 12 && hour < 17) {
    return { emoji: '☀️', title: '데이트하기 딱 좋은 오후', subtitle: '실시간 감성 코스 추천' };
  } else if (hour >= 17 && hour < 21) {
    return { emoji: '🌇', title: '노을빛 로맨틱 디너 타임', subtitle: '분위기 맛집 & 야경 코스' };
  } else {
    return { emoji: '🌙', title: '둘만의 특별한 밤', subtitle: '와인바 & 심야 드라이브' };
  }
}

/**
 * 내 위치 중심 / 실시간 추천 코스 생성 (실제 생활권 반경 기준)
 */
function buildNearbyCourse(coords: { lat: number; lng: number } | null): {
  label: string;
  steps: CourseStep[];
  distKm?: number;
  ambient: LiveAmbientInfo;
} {
  let pool = spots;
  const ambient = getLiveAmbientInfo();
  let distKm: number | undefined;

  if (coords && coords.lat && coords.lng) {
    const spotsWithDist = spots
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({ spot: s, dist: getDistanceKm(coords.lat, coords.lng, s.lat!, s.lng!) }))
      .sort((a, b) => a.dist - b.dist);

    if (spotsWithDist.length >= 10) {
      // 내 위치에서 반경 10km 이내 우선 (최소 15개 확보), 부족하면 최단거리 상위 25개 선별
      const within10km = spotsWithDist.filter((s) => s.dist <= 10.0);
      const selectedPool = within10km.length >= 12 ? within10km : spotsWithDist.slice(0, 25);
      pool = selectedPool.map((item) => item.spot);
    }
  }

  // 사용자가 설정한 현재 활성 슬롯(기본: 낮/저녁/밤)을 그대로 적용
  const slotsOn = activeSlots().length > 0 ? activeSlots() : (['day', 'evening', 'night'] as SlotKey[]);
  const steps = generateCourse(pool, slotsOn, state.regions, state.mood, { searchQuery: state.searchQuery, categoryKey: state.spotCategory }, state.subZones);

  // 코스에 포함된 실제 스팟들의 내 위치 기준 최대 이동 반경(Max Distance) 계산
  if (coords && coords.lat && coords.lng) {
    const courseSpots = steps
      .map((st) => (st.spotId != null ? spotById.get(st.spotId) : null))
      .filter((s): s is Spot => Boolean(s && s.lat != null && s.lng != null));

    if (courseSpots.length > 0) {
      distKm = Math.round(getDistanceKm(coords.lat, coords.lng, courseSpots[0].lat!, courseSpots[0].lng!) * 10) / 10;
    }
  }

  const label = distKm != null ? `${ambient.emoji} ${ambient.title} · 1차 스팟 ${distKm}km ➔` : `${ambient.emoji} ${ambient.title} · ${ambient.subtitle} ➔`;

  return { label, steps, distKm, ambient };
}

/** 현재 위치(GPS) 또는 1차 스팟으로 출발하는 출발지 안내 디바이더 */
function renderUserOriginTransitDivider(firstStep: CourseStep): string {
  if (!firstStep || firstStep.spotId === null) return '';
  const s = spotById.get(firstStep.spotId);
  if (!s) return '';

  if (userCoords && userCoords.lat && userCoords.lng && s.lat && s.lng) {
    const dist = getDistanceKm(userCoords.lat, userCoords.lng, s.lat, s.lng);
    let distanceText = '';
    let timeText = '';
    let icon = '🚶‍♂️';

    if (dist < 1.0) {
      const meters = Math.round(dist * 1000);
      const walkMin = Math.max(1, Math.round(dist * 15));
      distanceText = `${meters}m`;
      timeText = `도보 약 ${walkMin}분`;
      icon = '🚶‍♂️';
    } else if (dist < 30.0) {
      const carMin = Math.max(3, Math.round((dist / 25) * 60 + 3));
      distanceText = `${dist.toFixed(1)}km`;
      timeText = `차량·이동 약 ${carMin}분`;
      icon = '🚗';
    } else {
      const hours = (dist / 60).toFixed(1);
      distanceText = `${dist.toFixed(0)}km`;
      timeText = `차량 약 ${hours}시간`;
      icon = '🚗';
    }

    const naviUrl = `https://map.naver.com/p/directions/${userCoords.lng},${userCoords.lat},${encodeURIComponent('내위치')}/${s.lng},${s.lat},${encodeURIComponent(s.name)}/-/${dist < 1.0 ? 'walk' : 'transit'}`;

    return `
      <div class="step-transit-divider origin-start">
        <div class="step-transit-line"></div>
        <a class="step-transit-badge" href="${escapeHtml(naviUrl)}" target="_blank" rel="noopener noreferrer" aria-label="내 위치에서 ${escapeHtml(s.name)} 길찾기">
          <span class="step-transit-icon">🚩 ${icon}</span>
          <span class="step-transit-time">내 위치 출발 · ${escapeHtml(timeText)}</span>
          <span class="step-transit-dist">(${escapeHtml(distanceText)})</span>
          <span class="step-transit-arrow" aria-hidden="true">↗</span>
        </a>
        <div class="step-transit-line"></div>
      </div>
    `;
  }

  // GPS 좌표 취득 전이거나 미허용 시에도 1차 스팟 원터치 길찾기 딥링크 제공
  const naviUrl = s.lat && s.lng
    ? `https://map.naver.com/p/search/${encodeURIComponent(mapQuery(s))}`
    : naverMapUrl(s);

  return `
    <div class="step-transit-divider origin-start">
      <div class="step-transit-line"></div>
      <a class="step-transit-badge" href="${escapeHtml(naviUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(s.name)} 길찾기 및 지도 보기">
        <span class="step-transit-icon">🚩 📍</span>
        <span class="step-transit-time">1차 데이트 시작 · ${escapeHtml(s.name)}</span>
        <span class="step-transit-arrow" aria-hidden="true">↗</span>
      </a>
      <div class="step-transit-line"></div>
    </div>
  `;
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

export type ThemeMode = 'light' | 'dark' | 'auto';
const THEME_STORAGE_KEY = 'oneul_theme_mode';

interface AppState {
  mainMode: 'course' | 'spots';
  slots: Record<SlotKey, boolean>;
  /** 선택된 지역 키 다중 선택 — 빈 배열이면 '전체' */
  regions: string[];
  /** 선택된 세부 인기 데이트존 키 다중 선택 — 빈 배열이면 '제한 없음' */
  subZones: string[];
  mood: string;
  /** 사용자 입력 키워드/상호명/카테고리 검색어 (코스 모드용) */
  searchQuery: string;
  /** 스팟 탐색 모드: 전용 검색어 */
  spotSearchQuery: string;
  /** 스팟 탐색 모드: 선택된 카테고리 필터 (ALL, CAFE, DINING, WINE, EXPERIENCE, NIGHT, SPA, DRIVE) */
  spotCategory: string;
  /** 스팟 탐색 모드: GPS 반경 거리 필터 (단위: km, 기본 3.0km, 0은 전체) */
  spotDistanceRadius: number;
  /** 스팟 탐색 모드: 정렬 (distance: 거리순, popular: 인기/핫플순, curation: 블루리본/미쉐린순) */
  spotSort: 'distance' | 'popular' | 'curation';
  /** 스팟 탐색 모드: 한 번에 표시할 열(행) 개수 (2, 3, 5개행, 기본값: 3) */
  spotGridCols: 2 | 3 | 5;
  /** 스팟 탐색 모드: 노출 페이지네이션 */
  spotPage: number;
  /** 테마 모드: light(낮, 기본값) | dark(밤) | auto(시스템) */
  themeMode: ThemeMode;
  course: CourseStep[] | null;
  /** 코스 생성 시점의 조건 스냅샷 — 교체 후보·저장·복사가 이 조건 기준으로 동작 */
  courseConditions: { regions: string[]; subZones: string[]; mood: string; searchQuery?: string } | null;
  savedOpen: boolean;
  regionSheetOpen: boolean;
  moodSheetOpen: boolean;
  activeRegionTab: string;
}

/** 저장된 테마 모드 불러오기 (기본값: 'light' 낮 테마) */
function getInitialThemeMode(): ThemeMode {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'auto') {
    return saved;
  }
  return 'light';
}

/** 기본 시간대 슬롯 반환 (낮 | 저녁 | 밤 기본 선택, 숙박 제외) */
function getDefaultSlots(): Record<SlotKey, boolean> {
  return { day: true, evening: true, night: true, stay: false };
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
  mainMode: 'course',
  slots: getDefaultSlots(),
  regions: ['SEOUL'],
  subZones: [],
  mood: 'ALL',
  searchQuery: '',
  spotSearchQuery: '',
  spotCategory: 'ALL',
  spotDistanceRadius: 3.0,
  spotSort: 'distance',
  spotGridCols: 3,
  spotPage: 1,
  themeMode: getInitialThemeMode(),
  course: null,
  courseConditions: null,
  savedOpen: false,
  regionSheetOpen: false,
  moodSheetOpen: false,
  activeRegionTab: 'SEOUL',
};

let spotById = new Map<number, Spot>(spots.filter((s) => typeof s.id === 'number').map((s) => [s.id, s]));

function activeSlots(): SlotKey[] {
  return SLOT_ORDER.filter((k) => state.slots[k]);
}

declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v0.9.17';

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
// 테마 관리 — 낮(기본) | 밤 | 시스템 3단 전환
// ---------------------------------------------------------------------------

function getThemeModeLabel(mode: ThemeMode): string {
  switch (mode) {
    case 'light':
      return '☀️ 낮';
    case 'dark':
      return '🌙 밤';
    case 'auto':
      return '⚙️ 시스템';
  }
}

function applyTheme(mode: ThemeMode, notify = false): void {
  state.themeMode = mode;
  localStorage.setItem(THEME_STORAGE_KEY, mode);

  const isSysDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = mode === 'auto' ? (isSysDark ? 'dark' : 'light') : mode;

  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-theme-resolved', resolved);

  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) {
    themeBtn.textContent = getThemeModeLabel(mode);
  }

  // 모바일 브라우저 상단 상태바 테마 컬러 동기화
  const metaTheme = document.querySelector('meta[name="theme-color"]:not([media])');
  if (metaTheme) {
    metaTheme.setAttribute('content', resolved === 'dark' ? '#0b0f17' : '#f5f6f8');
  }

  if (notify) {
    const msg =
      mode === 'light'
        ? '☀️ 산뜻한 낮 테마가 적용되었어요'
        : mode === 'dark'
        ? '🌙 은은한 밤 테마가 적용되었어요'
        : isSysDark
        ? '⚙️ 시스템 설정에 맞춰 밤 테마가 적용되었어요'
        : '⚙️ 시스템 설정에 맞춰 낮 테마가 적용되었어요';
    showToast(msg);
  }
}

function cycleThemeMode(): void {
  const nextMode: ThemeMode =
    state.themeMode === 'light' ? 'dark' : state.themeMode === 'dark' ? 'auto' : 'light';
  applyTheme(nextMode, true);
}

// ---------------------------------------------------------------------------
// 렌더 — 영역별 분할 (앱 셸은 1회, 오늘의코스/조건/결과/오버레이는 개별 재렌더)
// ---------------------------------------------------------------------------

const app = document.getElementById('app')!;

function renderShell(): void {
  // 앱 시작 시 테마 즉시 적용 (기본값: light 낮 테마)
  applyTheme(state.themeMode, false);

  app.innerHTML = `
    <header class="topbar">
      <h1 class="app-title"><a href="#" class="app-title-link" id="brand-home-link" aria-label="오늘 데이트 홈으로 이동">오늘 데이트</a></h1>
      <div class="topbar-actions">
        <button class="btn-theme-toggle" id="btn-theme-toggle" aria-label="테마 변경">${getThemeModeLabel(state.themeMode)}</button>
        <button class="btn-saved" id="btn-open-saved">저장한 코스</button>
      </div>
    </header>
    <nav class="main-mode-nav" id="main-mode-nav"></nav>
    <section class="today-course-area" id="today-area"></section>
    <section class="conditions" id="conditions-area"></section>
    <section class="results" id="results-area"></section>
    <section class="spot-discovery-area" id="spot-discovery-area" style="display: none;"></section>
    <footer class="app-footer">
      <p class="footer-copy">오늘 데이트 <span class="footer-version">${APP_VERSION}</span></p>
      <p class="footer-sub">검증된 스팟만 골라 담은 오늘의 데이트 코스</p>
    </footer>
    <div class="overlay-root" id="overlay-root"></div>
  `;
  document.getElementById('brand-home-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearCourseHash();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    cycleThemeMode();
  });
  document.getElementById('btn-open-saved')!.addEventListener('click', () => {
    state.savedOpen = true;
    renderOverlay();
  });
  renderMainModeNav();
  renderTodayCourse();
  renderConditions();
  renderResults();
  renderOverlay();
}

function renderMainModeNav(): void {
  const nav = document.getElementById('main-mode-nav');
  if (!nav) return;

  nav.innerHTML = `
    <div class="main-tab-bar" role="tablist">
      <button class="main-tab-btn ${state.mainMode === 'course' ? 'is-active' : ''}" id="tab-mode-course" role="tab" aria-selected="${state.mainMode === 'course'}">
        <span class="main-tab-emoji">✨</span>
        <span class="main-tab-label">맞춤 코스</span>
      </button>
      <button class="main-tab-btn ${state.mainMode === 'spots' ? 'is-active' : ''}" id="tab-mode-spots" role="tab" aria-selected="${state.mainMode === 'spots'}">
        <span class="main-tab-emoji">📍</span>
        <span class="main-tab-label">스팟 탐색</span>
        <span class="main-tab-badge">NEW</span>
      </button>
    </div>
  `;

  document.getElementById('tab-mode-course')?.addEventListener('click', () => {
    if (state.mainMode !== 'course') {
      state.mainMode = 'course';
      updateModeView();
    }
  });

  document.getElementById('tab-mode-spots')?.addEventListener('click', () => {
    if (state.mainMode !== 'spots') {
      state.mainMode = 'spots';
      updateModeView();
    }
  });
}

function updateModeView(): void {
  renderMainModeNav();
  const todayArea = document.getElementById('today-area');
  const conditionsArea = document.getElementById('conditions-area');
  const resultsArea = document.getElementById('results-area');
  const discoveryArea = document.getElementById('spot-discovery-area');

  if (state.mainMode === 'course') {
    if (todayArea) todayArea.style.display = '';
    if (conditionsArea) conditionsArea.style.display = '';
    if (resultsArea) resultsArea.style.display = '';
    if (discoveryArea) discoveryArea.style.display = 'none';
    renderConditions();
    renderResults();
  } else {
    if (todayArea) todayArea.style.display = 'none';
    if (conditionsArea) conditionsArea.style.display = 'none';
    if (resultsArea) resultsArea.style.display = 'none';
    if (discoveryArea) discoveryArea.style.display = '';
    renderSpotDiscovery();
  }
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
    <button class="live-ambient-ticker" id="btn-today-course" aria-label="실시간 맞춤 코스 불러오기">
      <span class="ticker-pulse" aria-hidden="true"></span>
      <span class="ticker-emoji">${initial.ambient.emoji}</span>
      <span class="ticker-title">${initial.ambient.title}</span>
      <span class="ticker-sep" aria-hidden="true">·</span>
      <span class="ticker-subtitle">${initial.distKm != null ? `1차 스팟 <strong>${initial.distKm}km</strong>` : initial.ambient.subtitle}</span>
      <span class="ticker-chevron" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </button>
  `;

  const btn = document.getElementById('btn-today-course');
  if (!btn) return;

  function applyCourse(steps: CourseStep[]) {
    state.course = steps.map((st) => ({ ...st }));
    state.courseConditions = {
      regions: [...state.regions],
      subZones: [...state.subZones],
      mood: state.mood,
      searchQuery: state.searchQuery,
    };

    renderConditions();
    renderResults();
  }

  btn.addEventListener('click', () => {
    if (!userCoords && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      const subSpan = btn.querySelector('.ticker-subtitle');
      if (subSpan) subSpan.textContent = '📍 내 위치 찾는 중...';

      let resolved = false;

      // 2.5초 자체 안전 타이머: 브라우저 GPS 무응답/지연 시 즉시 기본 코스로 안전 전환
      const timer = window.setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const fallback = buildNearbyCourse(null);
          applyCourse(fallback.steps);
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
            renderTodayCourse(); // 티커 거리 정보 실시간 갱신
            applyCourse(nearby.steps);
            showToast('📍 내 주변 실시간 추천 코스를 불러왔어요');
          },
          () => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(timer);
            const fallback = buildNearbyCourse(null);
            applyCourse(fallback.steps);
          },
          { timeout: 2500, maximumAge: 600000, enableHighAccuracy: false },
        );
      } catch {
        if (!resolved) {
          resolved = true;
          window.clearTimeout(timer);
          const fallback = buildNearbyCourse(null);
          applyCourse(fallback.steps);
        }
      }
    } else {
      const res = buildNearbyCourse(userCoords);
      applyCourse(res.steps);
      showToast('✨ 실시간 추천 코스를 불러왔어요');
    }
  });
}

// --- 조건 영역 (대안 2: 통합 검색창 + 1줄 셀렉터 바) ---------------------------------

function getRegionSelectorLabel(): { title: string; subtitle: string; isSelected: boolean } {
  if (state.regions.length === 0) {
    return { title: '전국 어디서나', subtitle: '대한민국 전체', isSelected: false };
  }
  const regionNames = state.regions
    .map((k) => REGIONS.find((r) => r.key === k)?.label || k)
    .join(', ');

  // 선택된 지역별로 전체 선택 여부 또는 개별 데이트존 판정
  const displayItems: string[] = [];
  let isAllRegionsFull = true;

  for (const regKey of state.regions) {
    const regLabel = REGIONS.find((r) => r.key === regKey)?.label || regKey;
    const subZonesInReg = POPULAR_ZONES.filter((z) => z.regionKey === regKey);
    const selectedZonesInReg = subZonesInReg.filter((z) => state.subZones.includes(z.key));

    // 해당 지역의 모든 데이트존이 선택되었거나, 세부존 지정 없이 지역만 선택된 경우 -> "XX 전체"
    if (
      (subZonesInReg.length > 0 && selectedZonesInReg.length === subZonesInReg.length) ||
      selectedZonesInReg.length === 0
    ) {
      displayItems.push(`${regLabel} 전체`);
    } else {
      isAllRegionsFull = false;
      selectedZonesInReg.forEach((z) => displayItems.push(z.label));
    }
  }

  // 표시 타이틀 생성
  let displayTitle = '';
  if (displayItems.length === 0) {
    displayTitle = regionNames;
  } else if (displayItems.length === 1) {
    displayTitle = displayItems[0];
  } else if (displayItems.length === 2) {
    displayTitle = displayItems.join(', ');
  } else {
    displayTitle = `${displayItems[0]} 외 ${displayItems.length - 1}곳`;
  }

  // 서브타이틀 생성
  let subtitle = regionNames;
  if (isAllRegionsFull) {
    subtitle = state.regions.length === 1 ? '해당 지역 전체' : `${state.regions.length}개 지역`;
  }

  return {
    title: displayTitle,
    subtitle,
    isSelected: true,
  };
}

function renderConditions(): void {
  const area = document.getElementById('conditions-area');
  if (!area) return;

  const regLabel = getRegionSelectorLabel();

  area.innerHTML = `
    <div class="conditions-card">
      <!-- 1. 통합 검색창 (스팟 탐색과 100% 동일) -->
      <div class="search-container" style="margin-bottom: var(--space-3);">
        <div class="search-box">
          <span class="search-input-icon">🔍</span>
          <input 
            type="search" 
            class="search-input" 
            id="search-input" 
            placeholder="${getDynamicSearchPlaceholder()}" 
            value="${escapeHtml(state.searchQuery)}"
            autocomplete="off"
            aria-label="데이트 코스 키워드 검색"
          />
          <button class="search-clear ${state.searchQuery ? 'is-visible' : ''}" id="search-clear" aria-label="검색어 지우기">✕</button>
        </div>
      </div>

      <!-- 2. 실시간 핫랭킹 큐레이션 테마 칩 바 (낮/밤 하루 2회 자동 최적화) -->
      <div class="spot-category-scroll" style="margin-bottom: var(--space-4);">
        ${getCuratedThemeChips().map((cat) => `
          <button class="spot-category-chip ${state.spotCategory === cat.key ? 'is-active' : ''}" data-cat-key="${cat.key}">
            <span class="chip-emoji">${cat.emoji}</span>
            <span class="chip-label">${cat.label}</span>
          </button>
        `).join('')}
      </div>

      <!-- 3. 컴팩트 1줄 컨트롤: [📍 지역 선택 캡슐] + [시간대 4종 토글] -->
      <div class="course-compact-controls" style="margin-bottom: var(--space-4);">
        <button class="btn-region-pill ${regLabel.isSelected ? 'is-selected' : ''}" id="btn-trigger-region" aria-haspopup="dialog">
          <span class="pill-icon">📍</span>
          <span class="pill-title">${escapeHtml(regLabel.title)}</span>
          <span class="pill-arrow" aria-hidden="true">▾</span>
        </button>

        <div class="slot-toggles-inline" role="group" aria-label="시간대 선택">
          ${SLOT_ORDER.map((k) => {
            const meta = SLOT_META[k];
            return `
              <button class="slot-toggle-inline ${state.slots[k] ? 'on' : ''}" data-slot="${k}" aria-pressed="${state.slots[k]}" title="${meta.label}">
                <span class="slot-emoji">${meta.emoji}</span>
                <span class="slot-text">${meta.label}</span>
              </button>`;
          }).join('')}
        </div>
      </div>

      <!-- 4. 코스 완성하기 버튼 -->
      <button class="btn-primary btn-generate" id="btn-generate">
        🚀 맞춤 데이트 코스 완성하기
      </button>
    </div>
  `;
  bindConditionEvents(area);
}

function bindConditionEvents(area: HTMLElement): void {
  // 검색창 입력 이벤트
  const searchInput = area.querySelector<HTMLInputElement>('#search-input');
  const clearBtn = area.querySelector<HTMLButtonElement>('#search-clear');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value.trim();
      if (clearBtn) {
        clearBtn.classList.toggle('is-visible', Boolean(state.searchQuery));
      }
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        state.searchQuery = searchInput.value.trim();
        triggerCourseGeneration();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.searchQuery = '';
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      clearBtn.classList.remove('is-visible');
      renderConditions();
    });
  }

  // 비주얼 분위기/카테고리 칩 클릭 이벤트
  area.querySelectorAll<HTMLButtonElement>('.spot-category-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const catKey = chip.dataset.catKey || 'ALL';
      state.spotCategory = catKey;
      if (catKey === 'ALL') {
        state.mood = 'ALL';
      }
      renderConditions();
      triggerCourseGeneration();
    });
  });

  // 인라인 슬롯 토글
  area.querySelectorAll<HTMLButtonElement>('.slot-toggle-inline').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.slot as SlotKey;
      state.slots[slot] = !state.slots[slot];
      renderConditions();
    });
  });

  // 지역 바텀시트 트리거
  area.querySelector('#btn-trigger-region')?.addEventListener('click', () => {
    state.regionSheetOpen = true;
    state.activeRegionTab = state.regions[0] || 'SEOUL';
    renderOverlay();
  });

  // 코스 만들기 버튼
  area.querySelector('#btn-generate')?.addEventListener('click', () => {
    triggerCourseGeneration();
  });
}

function triggerCourseGeneration(): void {
  // 숙박 키워드(호텔, 숙소, 호캉스, 리조트, 펜션, 글램핑) 검색 시 stay 슬롯 자동 활성화
  if (state.searchQuery && /호텔|숙소|숙박|호캉스|리조트|펜션|글램핑|스테이|모텔/.test(state.searchQuery)) {
    if (!state.slots.stay) {
      state.slots.stay = true;
      renderConditions();
    }
  }

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
    { avoidIds: recentSpotIdSet(), searchQuery: state.searchQuery, categoryKey: state.spotCategory },
    state.subZones,
  );
  state.courseConditions = {
    regions: [...state.regions],
    subZones: [...state.subZones],
    mood: state.mood,
    searchQuery: state.searchQuery,
  };
  addRecentSpotIds(courseSpotIds());
  renderResults();

  // 검색어가 포함된 경우 토스트 피드백
  if (state.searchQuery) {
    const hasMatchedSpot = state.course?.some((st) => {
      if (!st.spotId) return false;
      const spot = spotById.get(st.spotId);
      return spot ? matchesSearchQuery(spot, state.searchQuery) : false;
    });
    if (hasMatchedSpot) {
      showToast(`'${state.searchQuery}' 중심 맞춤 코스를 추천했어요`);
    } else {
      showToast(`'${state.searchQuery}' 매칭 스팟이 없어 인기 코스로 추천했어요`);
    }
  }
}


const ICON_REFRESH_SVG = `<svg class="icon-refresh" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`;
const ICON_SWAP_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`;
const ICON_YOUTUBE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
const ICON_KAKAO_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3c-5.523 0-10 3.582-10 8 0 2.828 1.838 5.308 4.622 6.726l-1.173 4.316c-.105.385.318.694.654.477l5.068-3.342c.271.015.548.023.829.023 5.523 0 10-3.582 10-8s-4.477-8-10-8z"/></svg>`;
const ICON_INSTA_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`;
const ICON_CATCHTABLE_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`;
const ICON_GOURMET_RIBBON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"/><path d="m8.21 13.89-1.71 8.61 5.5-3 5.5 3-1.71-8.61"/></svg>`;
const ICON_NAVER_MAP_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

/** 캐치테이블 매장 다이렉트 예약 링크 (DB에 실제 매장 URL이 수집된 경우에만 노출) */
function getCatchtableUrl(spot: Spot): string | null {
  const b = spot.booking_info?.url;
  if (b && (b.includes('catchtable.co.kr/ct/shop/') || b.includes('catchtable.net/'))) {
    return b;
  }
  const soc = spot.social_links?.catchtable?.url;
  if (soc && (soc.includes('catchtable.co.kr/ct/shop/') || soc.includes('catchtable.net/'))) {
    return soc;
  }
  const src = spot.source?.url;
  if (src && (src.includes('catchtable.co.kr/ct/shop/') || src.includes('catchtable.net/'))) {
    return src;
  }
  return null;
}

/** 카카오맵 매장 링크 생성 */
function getKakaomapUrl(spot: Spot): string {
  const kakao = spot.social_links?.kakaomap?.url;
  if (kakao) return kakao;
  return `https://map.kakao.com/link/search/${encodeURIComponent(mapQuery(spot))}`;
}

/** 인스타그램 공식 프로필 링크 (수집된 실제 계정이 있을 때만 노출) */
function getInstagramUrl(spot: Spot): string | null {
  const soc = spot.social_links?.instagram?.url;
  if (soc && soc.includes('instagram.com/')) return soc;
  const src = spot.source?.url;
  if (src && src.includes('instagram.com/')) return src;
  return null;
}

/** 미쉐린 / 블루리본 공식 가이드 평가 링크 생성 */
function getGourmetGuideUrl(spot: Spot): string | null {
  const name = mapQuery(spot);
  if (spot.curation_badges?.blue_ribbon) {
    return `https://www.bluer.co.kr/search?keyword=${encodeURIComponent(name)}`;
  }
  if (spot.curation_badges?.michelin) {
    return `https://guide.michelin.com/kr/ko/search?q=${encodeURIComponent(name)}`;
  }
  return null;
}

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
    initialStoryHtml = `“${escapeHtml(normalizeEditorialTone(aiStoryCache.get(cacheKey)!))}”`;
  } else if (AI_BRIEFING_ENABLED) {
    initialStoryHtml = `<span class="ai-loading-pulse">두 사람만을 위한 맞춤 코스 브리핑을 작성하고 있어요...</span>`;
  } else {
    initialStoryHtml = `“${normalizeEditorialTone(generateCourseStory(state.course, spotById, cond.mood, true))}”`;
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
      <p class="ai-briefing-text ${!hasCachedStory && AI_BRIEFING_ENABLED ? 'is-loading' : ''}" id="ai-briefing-content">${initialStoryHtml}</p>
    </div>
    <div class="step-list">
      ${state.course.length > 0 ? renderUserOriginTransitDivider(state.course[0]) : ''}
      ${state.course.map((step, i) => {
        const card = renderStepCard(step, i, { usedImages });
        let html = card;
        if (i === 1 && state.course && state.course.length >= 3) {
          html += renderNativeInfeedAdCard();
        }
        if (state.course && i < state.course.length - 1) {
          html += renderStepTransitDivider(step, state.course[i + 1]);
        }
        return html;
      }).join('')}
    </div>
    <div class="result-actions result-actions-3">
      <button class="btn-secondary" id="btn-copy">📋 복사</button>
      <button class="btn-secondary" id="btn-share-link">🔗 링크</button>
      <button class="btn-primary" id="btn-save">💾 저장</button>
    </div>
  `;
  bindResultEvents(area);
  initAdSense();

  // AI 브리핑 프록시 비동기 호출 (결과 도착 시 단 1회 최종 문장 렌더링)
  if (AI_BRIEFING_ENABLED && !hasCachedStory && state.course) {
    const currentCourse = state.course;
    fetchAiBriefing(currentCourse, spotById, cond.mood).then((aiText) => {
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
  compass: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
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

  if (combined.includes('루지') || combined.includes('서핑') || combined.includes('요트') || combined.includes('패러글라이딩') || combined.includes('짚라인') || combined.includes('케이블카') || combined.includes('클라이밍') || combined.includes('카약') || combined.includes('방탈출') || combined.includes('보드게임') || combined.includes('액티비티') || combined.includes('레저') || combined.includes('스포츠') || combined.includes('카트')) {
    return LUCIDE_ICONS.compass;
  }
  if (combined.includes('카페') || combined.includes('커피') || combined.includes('디저트') || combined.includes('베이커리') || combined.includes('tea') || combined.includes('cafe')) {
    return LUCIDE_ICONS.coffee;
  }
  if (combined.includes('바') || combined.includes('와인') || combined.includes('칵테일') || combined.includes('주점') || combined.includes('펍') || combined.includes('beer') || combined.includes('wine')) {
    return LUCIDE_ICONS.wine;
  }
  if (combined.includes('호텔') || combined.includes('숙박') || combined.includes('펜션') || combined.includes('리조트') || combined.includes('스테이') || slot === 'stay') {
    return LUCIDE_ICONS.bed;
  }
  if (combined.includes('미술관') || combined.includes('전시') || combined.includes('박물관') || combined.includes('갤러리') || combined.includes('공연') || combined.includes('영화') || combined.includes('공방') || combined.includes('체험') || combined.includes('도예') || combined.includes('도자기')) {
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
  activity: [
    'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=500&q=80&auto=format&fit=crop', // 서핑 & 파도
    'https://images.unsplash.com/photo-1540946485063-a40da27545f8?w=500&q=80&auto=format&fit=crop', // 오션 요트 세일링
    'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=500&q=80&auto=format&fit=crop', // 볼더링 클라이밍
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=500&q=80&auto=format&fit=crop', // 에메랄드 카약 투어
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80&auto=format&fit=crop', // 패러글라이딩 스카이
    'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=500&q=80&auto=format&fit=crop', // 아웃도어 스포츠 레저
  ],
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
  if (combined.includes('루지') || combined.includes('서핑') || combined.includes('요트') || combined.includes('패러글라이딩') || combined.includes('짚라인') || combined.includes('케이블카') || combined.includes('클라이밍') || combined.includes('카약') || combined.includes('방탈출') || combined.includes('보드게임') || combined.includes('액티비티') || combined.includes('레저') || combined.includes('스포츠') || combined.includes('카트')) {
    pool = CURATED_CATEGORY_IMAGES.activity;
  } else if (combined.includes('바') || combined.includes('와인') || combined.includes('칵테일') || combined.includes('주점') || combined.includes('펍')) {
    pool = CURATED_CATEGORY_IMAGES.bar;
  } else if (combined.includes('호텔') || combined.includes('숙박') || combined.includes('펜션') || combined.includes('리조트') || slot === 'stay') {
    pool = CURATED_CATEGORY_IMAGES.stay;
  } else if (combined.includes('미술관') || combined.includes('전시') || combined.includes('박물관') || combined.includes('갤러리') || combined.includes('공방') || combined.includes('문화') || combined.includes('도예') || combined.includes('도자기')) {
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

/** 
 * 멀티 수집 채널(유튜브·미식큐레이션·지도평점·블로그·종합지표) 독립 평가 기반
 * 어느 한쪽이라도 85점 이상인 독보적 핫플레이스 엄격 판정
 */
function isSuperHotSpot(spot: Spot): boolean {
  if (!spot) return false;

  // 1. 🎬 유튜브 바이럴 채널 점수 (0~100)
  let ytScore = 0;
  const yt = spot.social_links?.youtube;
  if (isValidYoutubeHotclip(yt)) {
    const views = Number(yt?.views) || 0;
    const likes = Number(yt?.likes) || 0;
    if (views >= 100000) ytScore = 100;
    else if (views >= 50000) ytScore = 85;
    else if (views >= 30000 && likes >= 500) ytScore = 85;
    else if (views >= 30000) ytScore = 75;
    else if (views >= 10000) ytScore = 60;
  }

  // 2. 🍷 미식·큐레이션 채널 점수 (0~100)
  let curationScore = 0;
  const srcNote = spot.source?.note || '';
  const badges = spot.curation_badges;
  const isMichelin = srcNote.includes('미쉐린') || !!badges?.michelin || 
    (Array.isArray(badges) && badges.includes('michelin'));
  const isBlueRibbon = srcNote.includes('블루리본') || !!badges?.blue_ribbon || 
    (Array.isArray(badges) && badges.includes('blue_ribbon'));
  const isCatchtable = spot.source?.type === 'catchtable_miner' || 
    spot.source?.url?.includes('catchtable') || !!badges?.catchtable ||
    (Array.isArray(badges) && badges.includes('catchtable'));

  if (isMichelin) curationScore = 100;
  else if (isBlueRibbon) curationScore = 90;
  else if (isCatchtable && (spot.verified || (spot.hot_score || 0) >= 60)) curationScore = 85;

  // 3. 🗺️ 지도 평점 채널 점수 (0~100)
  let mapScore = 0;
  const rating = spot.social_links?.kakaomap?.rating;
  if (rating) {
    if (rating >= 4.8) mapScore = 100;
    else if (rating >= 4.6) mapScore = 85;
    else if (rating >= 4.3) mapScore = 70;
  }

  // 4. 📝 블로그 감성 데이트 채널 점수 (0~100)
  let blogScore = 0;
  if (spot.source?.type === 'blog_mining' && spot.verified) {
    if (/(분위기|감성|소개팅|핫플|로스터리|와인|오마카세|루프탑)/.test(srcNote)) {
      if (ytScore >= 75) blogScore = 85;
      else blogScore = 65;
    }
  }

  // 5. 📊 플랫폼 종합 핫스코어 (0~100)
  const dbHotScore = spot.hot_score || 0;

  // 👉 어느 한 채널이라도 85점 이상이면 즉시 🔥 핫플 인정
  const maxScore = Math.max(ytScore, curationScore, mapScore, blogScore, dbHotScore);
  return maxScore >= 85;
}

/** 스팟의 실시간 종합 인기도 점수 계산 (핫플/인기순 정렬용) */
function getSpotPopularityScore(spot: Spot): number {
  if (!spot) return 0;
  let score = spot.hot_score || 50;

  // 1. 카카오맵 평점 가산
  const rating = spot.social_links?.kakaomap?.rating;
  if (rating) {
    if (rating >= 4.7) score += 35;
    else if (rating >= 4.5) score += 25;
    else if (rating >= 4.2) score += 15;
    else if (rating >= 4.0) score += 5;
  }

  // 2. 큐레이션 뱃지
  if (spot.curation_badges?.michelin) score += 40;
  if (spot.curation_badges?.blue_ribbon) score += 30;
  if (spot.curation_badges?.tour_api) score += 10;

  // 3. 유튜브 바이럴 가산
  if (isValidYoutubeHotclip(spot.social_links?.youtube)) {
    const views = spot.social_links?.youtube?.views || 0;
    if (views >= 100000) score += 35;
    else if (views >= 30000) score += 20;
    else if (views >= 10000) score += 10;
  }

  // 4. 검증된 스팟 가산
  if (spot.verified) score += 10;

  return score;
}

/**
 * 실시간 스팟 데이터 + 시간대(4단계) + 요일별(주말/평일) 트렌드 인텔리전스 핫랭킹 테마 칩 정렬
 */
export function getCuratedThemeChips(): SpotCategoryItem[] {
  const allItem = SPOT_EXPLORE_CATEGORIES.find((c) => c.key === 'ALL') || { key: 'ALL', label: '전체', emoji: '✨' };
  const themeItems = SPOT_EXPLORE_CATEGORIES.filter((c) => c.key !== 'ALL');

  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0: 일, 5: 금, 6: 토
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;

  const scoredThemes = themeItems.map((item) => {
    let score = 50;

    // 1. 실제 데이터 기반 인기도/신상 핫플 집계
    if (item.keywords && spots && spots.length > 0) {
      const matched = spots.filter((s) => {
        const text = [s.name, s.category, s.summary, ...(s.signature_items || []), ...(s.mood_tags || [])].join(' ').toLowerCase();
        return item.keywords!.some((kw) => text.includes(kw.toLowerCase()));
      });

      if (matched.length > 0) {
        // 상위 10개 핫플 평균 점수
        const topScores = matched
          .map((s) => getSpotPopularityScore(s))
          .sort((a, b) => b - a)
          .slice(0, 10);
        const avgTop = topScores.reduce((sum, v) => sum + v, 0) / topScores.length;
        score += avgTop;

        // 미쉐린 및 블루리본 스팟 보유 가중치
        const michelinCount = matched.filter((s) => s.curation_badges?.michelin).length;
        const blueRibbonCount = matched.filter((s) => s.curation_badges?.blue_ribbon).length;
        score += michelinCount * 12 + blueRibbonCount * 6;
      }
    }

    // 2. 시간대별(4단계) 라이프사이클 트렌드 가중치
    if (hour >= 6 && hour < 14) {
      // ☀️ 아침~점심 (06:00~13:59): 브런치, 카페, 숲산책, 문화, 드라이브
      if (item.key === 'BRUNCH') score += 55;
      else if (item.key === 'CAFE') score += 50;
      else if (item.key === 'HEALING') score += 40;
      else if (item.key === 'CULTURE') score += 35;
      else if (item.key === 'DRIVE') score += 30;
      else if (item.key === 'DINING') score += 25;
    } else if (hour >= 14 && hour < 18) {
      // 🌇 오후~노을 (14:00~17:59): 감성카페, 원데이공방, 오션뷰물멍, 문화, 드라이브
      if (item.key === 'CAFE') score += 50;
      else if (item.key === 'EXPERIENCE') score += 45;
      else if (item.key === 'OCEAN') score += 45;
      else if (item.key === 'CULTURE') score += 40;
      else if (item.key === 'DRIVE') score += 35;
      else if (item.key === 'DINING') score += 30;
    } else if (hour >= 18 && hour < 23) {
      // 🌙 저녁~프라임나이트 (18:00~22:59): 와인위스키, 로맨틱기념일, 야경루프탑, 미식, 이자카야
      if (item.key === 'WINE') score += 55;
      else if (item.key === 'ROMANTIC') score += 50;
      else if (item.key === 'NIGHT') score += 50;
      else if (item.key === 'DINING') score += 45;
      else if (item.key === 'PUB') score += 40;
      else if (item.key === 'OCEAN') score += 30;
    } else {
      // 🌌 심야~새벽 (23:00~05:59): 이자카야/펍, 야경, 와인, 호캉스/숙소, 드라이브
      if (item.key === 'PUB') score += 55;
      else if (item.key === 'NIGHT') score += 50;
      else if (item.key === 'WINE') score += 45;
      else if (item.key === 'STAY') score += 40;
      else if (item.key === 'DRIVE') score += 35;
      else if (item.key === 'SPA') score += 30;
    }

    // 3. 주말/평일 라이프스타일 가중치
    if (isWeekend) {
      if (item.key === 'DRIVE') score += 30;
      else if (item.key === 'STAY') score += 30;
      else if (item.key === 'OCEAN') score += 25;
      else if (item.key === 'EXPERIENCE') score += 25;
      else if (item.key === 'CULTURE') score += 20;
    } else {
      if (item.key === 'DINING') score += 25;
      else if (item.key === 'WINE') score += 25;
      else if (item.key === 'CAFE') score += 20;
      else if (item.key === 'PUB') score += 20;
      else if (item.key === 'SPA') score += 20;
    }

    return { item, score };
  });

  // 종합 핫니스 점수 내림차순 정렬
  scoredThemes.sort((a, b) => b.score - a.score);

  // '전체' 칩은 항상 맨 앞에 배치
  return [allItem, ...scoredThemes.map((st) => st.item)];
}

/** 스팟 간 이동 동선 및 원터치 길찾기 딥링크 디바이더 렌더링 */
function renderStepTransitDivider(prevStep: CourseStep, nextStep: CourseStep): string {
  if (!prevStep || !nextStep || prevStep.spotId === null || nextStep.spotId === null) {
    return '';
  }
  const s1 = spotById.get(prevStep.spotId);
  const s2 = spotById.get(nextStep.spotId);
  if (!s1 || !s2) return '';

  let distanceText = '';
  let timeText = '';
  let icon = '🚶‍♂️';

  if (s1.lat && s1.lng && s2.lat && s2.lng) {
    const dist = getDistanceKm(s1.lat, s1.lng, s2.lat, s2.lng);
    if (dist < 1.0) {
      const meters = Math.round(dist * 1000);
      const walkMin = Math.max(1, Math.round(dist * 15));
      distanceText = `${meters}m`;
      timeText = `도보 약 ${walkMin}분`;
      icon = '🚶‍♂️';
    } else if (dist < 30.0) {
      const carMin = Math.max(3, Math.round((dist / 25) * 60 + 3));
      distanceText = `${dist.toFixed(1)}km`;
      timeText = `차량·이동 약 ${carMin}분`;
      icon = '🚗';
    } else {
      const hours = (dist / 60).toFixed(1);
      distanceText = `${dist.toFixed(0)}km`;
      timeText = `차량 약 ${hours}시간`;
      icon = '🚗';
    }
  } else {
    timeText = '다음 코스로 이동';
    icon = '📍';
  }

  let naviUrl = '';
  if (s1.lat && s1.lng && s2.lat && s2.lng) {
    const mode = (getDistanceKm(s1.lat, s1.lng, s2.lat, s2.lng) < 1.0) ? 'walk' : 'transit';
    naviUrl = `https://map.naver.com/p/directions/${s1.lng},${s1.lat},${encodeURIComponent(s1.name)}/${s2.lng},${s2.lat},${encodeURIComponent(s2.name)}/-/${mode}`;
  } else {
    naviUrl = naverMapUrl(s2);
  }

  return `
    <div class="step-transit-divider">
      <div class="step-transit-line"></div>
      <a class="step-transit-badge" href="${escapeHtml(naviUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(s2.name)} 길찾기">
        <span class="step-transit-icon">${icon}</span>
        <span class="step-transit-time">${escapeHtml(timeText)}</span>
        ${distanceText ? `<span class="step-transit-dist">(${escapeHtml(distanceText)})</span>` : ''}
        <span class="step-transit-arrow" aria-hidden="true">↗</span>
      </a>
      <div class="step-transit-line"></div>
    </div>
  `;
}

/** 비정상적이거나 영문 태그 나열/판박이 템플릿인 summary를 감지하여 다채롭고 감각적인 에디토리얼 한줄 소개로 교정 */
function cleanSpotSummary(spot: Spot): string {
  const raw = (spot.summary || '').trim();
  const name = spot.name.trim();

  // 비정상 케이스 판별 (영문 태그 나열, 스팟명과 동일, 너무 짧거나 무의미한 텍스트, 과거 판박이 템플릿)
  const isBad =
    !raw ||
    raw.length < 5 ||
    raw.toLowerCase() === name.toLowerCase() ||
    /^[a-zA-Z_\s,]+$/.test(raw) ||
    raw.includes('trendy') ||
    raw.includes('romantic') ||
    raw.includes('healing') ||
    raw.includes('scenic') ||
    raw.includes('luxury') ||
    raw.includes('gourmet') ||
    raw.includes('active') ||
    raw.includes('cost_effective') ||
    raw.includes('골목의 남다른 감각과') ||
    raw.includes('남다른 감각과 로맨틱한 무드가') ||
    raw === '정보 없음' ||
    raw === '설명이 없습니다';

  if (!isBad) {
    return raw;
  }

  const area = spot.area && spot.area !== '전체' ? spot.area : (spot.location || '');
  const locPrefix = area ? `${area}에서 ` : '';
  const locIn = area ? `${area}의 ` : '';
  const cat = (spot.category || '').toLowerCase();
  const slot = spot.slot || 'day';
  const sig = spot.signature_items && spot.signature_items.length > 0 ? spot.signature_items[0] : '';
  const idHash = Math.abs(spot.id || name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));

  // 1. 시그니처 메뉴가 있는 경우
  if (sig) {
    const sigTemplates = [
      `${locPrefix}대표 메뉴 '${sig}'와 함께 감각적인 분위기를 즐기기 좋은 곳이에요.`,
      `${locIn}시그니처 '${sig}'의 특별한 풍미를 다정하게 만끽할 수 있는 명소예요.`,
      `${locPrefix}정성 담긴 '${sig}'와 함께 잊지 못할 미식 데이트를 즐겨보세요.`,
    ];
    return sigTemplates[idHash % sigTemplates.length];
  }

  // 2. 공인 뱃지(블루리본/미쉐린/관광공사)가 있는 경우
  if (spot.curation_badges?.blue_ribbon) {
    return `블루리본 서베이가 검증한 ${locIn}신뢰할 수 있는 대표 미식 스팟이에요.`;
  }
  if (spot.curation_badges?.michelin) {
    return `미쉐린 가이드에 등재된 ${locIn}격조 높은 맛과 정갈한 분위기의 명소예요.`;
  }
  if (spot.curation_badges?.tour_api) {
    return `한국관광공사가 인증한 ${locIn}사계절 언제 찾아도 매력적인 문화 관광지예요.`;
  }

  // 3. 업종(카테고리) 및 슬롯별 다채로운 에디토리얼 풀
  if (cat.includes('카페') || cat.includes('커피') || cat.includes('베이커리') || cat.includes('디저트') || cat.includes('찻집')) {
    const cafePool = [
      `${locPrefix}향긋한 커피와 달콤한 디저트로 여유로운 대화를 나누기 좋은 감성 카페예요.`,
      `${locIn}따스한 채광과 아늑한 인테리어 속에서 둘만의 힐링을 누릴 수 있는 곳이에요.`,
      `${locPrefix}갓 구운 빵의 고소한 향기와 감각적인 무드가 매력적인 베이커리 명소예요.`,
      `${locIn}감각적인 공간에서 특별한 티타임을 즐기며 쉬어가기 좋은 데이트 코스예요.`,
    ];
    return cafePool[idHash % cafePool.length];
  }

  if (cat.includes('주점') || cat.includes('와인') || cat.includes('칵테일') || cat.includes('이자카야') || cat.includes('포차') || cat.includes('펍') || cat.includes('호프') || cat.includes('바(bar)')) {
    const barPool = [
      `${locIn}은은한 조명 아래에서 로맨틱한 와인과 분위기를 만끽하기 좋은 다이닝 바예요.`,
      `${locPrefix}맛깔스러운 안주와 함께 다정하게 술잔을 기울이기 좋은 감성 주점이에요.`,
      `${locIn}감각적인 음악과 무드 속에서 둘만의 저녁 데이트를 완성하기 좋은 핫플레이스예요.`,
      `${locPrefix}도란도란 이야기를 나누며 하루의 피로를 기분 좋게 풀 수 있는 곳이에요.`,
    ];
    return barPool[idHash % barPool.length];
  }

  if (cat.includes('음식점') || cat.includes('한식') || cat.includes('양식') || cat.includes('일식') || cat.includes('중식') || cat.includes('레스토랑') || cat.includes('다이닝') || cat.includes('파스타') || cat.includes('스테이크') || cat.includes('초밥')) {
    const foodPool = [
      `${locPrefix}정성 가득한 요리와 함께 소중한 사람과 미식의 즐거움을 나누기 좋은 곳이에요.`,
      `${locIn}세련된 분위기 속에서 오붓하게 특별한 식사를 즐길 수 있는 추천 맛집이에요.`,
      `${locPrefix}신선한 재료와 정갈한 플레이팅으로 눈과 입이 모두 즐거운 다이닝 스팟이에요.`,
      `${locIn}아늑한 공간에서 둘만의 오붓한 데이트 디너를 만끽해보세요.`,
    ];
    return foodPool[idHash % foodPool.length];
  }

  if (cat.includes('미술관') || cat.includes('전시') || cat.includes('박물관') || cat.includes('갤러리') || cat.includes('문화') || cat.includes('공연') || cat.includes('서점')) {
    const culturePool = [
      `${locPrefix}감각적인 예술 작품과 영감을 함께 나누며 사색하기 좋은 문화 공간이에요.`,
      `${locIn}다채로운 전시와 볼거리를 감상하며 색다른 추억을 남길 수 있는 데이트 코스예요.`,
      `${locPrefix}조용히 거닐며 서로의 취향과 감상을 나누기 딱 좋은 힐링 명소예요.`,
    ];
    return culturePool[idHash % culturePool.length];
  }

  if (cat.includes('공원') || cat.includes('관광') || cat.includes('수목원') || cat.includes('식물원') || cat.includes('산책') || cat.includes('전망대') || cat.includes('야경') || cat.includes('호수') || cat.includes('해변')) {
    const naturePool = [
      `${locIn}탁 트인 풍경을 바라보며 손잡고 도란도란 산책하기 좋은 힐링 명소예요.`,
      `${locPrefix}사계절 자연의 정취와 함께 계절의 아름다움을 오롯이 느낄 수 있는 곳이에요.`,
      `${locIn}선선한 바람을 맞으며 낭만적인 풍경을 눈에 담기 좋은 감성 코스예요.`,
    ];
    return naturePool[idHash % naturePool.length];
  }

  if (cat.includes('공방') || cat.includes('체험') || cat.includes('원데이') || cat.includes('클래스') || cat.includes('스튜디오') || cat.includes('사진관') || cat.includes('액티비티') || cat.includes('클라이밍')) {
    const activePool = [
      `${locPrefix}둘만의 특별한 작품과 추억을 직접 만들며 웃음꽃을 피우기 좋은 이색 공방이에요.`,
      `${locIn}활동적인 체험과 함께 유쾌한 에너지를 듬뿍 채울 수 있는 이색 데이트 스팟이에요.`,
      `${locPrefix}소중한 순간을 예쁜 사진과 기념품으로 간직할 수 있는 명소예요.`,
    ];
    return activePool[idHash % activePool.length];
  }

  if (slot === 'stay' || cat.includes('호텔') || cat.includes('숙소') || cat.includes('펜션') || cat.includes('리조트') || cat.includes('스테이')) {
    const stayPool = [
      `${locIn}프라이빗하고 감각적인 인테리어 속에서 온전한 휴식을 누리기 좋은 감성 스테이예요.`,
      `${locPrefix}아늑하고 포근한 분위기 속에서 하루의 피로를 녹이며 힐링하기 좋은 숙소예요.`,
      `${locIn}로맨틱한 밤을 보내며 둘만의 소중한 시간을 간직할 수 있는 곳이에요.`,
    ];
    return stayPool[idHash % stayPool.length];
  }

  // 기본 폴백 (다양한 무드 풀)
  const defaultPool = [
    `${locIn}트렌디한 감성과 머무는 순간이 편안한 매력적인 데이트 장소예요.`,
    `${locPrefix}소소하지만 확실한 행복을 만끽할 수 있는 다정한 분위기의 공간이에요.`,
    `${locIn}남다른 개성과 아늑한 무드가 돋보이는 숨은 힐링 스팟이에요.`,
    `${locPrefix}사랑하는 사람과 함께 특별한 하루를 완성하기 좋은 추천 장소예요.`,
  ];
  return defaultPool[idHash % defaultPool.length];
}

/** 카드에 표시될 위치 정보 정제 (address / area / region 기반 정합성 보장) */
function getDisplayLocation(spot: Spot): string {
  const addr = (spot.address || '').trim();
  const reg = (spot.region || '').trim();
  const area = (spot.area || '').trim();
  const loc = (spot.location || '').trim();

  // 1. 주소에서 추출 가능한 정확한 시/군/구 우선
  if (addr) {
    const parts = addr.split(/\s+/);
    if (parts.length >= 2) {
      const city = parts[0];
      const dist = parts[1];
      // 광역시/도 및 구/시 조합
      if (['서울', '인천', '부산', '대구', '광주', '대전', '울산', '세종'].some(c => city.includes(c))) {
        return `${city.slice(0, 2)} ${dist}`;
      }
      if (parts.length >= 3 && (dist.endsWith('시') || dist.endsWith('군'))) {
        return `${city.slice(0, 2)} ${dist} ${parts[2].endsWith('구') ? parts[2] : ''}`.trim();
      }
      return `${city.slice(0, 2)} ${dist}`;
    }
  }

  // 2. region / area 정합성 확인
  if (reg && area && area !== '전체') {
    return `${reg} ${area}`;
  }

  return loc || addr || '대한민국';
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
        <p class="step-empty-msg">${
          step.slot === 'stay'
            ? '이 조건에 맞는 숙소를 찾지 못했어요'
            : '이 조건에 맞는 장소를 찾지 못했어요'
        }</p>
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
  const isHot = isSuperHotSpot(spot);

  // v4.0 큐레이션 뱃지
  const curationBadges: string[] = [];
  if (spot.curation_badges?.blue_ribbon) {
    curationBadges.push(`<span class="badge-curation badge-blueribbon">🎀 블루리본</span>`);
  }
  if (spot.curation_badges?.michelin) {
    curationBadges.push(`<span class="badge-curation badge-michelin">⭐ 미쉐린</span>`);
  }
  if (spot.curation_badges?.tour_api) {
    curationBadges.push(`<span class="badge-curation badge-tourapi">🏛️ 관광공사</span>`);
  }
  if (spot.curation_badges?.catchtable) {
    curationBadges.push(`<span class="badge-curation badge-catchtable">🍷 캐치테이블</span>`);
  }

  // v4.0 주차 & 가격 메타 뱃지
  const metaBadges: string[] = [];
  const pType = spot.parking_info?.type || spot.parking_type;
  if (pType === 'valet') {
    metaBadges.push(`<span class="badge-meta badge-parking">🅿️ 발렛가능</span>`);
  } else if (pType === 'free') {
    metaBadges.push(`<span class="badge-meta badge-parking">🅿️ 무료주차</span>`);
  } else if (pType === 'paid') {
    metaBadges.push(`<span class="badge-meta badge-parking">🅿️ 주차가능</span>`);
  }

  if (spot.price_tier && spot.price_tier !== 'FREE') {
    metaBadges.push(`<span class="badge-meta badge-price">${spot.price_tier}</span>`);
  }

  // v4.0 실시간 예약 링크
  const bookingUrl = spot.reservation_url || spot.booking_info?.url;

  const thumbHtml = `
    <div class="step-thumb-col">
      ${isHot ? `<span class="badge-hot-floating">🔥 핫플</span>` : ''}
      <div class="step-fallback-box">${fallbackIcon}</div>
      <img class="step-thumb-img" src="${escapeHtml(targetImgUrl)}" alt="${escapeHtml(spot.name)}" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('is-loaded');" onerror="this.classList.add('is-hidden'); this.previousElementSibling?.classList.add('is-active');" />
    </div>`;

  return `
    <article class="step-card has-image">
      <div class="step-card-head">
        <div class="step-slot-wrap">
          <div class="step-slot">${meta.emoji} ${meta.label}</div>
          ${(() => {
            const currentQ = state.courseConditions?.searchQuery || state.searchQuery;
            if (currentQ && matchesSearchQuery(spot, currentQ)) {
              const badge = getSearchMatchBadge(currentQ);
              return `<span class="badge-search-match"><span class="badge-search-match-icon">${badge.icon}</span> ${escapeHtml(badge.label)}</span>`;
            }
            return '';
          })()}
        </div>
        ${themeText ? `<span class="step-slot-theme">${escapeHtml(themeText)}</span>` : ''}
      </div>
      <div class="step-card-split">
        ${thumbHtml}
        <div class="step-content-col">
          <h3 class="step-name">
            <span>${escapeHtml(spot.name)}</span>
            ${spot.verified ? `<span class="icon-verified-badge" aria-label="검증된 데이트 장소">${ICON_VERIFIED_CHECK_SVG}</span>` : ''}
          </h3>
          ${curationBadges.length > 0 ? `<div class="step-curation-row">${curationBadges.join('')}</div>` : ''}
          <p class="step-location">📍 ${escapeHtml(getDisplayLocation(spot))}</p>
          ${(() => {
            const sum = cleanSpotSummary(spot);
            return sum ? `<blockquote class="step-quote">“${escapeHtml(sum)}”</blockquote>` : '';
          })()}
          ${metaBadges.length > 0 ? `<div class="step-meta-row">${metaBadges.join('')}</div>` : ''}
          ${spot.price ? `<p class="step-price">${escapeHtml(spot.price)}</p>` : ''}
        </div>
      </div>
      <div class="step-actions-bar">
        <div class="step-actions-icons">
          ${swappable ? `<button class="btn-action-icon btn-swap-icon" data-step-index="${index}" aria-label="다시 추천">${ICON_SWAP_SVG}</button>` : ''}
          ${(() => {
            const yt = spot.social_links?.youtube;
            if (!isValidYoutubeHotclip(yt) || !yt?.url) return '';
            return `<a class="btn-action-icon btn-yt-icon" href="${escapeHtml(yt.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(spot.name)} 유튜브 핫클립">${ICON_YOUTUBE_SVG}</a>`;
          })()}
          ${(() => {
            const ctUrl = getCatchtableUrl(spot);
            if (!ctUrl) return '';
            return `<a class="btn-action-icon btn-ct-icon" href="${escapeHtml(ctUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(spot.name)} 캐치테이블 실시간 예약 및 메뉴">${ICON_CATCHTABLE_SVG}</a>`;
          })()}
          <a class="btn-action-icon btn-kakao-icon" href="${escapeHtml(getKakaomapUrl(spot))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(spot.name)} 카카오맵 열기">${ICON_KAKAO_SVG}</a>
          ${(() => {
            const insta = getInstagramUrl(spot);
            if (!insta) return '';
            return `<a class="btn-action-icon btn-insta-icon" href="${escapeHtml(insta)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(spot.name)} 인스타그램 공식 피드">${ICON_INSTA_SVG}</a>`;
          })()}
          ${(() => {
            const guideUrl = getGourmetGuideUrl(spot);
            if (!guideUrl) return '';
            const label = spot.curation_badges?.michelin ? '미쉐린 가이드 공식 평가' : '블루리본 서베이 공식 평가';
            return `<a class="btn-action-icon btn-guide-icon" href="${escapeHtml(guideUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(spot.name)} ${label}">${ICON_GOURMET_RIBBON_SVG}</a>`;
          })()}
        </div>
        <div class="step-actions-right">
          ${bookingUrl ? `<a class="step-book-chip" href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer" aria-label="캐치테이블 실시간 예약"><span>📅 예약</span></a>` : ''}
          <a class="step-map-chip" href="${naverMapUrl(spot)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(spot.name)} 네이버 지도 열기">
            ${ICON_NAVER_MAP_SVG}
            <span>지도</span>
          </a>
        </div>
      </div>
    </article>
  `;
}

function bindSwapButton(btn: HTMLButtonElement): void {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('is-spinning')) return;
    btn.classList.add('is-spinning');
    btn.disabled = true;
    setTimeout(() => {
      swapStep(Number(btn.dataset.stepIndex));
      btn.disabled = false;
      btn.classList.remove('is-spinning');
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
  const anchor = dominantAnchorSpot(state.course, spotById, index);
  const candidates = excludeRecent(
    getCandidates(spots, step.slot, cond.regions, cond.mood, courseSpotIds(), cond.subZones, anchor),
    recentSpotIdSet(),
  );
  const chosen = pickNearRandom(candidates, anchor);
  if (!chosen) {
    showToast(
      step.slot === 'stay'
        ? '이 조건에 맞는 다른 숙소를 찾지 못했어요'
        : '이 조건에 다른 추천 장소가 없어요',
    );
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

  const cardList = document.querySelectorAll<HTMLElement>('.step-list > .step-card:not(.ad-card)');
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
  newCard.addEventListener(
    'animationend',
    () => {
      newCard.classList.remove('swap-in');
    },
    { once: true },
  );
  targetCard.replaceWith(newCard);

  const newSwapBtn = newCard.querySelector<HTMLButtonElement>('.btn-swap, .btn-swap-icon');
  if (newSwapBtn) {
    bindSwapButton(newSwapBtn);
  }

  // 장소 변경 시 AI 브리핑 텍스트도 실시간 자동 갱신 (Race condition 방지)
  const briefingEl = document.getElementById('ai-briefing-content');
  if (briefingEl && state.courseConditions && state.course) {
    const mood = state.courseConditions.mood;
    const currentSpotKey = courseSpotIds().join('-');
    const cacheKey = `${mood}_${currentSpotKey}`;
    const currentCourse = [...state.course];

    if (aiStoryCache.has(cacheKey)) {
      briefingEl.innerHTML = `“${escapeHtml(normalizeEditorialTone(aiStoryCache.get(cacheKey)!))}”`;
      briefingEl.classList.remove('is-loading');
    } else if (AI_BRIEFING_ENABLED) {
      briefingEl.classList.add('is-loading');
      briefingEl.innerHTML = `<span class="ai-loading-pulse">새로운 코스에 맞춰 브리핑을 작성하고 있어요...</span>`;
      fetchAiBriefing(currentCourse, spotById, mood).then((aiText) => {
        const el = document.getElementById('ai-briefing-content');
        if (!el) return;
        // 응답 도착 시점의 코스가 요청 시점과 다르면 무시 (Race condition 방지)
        if (courseSpotIds().join('-') !== currentSpotKey) return;

        const finalText = normalizeEditorialTone(aiText || generateCourseStory(currentCourse, spotById, mood, false));
        el.style.opacity = '0';
        setTimeout(() => {
          el.classList.remove('is-loading');
          el.innerHTML = `“${escapeHtml(finalText)}”`;
          el.style.opacity = '1';
        }, 100);
      });
    } else {
      briefingEl.innerHTML = `“${normalizeEditorialTone(generateCourseStory(currentCourse, spotById, mood, true))}”`;
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
  area.querySelectorAll<HTMLButtonElement>('.btn-swap, .btn-swap-icon').forEach((btn) => {
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

// --- 스팟 집중 탐색 모드 (Spot Discovery) -------------------------------------------

function buildAnchorCourse(anchorSpot: Spot): CourseStep[] {
  const targetSlot = (anchorSpot.slot as SlotKey) || 'day';
  const slotsOn: SlotKey[] = ['day', 'evening', 'night'];
  const steps: CourseStep[] = [];

  for (const slot of slotsOn) {
    if (slot === targetSlot) {
      steps.push({ slot, spotId: anchorSpot.id });
    } else {
      const candidates = getCandidates(spots, slot, [], 'ALL', [], []);
      const nearby = candidates
        .filter((s) => s.id !== anchorSpot.id && isCourseEligible(s))
        .map((s) => ({
          spot: s,
          dist:
            anchorSpot.lat && anchorSpot.lng && s.lat && s.lng
              ? getDistanceKm(anchorSpot.lat, anchorSpot.lng, s.lat, s.lng)
              : 9999,
        }))
        .filter((item) => item.dist <= 8.0)
        .sort((a, b) => a.dist - b.dist);

      if (nearby.length > 0) {
        const picked = nearby[Math.floor(Math.random() * Math.min(3, nearby.length))].spot;
        steps.push({ slot, spotId: picked.id });
      } else {
        const fallback = candidates.filter((s) => s.id !== anchorSpot.id && isCourseEligible(s));
        if (fallback.length > 0) {
          steps.push({ slot, spotId: fallback[Math.floor(Math.random() * fallback.length)].id });
        } else {
          steps.push({ slot, spotId: null });
        }
      }
    }
  }

  if (state.slots.stay) {
    const stayCandidates = getCandidates(spots, 'stay', [], 'ALL', [], [])
      .filter((s) => isRealStaySpot(s) && isCourseEligible(s))
      .map((s) => ({
        spot: s,
        dist:
          anchorSpot.lat && anchorSpot.lng && s.lat && s.lng
            ? getDistanceKm(anchorSpot.lat, anchorSpot.lng, s.lat, s.lng)
            : 9999,
      }))
      .filter((item) => item.dist <= 15.0)
      .sort((a, b) => a.dist - b.dist);

    if (stayCandidates.length > 0) {
      steps.push({ slot: 'stay', spotId: stayCandidates[0].spot.id });
    }
  }

  return steps;
}

function renderSpotDiscovery(): void {
  const area = document.getElementById('spot-discovery-area');
  if (!area) return;

  // 1. GPS 위치 자동 획득 (아직 좌표가 없는 경우 백그라운드 요청)
  if (!userCoords && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        renderSpotDiscovery();
      },
      () => {
        // 위치 권한 거부 시 조용히 유지
      },
      { timeout: 3000, maximumAge: 600000 },
    );
  }

  // 2. 유효 스팟 필터링 (폐업 및 광역 더미 제외)
  let matchedSpots = spots.filter((s) => !s.is_closed && isCourseEligible(s));

  // 스팟 전용 검색어 필터 적용 (지역명, 핫플, 분위기, 메뉴 등)
  const q = state.spotSearchQuery.trim();
  if (q) {
    matchedSpots = matchedSpots.filter((s) => matchesSearchQuery(s, q));
  }

  // 카테고리 필터 적용
  if (state.spotCategory !== 'ALL') {
    const cat = SPOT_EXPLORE_CATEGORIES.find((c) => c.key === state.spotCategory);
    if (cat && cat.keywords) {
      matchedSpots = matchedSpots.filter((s) => {
        const targetText = [
          s.name,
          s.category,
          s.summary,
          ...(s.signature_items || []),
          ...(s.mood_tags || []),
        ].join(' ').toLowerCase();
        return cat.keywords!.some((kw) => targetText.includes(kw.toLowerCase()));
      });
    }
  }

  // 3. 기준 좌표 결정 (GPS 획득 좌표 -> 검색된 스팟 중심 -> 서울 기본 중심 좌표)
  let effectiveCoords = userCoords;
  if (!effectiveCoords) {
    if (q && matchedSpots.length > 0 && matchedSpots[0].lat && matchedSpots[0].lng) {
      effectiveCoords = { lat: matchedSpots[0].lat, lng: matchedSpots[0].lng };
    } else {
      effectiveCoords = { lat: 37.5413, lng: 127.0564 }; // 성수·서울 중심 기본 좌표
    }
  }

  // 모든 스팟의 기준점 대비 거리 계산
  matchedSpots = matchedSpots.map((s) => {
    const dist = s.lat && s.lng && effectiveCoords
      ? getDistanceKm(effectiveCoords.lat, effectiveCoords.lng, s.lat, s.lng)
      : 9999;
    return { ...s, _dist: dist };
  });

  // 4. 정렬 적용 (거리순 / 핫플·인기순 / 블루리본·미쉐린순)
  if (state.spotSort === 'distance') {
    // 📍 가까운 거리순 (가까운 곳부터)
    matchedSpots.sort((a, b) => ((a as any)._dist ?? 9999) - ((b as any)._dist ?? 9999));
  } else if (state.spotSort === 'curation') {
    // ⭐ 블루리본/미쉐린순 (공인 인증 뱃지 + 평점순)
    matchedSpots.sort((a, b) => {
      const aScore = (a.curation_badges?.michelin ? 40 : 0) + (a.curation_badges?.blue_ribbon ? 30 : 0) + (a.curation_badges?.tour_api ? 10 : 0) + ((a.social_links?.kakaomap?.rating || 0) * 5);
      const bScore = (b.curation_badges?.michelin ? 40 : 0) + (b.curation_badges?.blue_ribbon ? 30 : 0) + (b.curation_badges?.tour_api ? 10 : 0) + ((b.social_links?.kakaomap?.rating || 0) * 5);
      return bScore - aScore;
    });
  } else {
    // 🔥 핫플/인기순 (종합 인기도 점수 기준 정렬)
    matchedSpots.sort((a, b) => getSpotPopularityScore(b) - getSpotPopularityScore(a));
  }

  const totalCount = matchedSpots.length;
  const pageSize = state.spotGridCols === 5 ? 25 : state.spotGridCols === 3 ? 18 : 12;
  const displaySpots = matchedSpots.slice(0, state.spotPage * pageSize);
  const hasMore = displaySpots.length < totalCount;

  const isFiltered = Boolean(state.spotSearchQuery || state.spotCategory !== 'ALL');

  area.innerHTML = `
    <!-- 1. 통합 검색창 (맞춤 코스와 100% 동일) -->
    <div class="search-container" style="margin-bottom: var(--space-3);">
      <div class="search-box">
        <span class="search-input-icon">🔍</span>
        <input 
          type="search" 
          class="search-input" 
          id="discovery-search-input" 
          placeholder="${getDynamicSearchPlaceholder()}" 
          value="${escapeHtml(state.spotSearchQuery)}"
          autocomplete="off"
          aria-label="스팟 키워드 검색"
        />
        <button class="search-clear ${state.spotSearchQuery ? 'is-visible' : ''}" id="btn-clear-discovery-search" aria-label="검색어 지우기">✕</button>
      </div>
    </div>

    <!-- 2. 실시간 핫랭킹 큐레이션 테마 칩 바 (낮/밤 하루 2회 자동 최적화) -->
    <div class="spot-category-scroll" style="margin-bottom: var(--space-4);">
      ${getCuratedThemeChips().map((cat) => `
        <button class="spot-category-chip ${state.spotCategory === cat.key ? 'is-active' : ''}" data-cat-key="${cat.key}">
          <span class="chip-emoji">${cat.emoji}</span>
          <span class="chip-label">${cat.label}</span>
        </button>
      `).join('')}
    </div>

    <!-- 3. 탐색 상태, COS 스타일 2/3/5열 아이콘 스위처 & 정렬 툴바 -->
    <div class="discovery-status-bar">
      <div class="status-left">
        <span class="status-count-badge">${totalCount}</span>
        <span class="status-text">개의 데이트 스팟</span>
        ${isFiltered ? `
          <button class="btn-discovery-filter-reset" id="btn-reset-discovery-filters">
            <span class="reset-icon">↺</span> 검색 초기화
          </button>
        ` : ''}
      </div>

      <div class="status-right">
        <!-- 단일 아이콘 순환 토글 버튼 (3열 기본 -> 2열 -> 5열 -> 3열) -->
        <button class="btn-density-cycle" id="btn-density-cycle" aria-label="보기 방식 전환 (${state.spotGridCols}열 보기)" title="보기 전환 (${state.spotGridCols}열 → ${state.spotGridCols === 3 ? '2열' : state.spotGridCols === 2 ? '5열' : '3열'})">
          ${state.spotGridCols === 2 ? `
            <svg class="density-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="1" y="1" width="5.5" height="14" rx="0.75" fill="currentColor"/>
              <rect x="9.5" y="1" width="5.5" height="14" rx="0.75" fill="currentColor"/>
            </svg>
          ` : state.spotGridCols === 5 ? `
            <svg class="density-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="0.5" y="1" width="1.8" height="14" rx="0.5" fill="currentColor"/>
              <rect x="3.8" y="1" width="1.8" height="14" rx="0.5" fill="currentColor"/>
              <rect x="7.1" y="1" width="1.8" height="14" rx="0.5" fill="currentColor"/>
              <rect x="10.4" y="1" width="1.8" height="14" rx="0.5" fill="currentColor"/>
              <rect x="13.7" y="1" width="1.8" height="14" rx="0.5" fill="currentColor"/>
            </svg>
          ` : `
            <svg class="density-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="0.5" y="1" width="3.4" height="14" rx="0.75" fill="currentColor"/>
              <rect x="6.3" y="1" width="3.4" height="14" rx="0.75" fill="currentColor"/>
              <rect x="12.1" y="1" width="3.4" height="14" rx="0.75" fill="currentColor"/>
            </svg>
          `}
        </button>

        <div class="discovery-sort-group">
          <select class="discovery-sort-select" id="discovery-sort-select" aria-label="스팟 정렬">
            <option value="distance" ${state.spotSort === 'distance' ? 'selected' : ''}>📍 가까운 거리순</option>
            <option value="popular" ${state.spotSort === 'popular' ? 'selected' : ''}>🔥 핫플/인기순</option>
            <option value="curation" ${state.spotSort === 'curation' ? 'selected' : ''}>⭐ 블루리본/미쉐린순</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 4. 그리드 피드 (2열 / 3열 기본 / 5열) -->
    <div class="spot-discovery-grid cols-${state.spotGridCols}">
      ${displaySpots.length > 0 ? displaySpots.map((spot) => renderDiscoverySpotCard(spot, state.spotGridCols)).join('') : `
        <div class="spot-empty-state">
          <span class="empty-icon">🧭</span>
          <p class="empty-title">검색 조건에 맞는 스팟을 찾지 못했어요</p>
          <p class="empty-desc">지역명(예: 성수, 강남, 제주)이나 키워드(예: 카페, 와인, 오션뷰)를 입력해보세요!</p>
          <button class="btn-empty-reset" id="btn-empty-reset-all">전체 스팟 다시 보기</button>
        </div>
      `}
    </div>

    <!-- 5. 페이지네이션 / 더보기 -->
    ${hasMore ? `
      <div class="discovery-more-row">
        <button class="btn-discovery-more" id="btn-discovery-more">
          스팟 더보기 (${displaySpots.length} / ${totalCount}) ▾
        </button>
      </div>
    ` : ''}
  `;

  bindDiscoveryEvents(area);
}

function renderDiscoverySpotCard(spot: Spot & { _dist?: number }, cols: 2 | 3 | 5 = 3): string {
  const isHot = isSuperHotSpot(spot);
  const slotKey = (spot.slot as SlotKey) || 'day';
  const targetImgUrl = getSpotImageUrl(spot, slotKey);
  const fallbackIcon = getSpotFallbackIcon(spot, slotKey);
  const distText =
    spot._dist !== undefined && spot._dist < 9000
      ? spot._dist < 1.0
        ? `📍 ${(spot._dist * 1000).toFixed(0)}m`
        : `📍 ${spot._dist.toFixed(1)}km`
      : `📍 ${spot.area || spot.region}`;
  const sum = cleanSpotSummary(spot) || `${spot.name}에서 특별한 데이트를 즐겨보세요.`;

  // 큐레이션 뱃지
  const curationPill = spot.curation_badges?.blue_ribbon
    ? `<span class="badge-card-curation blueribbon">${cols === 5 ? '🎀' : '🎀 블루리본'}</span>`
    : spot.curation_badges?.michelin
    ? `<span class="badge-card-curation michelin">${cols === 5 ? '⭐' : '⭐ 미쉐린'}</span>`
    : isHot
    ? `<span class="badge-card-curation hot">${cols === 5 ? '🔥' : '🔥 핫플'}</span>`
    : '';

  // 5개행 모드: 미니 타일형 컴팩트 뷰
  if (cols === 5) {
    return `
      <article class="discovery-card cols-5" data-spot-id="${spot.id}">
        <div class="discovery-card-thumb">
          <span class="discovery-badge-dist">${distText}</span>
          ${curationPill}
          <div class="thumb-fallback-box">${fallbackIcon}</div>
          <img class="discovery-img" src="${escapeHtml(targetImgUrl)}" alt="${escapeHtml(spot.name)}" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('is-loaded');" onerror="this.classList.add('is-hidden'); this.previousElementSibling?.classList.add('is-active');" />
        </div>
        <div class="discovery-card-body compact">
          <h4 class="discovery-name compact" title="${escapeHtml(spot.name)}">${escapeHtml(spot.name)}</h4>
          <span class="discovery-category compact">${escapeHtml(spot.category || '명소')}</span>
          <div class="discovery-card-actions compact">
            <button class="btn-build-anchor-course compact" data-spot-id="${spot.id}" aria-label="${escapeHtml(spot.name)} 중심으로 코스 짜기" title="이 장소로 코스 짜기">
              <span class="btn-sparkle">✨</span> 코스
            </button>
            <a class="btn-discovery-map compact" href="${naverMapUrl(spot)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(spot.name)} 지도 보기" title="지도 보기">
              🗺️
            </a>
          </div>
        </div>
      </article>
    `;
  }

  // 2개행, 3개행 모드: 표준 상세 뷰
  return `
    <article class="discovery-card cols-${cols}" data-spot-id="${spot.id}">
      <div class="discovery-card-thumb">
        <span class="discovery-badge-dist">${distText}</span>
        ${curationPill}
        <div class="thumb-fallback-box">${fallbackIcon}</div>
        <img class="discovery-img" src="${escapeHtml(targetImgUrl)}" alt="${escapeHtml(spot.name)}" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('is-loaded');" onerror="this.classList.add('is-hidden'); this.previousElementSibling?.classList.add('is-active');" />
      </div>
      <div class="discovery-card-body">
        <div class="discovery-card-meta">
          <span class="discovery-category">${escapeHtml(spot.category || '명소')}</span>
          <span class="discovery-area">${escapeHtml(spot.area || '')}</span>
        </div>
        <h4 class="discovery-name" title="${escapeHtml(spot.name)}">${escapeHtml(spot.name)}</h4>
        <p class="discovery-quote">“${escapeHtml(sum)}”</p>
        <div class="discovery-card-actions">
          <button class="btn-build-anchor-course" data-spot-id="${spot.id}" aria-label="${escapeHtml(spot.name)} 중심으로 코스 짜기">
            <span class="btn-sparkle">✨</span> 코스 짜기
          </button>
          <a class="btn-discovery-map" href="${naverMapUrl(spot)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(spot.name)} 지도 보기">
            🗺️ 지도
          </a>
        </div>
      </div>
    </article>
  `;
}

function bindDiscoveryEvents(area: HTMLElement): void {
  // 1. 통합 검색창 입력 (실시간 디바운스 검색)
  const searchInput = area.querySelector<HTMLInputElement>('#discovery-search-input');
  if (searchInput) {
    let searchDebounce: number;
    searchInput.addEventListener('input', (e) => {
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        state.spotSearchQuery = (e.target as HTMLInputElement).value;
        state.spotPage = 1;
        renderSpotDiscovery();
        // 포커스 유지
        const nextInput = document.querySelector<HTMLInputElement>('#discovery-search-input');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      }, 300);
    });
  }

  // 검색창 지우기
  area.querySelector('#btn-clear-discovery-search')?.addEventListener('click', () => {
    state.spotSearchQuery = '';
    state.spotPage = 1;
    renderSpotDiscovery();
  });

  // 2. 카테고리 칩 클릭
  area.querySelectorAll<HTMLButtonElement>('.spot-category-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.spotCategory = btn.dataset.catKey || 'ALL';
      state.spotPage = 1;
      renderSpotDiscovery();
    });
  });

  // 3. 단일 아이콘 순환 토글 (3열 기본 -> 2열 -> 5열 -> 3열)
  area.querySelector('#btn-density-cycle')?.addEventListener('click', () => {
    const nextCols: 2 | 3 | 5 = state.spotGridCols === 3 ? 2 : state.spotGridCols === 2 ? 5 : 3;
    state.spotGridCols = nextCols;
    state.spotPage = 1;
    renderSpotDiscovery();
    const label = nextCols === 2 ? '2열 와이드 뷰' : nextCols === 5 ? '5열 미니 타일 뷰' : '3열 기본 갤러리 뷰';
    showToast(`📐 ${label}로 전환했어요`);
  });

  // 5. 정렬 셀렉트 박스
  const sortSelect = area.querySelector<HTMLSelectElement>('#discovery-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      state.spotSort = (sortSelect.value as any) || 'distance';
      state.spotPage = 1;
      renderSpotDiscovery();
    });
  }

  // 6. 필터 초기화 버튼
  area.querySelector('#btn-reset-discovery-filters')?.addEventListener('click', () => {
    state.spotSearchQuery = '';
    state.spotCategory = 'ALL';
    state.spotPage = 1;
    renderSpotDiscovery();
  });

  area.querySelector('#btn-empty-reset-all')?.addEventListener('click', () => {
    state.spotSearchQuery = '';
    state.spotCategory = 'ALL';
    state.spotPage = 1;
    renderSpotDiscovery();
  });

  // 7. 더보기 버튼
  area.querySelector('#btn-discovery-more')?.addEventListener('click', () => {
    state.spotPage += 1;
    renderSpotDiscovery();
  });

  // 8. ✨ 이 장소로 코스 짜기 클릭 이벤트 (Killer Feature)
  area.querySelectorAll<HTMLButtonElement>('.btn-build-anchor-course').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spotId = Number(btn.dataset.spotId);
      const anchorSpot = spotById.get(spotId);
      if (!anchorSpot) return;

      // 앵커 기반 코스 생성
      const steps = buildAnchorCourse(anchorSpot);
      state.course = steps;
      state.courseConditions = {
        regions: [...state.regions],
        subZones: [...state.subZones],
        mood: state.mood,
        searchQuery: anchorSpot.name,
      };

      // 맞춤 코스 탭으로 전환
      state.mainMode = 'course';
      updateModeView();

      showToast(`✨ '${anchorSpot.name}' 중심 맞춤 코스를 완성했어요! 🚀`);
      const resultsEl = document.getElementById('results-area');
      if (resultsEl) {
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// --- 수신자 뷰 (S5 — 링크로 열었을 때) ---------------------------------------------

/**
 * 공유 ID 배열 → 스텝 목록 (슬롯 순 정렬).
 * 존재하지 않는 스폿·slot 없는 스폿뿐 아니라 숙박 검증(isRealStaySpot)에 실패한 스폿도 제외한다.
 * 링크에 담긴 ID를 그대로 믿으면 생성 경로의 방어막을 통째로 우회하기 때문.
 */
function buildSharedSteps(ids: number[]): CourseStep[] {
  const steps: CourseStep[] = [];
  for (const id of ids) {
    const spot = spotById.get(id);
    if (spot && isCourseEligible(spot)) {
      steps.push({ slot: spot.slot as SlotKey, spotId: id });
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
      <h1 class="app-title"><a href="#" class="app-title-link" id="receiver-home-link" aria-label="오늘 데이트 홈으로 이동">오늘 데이트</a></h1>
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
      <p class="footer-sub">검증된 스팟만 골라 담은 오늘의 데이트 코스</p>
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

function getMoodDescription(key: string): string {
  switch (key) {
    case 'romantic': return '은은한 조명과 다정한 대화가 흐르는 설레는 코스';
    case 'healing': return '도심을 벗어나 편안한 쉼과 여유를 즐기는 힐링 코스';
    case 'gourmet': return '풍부한 아로마와 정갈한 플레이팅의 미식 여행';
    case 'trendy': return '감각적인 공간 미학과 위트 있는 에너지가 가득한 핫플';
    case 'view': return '탁 트인 시야, 노을과 윤슬이 빛나는 전망 명소';
    case 'luxury': return '격조 높은 우아함과 프라이빗한 프리미엄 스팟';
    case 'retro': return '아날로그 감성과 시간의 결이 묻어나는 골목길';
    case 'active': return '생동감 넘치는 움직임과 함께 몰입하는 이색 체험';
    default: return '다채로운 매력의 장소들을 균형 있게 믹스한 코스';
  }
}

let isClosingOverlay = false;

function closeOverlay(callback?: () => void): void {
  if (isClosingOverlay || (!state.savedOpen && !state.regionSheetOpen && !state.moodSheetOpen)) return;
  const root = document.getElementById('overlay-root');
  if (!root) return;
  const backdrop = root.querySelector('.overlay-backdrop');
  const panel = root.querySelector('.overlay-panel, .location-sheet-panel');
  if (!backdrop || !panel) {
    state.savedOpen = false;
    state.regionSheetOpen = false;
    state.moodSheetOpen = false;
    renderOverlay();
    if (state.mainMode === 'course') {
      renderConditions();
    } else {
      renderSpotDiscovery();
    }
    callback?.();
    return;
  }
  isClosingOverlay = true;
  backdrop.classList.add('is-closing');
  panel.classList.add('is-closing');
  window.setTimeout(() => {
    state.savedOpen = false;
    state.regionSheetOpen = false;
    state.moodSheetOpen = false;
    isClosingOverlay = false;
    renderOverlay();
    if (state.mainMode === 'course') {
      renderConditions();
    } else {
      renderSpotDiscovery();
    }
    callback?.();
  }, 220);
}

function renderOverlay(): void {
  const root = document.getElementById('overlay-root');
  if (!root) return;

  // 1. 저장한 코스 바텀시트
  if (state.savedOpen) {
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
    return;
  }

  // 2. 에어비앤비 스타일 2단 지역 선택 바텀시트
  if (state.regionSheetOpen) {
    const activeReg = state.activeRegionTab || 'SEOUL';
    const subZonesInTab = POPULAR_ZONES.filter((z) => z.regionKey === activeReg);
    const isAllTab = activeReg === 'ALL';

    root.innerHTML = `
      <div class="overlay-backdrop" id="overlay-backdrop"></div>
      <div class="location-sheet-panel" role="dialog" aria-label="지역 선택">
        <div class="location-sheet-head">
          <span class="location-sheet-title">📍 어디로 데이트를 떠날까요?</span>
          <button class="overlay-close" id="overlay-close" aria-label="닫기">✕</button>
        </div>
        <div class="location-split">
          <!-- 좌측 8대 지역 탭 -->
          <div class="location-regions" role="tablist">
            ${REGIONS.map((r) => {
              const isSelectedTab = (state.activeRegionTab || 'SEOUL') === r.key;
              const hasSelectedZones = state.subZones.some((zk) => {
                const z = POPULAR_ZONES.find((item) => item.key === zk);
                return z ? z.regionKey === r.key : false;
              });
              const isRegSelected = r.key === 'ALL' ? state.regions.length === 0 : state.regions.includes(r.key);
              return `
                <button class="region-tab-item ${isSelectedTab ? 'active' : ''}" data-region-tab="${r.key}">
                  <span>${r.label}</span>
                  ${isRegSelected || hasSelectedZones ? `<span class="region-tab-badge">●</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>

          <!-- 우측 세부 핫플존 리스트 -->
          <div class="location-subzones">
            ${
              isAllTab
                ? `
              <div class="subzones-header">
                <span class="subzones-title">🗺️ 전국</span>
              </div>
              <div class="subzones-grid">
                <label class="zone-check-item zone-check-all ${state.regions.length === 0 ? 'is-checked' : ''}" id="btn-select-all-korea-chip" style="cursor: pointer;">
                  <input type="checkbox" class="zone-checkbox" ${state.regions.length === 0 ? 'checked' : ''} />
                  <span class="zone-label">🗺️ 전국 어디서나</span>
                </label>
              </div>
              <div class="all-regions-card" style="margin-top: var(--space-3);">
                <h3 class="all-regions-title">대한민국 전국 데이트 스팟 탐색</h3>
                <p class="all-regions-desc">
                  전국 8대 권역의 감성 핫플레이스와 숨은 명소를 폭넓게 연결해 드려요.
                </p>
                <div class="all-regions-features">
                  <div class="all-feature-item">
                    <span class="feature-icon">✨</span>
                    <div class="feature-body">
                      <span class="feature-title">전국 핫플레이스 엄선</span>
                      <span class="feature-desc">인기 명소부터 로컬 감성 스팟까지</span>
                    </div>
                  </div>
                  <div class="all-feature-item">
                    <span class="feature-icon">🚗</span>
                    <div class="feature-body">
                      <span class="feature-title">여행 & 드라이브 추천</span>
                      <span class="feature-desc">주말 근교 및 색다른 데이트 코스</span>
                    </div>
                  </div>
                  <div class="all-feature-item">
                    <span class="feature-icon">🧭</span>
                    <div class="feature-body">
                      <span class="feature-title">자유로운 코스 연결</span>
                      <span class="feature-desc">지역 제한 없는 폭넓은 큐레이션</span>
                    </div>
                  </div>
                </div>
              </div>
            `
                : `
              <div class="subzones-header">
                <span class="subzones-title">${REGIONS.find((r) => r.key === activeReg)?.label || '서울'} 핫플레이스</span>
              </div>
              <div class="subzones-grid">
                <!-- 최상단: 해당 권역 전체(모든 시·군/구) 일괄 선택 칩 -->
                ${(() => {
                  const areAllChecked =
                    subZonesInTab.length > 0 && subZonesInTab.every((z) => state.subZones.includes(z.key));
                  const currentRegLabel = REGIONS.find((r) => r.key === activeReg)?.label || '서울';
                  return `
                    <label class="zone-check-item zone-check-all ${areAllChecked ? 'is-checked' : ''}" data-zone-all="${activeReg}">
                      <input type="checkbox" class="zone-checkbox" ${areAllChecked ? 'checked' : ''} />
                      <span class="zone-label">🗺️ ${escapeHtml(currentRegLabel)} 전체</span>
                    </label>
                  `;
                })()}

                ${subZonesInTab
                  .map((z) => {
                    const isChecked = state.subZones.includes(z.key);
                    return `
                    <label class="zone-check-item ${isChecked ? 'is-checked' : ''}" data-zone-key="${z.key}">
                      <input type="checkbox" class="zone-checkbox" value="${z.key}" ${isChecked ? 'checked' : ''} />
                      <span class="zone-label">${escapeHtml(z.label)}</span>
                    </label>
                  `;
                  })
                  .join('')}
              </div>
            `
            }
          </div>
        </div>

        <div class="location-sheet-footer">
          <button class="btn-location-reset" id="btn-location-reset">초기화</button>
          <button class="btn-primary btn-location-submit" id="btn-location-submit">선택 완료</button>
        </div>
      </div>
    `;

    root.querySelector('#overlay-backdrop')!.addEventListener('click', () => closeOverlay());
    root.querySelector('#overlay-close')!.addEventListener('click', () => closeOverlay());

    // 지역 탭 클릭 (전체 클릭 시 자동으로 전국 기본 선택)
    root.querySelectorAll<HTMLButtonElement>('.region-tab-item').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const tabKey = tabBtn.dataset.regionTab || 'SEOUL';
        state.activeRegionTab = tabKey;
        if (tabKey === 'ALL') {
          state.regions = [];
          state.subZones = [];
        }
        renderOverlay();
      });
    });

    // 전국 모드 칩 클릭
    const selectAllKorea = () => {
      state.regions = [];
      state.subZones = [];
      renderOverlay();
    };
    root.querySelector('#btn-select-all-korea-chip')?.addEventListener('click', (e) => {
      e.preventDefault();
      selectAllKorea();
    });

    // 지역 전체 일괄 토글 공통 핸들러
    const toggleAllZonesInActiveRegion = () => {
      const areAllChecked =
        subZonesInTab.length > 0 && subZonesInTab.every((z) => state.subZones.includes(z.key));

      const currentSubZones = new Set(state.subZones);

      if (areAllChecked) {
        // 1. 전체 해제: 해당 지역의 모든 세부존 일괄 제거 및 지역 제거
        subZonesInTab.forEach((z) => currentSubZones.delete(z.key));
        state.regions = state.regions.filter((r) => r !== activeReg);
      } else {
        // 2. 전체 선택: 해당 지역의 모든 세부존 일괄 추가 및 지역 포함
        subZonesInTab.forEach((z) => currentSubZones.add(z.key));
        if (!state.regions.includes(activeReg)) {
          state.regions.push(activeReg);
        }
      }

      state.subZones = Array.from(currentSubZones);
      renderOverlay();
    };

    // 해당 권역 전체 칩 클릭 이벤트 연동
    root.querySelector('.zone-check-all[data-zone-all]')?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleAllZonesInActiveRegion();
    });

    // 세부존 체크박스 토글 (스크롤 점프 방지: 국소 DOM 업데이트)
    root.querySelectorAll<HTMLLabelElement>('.zone-check-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const zk = item.dataset.zoneKey;
        if (!zk) return;

        const next = new Set(state.subZones);
        const willCheck = !next.has(zk);
        if (willCheck) {
          next.add(zk);
        } else {
          next.delete(zk);
        }
        state.subZones = Array.from(next);

        // UI 즉시 반영 (스크롤 위치 유지)
        item.classList.toggle('is-checked', willCheck);
        const cb = item.querySelector<HTMLInputElement>('.zone-checkbox');
        if (cb) cb.checked = willCheck;

        // 해당 지역 내 체크된 항목이 1개라도 있으면 지역 포함, 0개면 지역 제외
        const hasAnyInReg = subZonesInTab.some((z) => state.subZones.includes(z.key));
        if (hasAnyInReg) {
          if (!state.regions.includes(activeReg)) {
            state.regions.push(activeReg);
          }
        } else {
          state.regions = state.regions.filter((r) => r !== activeReg);
        }

        // 해당 권역 전체 칩 체크 상태 실시간 동기화
        const allNowChecked =
          subZonesInTab.length > 0 && subZonesInTab.every((z) => state.subZones.includes(z.key));
        const allCheckChip = root.querySelector<HTMLLabelElement>('.zone-check-all[data-zone-all]');
        if (allCheckChip) {
          allCheckChip.classList.toggle('is-checked', allNowChecked);
          const allCb = allCheckChip.querySelector<HTMLInputElement>('.zone-checkbox');
          if (allCb) allCb.checked = allNowChecked;
        }

        // 좌측 탭 인디케이터 뱃지 동기화
        const activeTabEl = root.querySelector<HTMLButtonElement>(
          `.region-tab-item[data-region-tab="${activeReg}"]`,
        );
        if (activeTabEl) {
          const isRegSelected = state.regions.includes(activeReg);
          let badge = activeTabEl.querySelector('.region-tab-badge');
          if (isRegSelected || hasAnyInReg) {
            if (!badge) {
              const span = document.createElement('span');
              span.className = 'region-tab-badge';
              span.textContent = '●';
              activeTabEl.appendChild(span);
            }
          } else if (badge) {
            badge.remove();
          }
        }
      });
    });

    // 초기화 버튼
    root.querySelector('#btn-location-reset')?.addEventListener('click', () => {
      state.regions = ['SEOUL'];
      state.subZones = [];
      renderOverlay();
    });

    // 선택 완료 버튼
    root.querySelector('#btn-location-submit')?.addEventListener('click', () => {
      closeOverlay();
    });

    return;
  }

  // 3. 무드 선택 바텀시트
  if (state.moodSheetOpen) {
    root.innerHTML = `
      <div class="overlay-backdrop" id="overlay-backdrop"></div>
      <div class="overlay-panel mood-sheet-panel" role="dialog" aria-label="분위기 선택">
        <div class="overlay-head">
          <span class="overlay-title">✨ 어떤 분위기의 데이트를 원하세요?</span>
          <button class="overlay-close" id="overlay-close" aria-label="닫기">✕</button>
        </div>
        <div class="overlay-body mood-cards-grid">
          ${MOODS.map((m) => {
            const isSelected = state.mood === m.key;
            return `
              <button class="mood-card ${isSelected ? 'active' : ''}" data-mood="${m.key}">
                <span class="mood-card-emoji">${m.emoji || '✨'}</span>
                <div class="mood-card-info">
                  <span class="mood-card-name">${m.label}</span>
                  <span class="mood-card-desc">${getMoodDescription(m.key)}</span>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    root.querySelector('#overlay-backdrop')!.addEventListener('click', () => closeOverlay());
    root.querySelector('#overlay-close')!.addEventListener('click', () => closeOverlay());

    root.querySelectorAll<HTMLButtonElement>('.mood-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mood = btn.dataset.mood || 'ALL';
        closeOverlay();
      });
    });
    return;
  }


  root.innerHTML = '';
}

/** 저장한 코스를 결과 영역에 복원 (조건 상태도 함께 복원) */
function restoreCourse(item: SavedCourse): void {
  // spotId → 해당 스폿의 slot으로 스텝 재구성
  // (스폿 데이터가 사라진 ID, 그리고 숙박 검증에 실패한 과거 저장분은 건너뜀)
  const steps: CourseStep[] = [];
  let droppedCount = 0;
  for (const id of item.spotIds) {
    const spot = spotById.get(id);
    if (spot && isCourseEligible(spot)) {
      steps.push({ slot: spot.slot as SlotKey, spotId: id });
    } else if (spot) {
      droppedCount += 1;
    }
  }
  if (droppedCount > 0) {
    showToast(`검증에 실패한 장소 ${droppedCount}곳을 코스에서 제외했어요`);
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
        userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const detected = detectRegionFromCoords(pos.coords.latitude, pos.coords.longitude);
        // 사용자가 아직 수동으로 다른 지역을 선택하지 않았을 때만 자동 갱신
        if (state.regions.length === 1 && state.regions[0] === 'SEOUL' && detected !== 'SEOUL') {
          state.regions = [detected];
          renderConditions();
          console.log(`📍 [GPS] 현재 위치 기반 지역 자동 선택: ${detected}`);
        }
        if (state.course && state.course.length > 0) {
          renderResults();
        }
      },
      () => {
        // 권한 거부 또는 타임아웃 시 기본값 'SEOUL' 유지
      },
      { timeout: 5000, maximumAge: 600000 },
    );
  }

  // 4. 시스템(OS) 다크모드 변경 실시간 감지
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.themeMode === 'auto') {
        applyTheme('auto', false);
      }
    });
  }
}

init();

// --- PWA Service Worker Registration ---------------------------------------
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[PWA] Service Worker registration failed:', err);
    });
  });
}

