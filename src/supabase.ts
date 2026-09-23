import rawSpotsData from './data/spots.sample.json';

export interface SocialPlatformLink {
  url: string;
  title?: string;
  views?: number;
  likes?: number;
  rating?: number;
  review_count?: number;
  bookmark_count?: number;
  is_shorts?: boolean;
  published_at?: string;
  badge?: string;
}

export interface SocialLinks {
  youtube?: SocialPlatformLink;
  kakaomap?: SocialPlatformLink;
  catchtable?: SocialPlatformLink;
  instagram?: SocialPlatformLink;
  community?: SocialPlatformLink;
  [key: string]: SocialPlatformLink | undefined;
}

export interface SpotMetrics {
  hot_score?: number;
  trust_score?: number;
  composite_rating?: number;
  total_video_views?: number;
  last_synced_at?: string;
}

export interface ParkingInfo {
  type?: 'free' | 'paid' | 'valet' | 'impossible' | 'unknown';
  detail?: string;
  valet_fee?: string;
}

export interface BookingInfo {
  available?: boolean;
  platform?: 'catchtable' | 'tabling' | 'naver' | 'phone' | 'none';
  url?: string;
  tips?: string;
}

export interface CurationBadges {
  michelin?: string;
  blue_ribbon?: number;
  tour_api?: string;
  catchtable?: string;
  tv_shows?: string[];
  certified?: string[];
  [key: string]: any;
}

export interface ProviderIds {
  naver?: string;
  kakao?: string;
  catchtable?: string;
  tour_api?: string;
}

export interface Spot {
  id: number;
  name: string;
  slot: 'day' | 'evening' | 'night' | 'stay' | null;
  region: string;
  mood: string[];
  area?: string | null;
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
  parking_info?: ParkingInfo;
  parking_detail?: string;
  subway_info?: string;

  business_hours?: Record<string, string>;
  break_time?: Record<string, string>;
  closed_days?: string[];
  is_24h?: boolean;

  reservation_type?: string;
  reservation_url?: string;
  booking_tips?: string;
  booking_info?: BookingInfo;

  price_tier?: '₩' | '₩₩' | '₩₩₩' | '₩₩₩₩' | 'FREE' | null;
  avg_price_per_person?: number | null;
  signature_items?: string[];

  mood_tags?: string[];
  date_contexts?: string[];

  curation_badges?: CurationBadges;
  provider_ids?: ProviderIds;
  ai_summary_editorial?: string;

  social_links?: SocialLinks;
  metrics?: SpotMetrics;
  hot_score?: number;
  last_verified_at?: string;
  created_at?: string;
}

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://uyhwhnnzzfhtxjernfit.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_WVe2QK8hjecachXgTqOsJA_GVfTzxba';

const DB_NAME = 'oneul_date_cache';
const STORE_NAME = 'spots_store';
const CACHE_KEY = 'all_spots_v1';

async function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * TourAPI 마이너가 curation_badges를 문자열 배열(예: ["한국관광공사 인증"])로
 * 적재한 레코드를 CurationBadges 객체 형태로 변환한다. 배열 그대로 두면
 * spot.curation_badges?.tour_api 같은 프로퍼티 접근이 전부 undefined가 되어
 * 배지 표시·인기도 점수 계산에서 조용히 빠진다.
 */
function normalizeCurationBadges(raw: unknown): CurationBadges | undefined {
  if (!raw) return undefined;
  if (!Array.isArray(raw)) return raw as CurationBadges;
  const badges: CurationBadges = {};
  const certified: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    if (item.includes('관광공사')) badges.tour_api = item;
    else if (item.includes('미쉐린') || item.toLowerCase().includes('michelin')) badges.michelin = item;
    else if (item.includes('블루리본')) badges.blue_ribbon = 1;
    else if (item.includes('캐치테이블') || item.toLowerCase().includes('catchtable')) badges.catchtable = item;
    else certified.push(item);
  }
  if (certified.length > 0) badges.certified = certified;
  return Object.keys(badges).length > 0 ? badges : undefined;
}

/**
 * 이상 스팟 또는 오탐지된 상호명을 정상화하는 필터
 * (예: '광명전통시장 야간 클로렐라버거' -> 실제 매장 '클로렐라베이커리'로 자동 교정)
 */
export function normalizeSpot(spot: Spot): Spot {
  if (!spot) return spot;
  let next = spot;
  if (spot.id === 4833 || (spot.name && (spot.name.includes('클로렐라버거') || spot.name.includes('광명전통시장 야간')))) {
    next = {
      ...spot,
      name: '클로렐라베이커리',
      category: '제과,베이커리',
      slot: 'day',
      address: '경기 광명시 오리로976번길 18-1',
      location: '경기 광명시',
      summary: '신선한 클로렐라 반죽으로 갓 구워낸 수제 햄버거와 빵이 가득한 전통시장 속 명물 베이커리예요!',
      price: '클로렐라 햄버거 3,500원',
      lat: 37.48081214,
      lng: 126.85572328,
    };
  }
  if (Array.isArray(next.curation_badges)) {
    next = { ...next, curation_badges: normalizeCurationBadges(next.curation_badges) };
  }
  return sanitizeSpotUrls(next);
}

const SAFE_URL_RE = /^https?:\/\//i;
const isSafeUrl = (u: unknown): boolean => typeof u === 'string' && SAFE_URL_RE.test(u.trim());

/**
 * DB에서 온 URL 필드는 href로 그대로 나가는데 escapeHtml은 javascript: 스킴을 막지 못한다.
 * 모든 스팟이 거치는 로드 시점에 http(s)가 아닌 값을 걸러 렌더 경로 전체를 한 번에 보호한다.
 */
function sanitizeSpotUrls(spot: Spot): Spot {
  let next = spot;
  if (next.source?.url && !isSafeUrl(next.source.url)) {
    next = { ...next, source: { ...next.source, url: null } };
  }
  if (next.booking_info?.url && !isSafeUrl(next.booking_info.url)) {
    next = { ...next, booking_info: { ...next.booking_info, url: undefined } };
  }
  if (next.reservation_url && !isSafeUrl(next.reservation_url)) {
    next = { ...next, reservation_url: undefined };
  }
  if (next.image_url && !isSafeUrl(next.image_url)) {
    next = { ...next, image_url: null };
  }
  if (next.social_links) {
    const entries = Object.entries(next.social_links);
    const safeEntries = entries.filter(([, link]) => !link || isSafeUrl(link.url));
    if (safeEntries.length !== entries.length) {
      next = { ...next, social_links: Object.fromEntries(safeEntries) };
    }
  }
  return next;
}

export function normalizeSpots(spots: Spot[]): Spot[] {
  return spots.map(normalizeSpot);
}

/**
 * IndexedDB에 캐시된 스팟 목록을 반환합니다. (0ms에 가까운 속도로 즉시 로드)
 */
export async function getCachedSpots(): Promise<Spot[] | null> {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CACHE_KEY);
      req.onsuccess = () => {
        const val = req.result;
        if (Array.isArray(val) && val.length > 0) {
          resolve(normalizeSpots(val as Spot[]));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * 스팟 목록을 IndexedDB에 비동기 캐시 저장합니다.
 */
export async function saveSpotsToCache(spots: Spot[]): Promise<void> {
  if (!Array.isArray(spots) || spots.length === 0) return;
  try {
    const db = await openCacheDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(normalizeSpots(spots), CACHE_KEY);
  } catch {
    // 캐시 저장 실패 시 무시
  }
}

/**
 * 두 스팟 배열을 ID 기준으로 중복 없이 병합합니다.
 */
export function mergeSpots(base: Spot[], incoming: Spot[]): Spot[] {
  const map = new Map<number, Spot>();
  for (const s of base) {
    if (s && typeof s.id === 'number') {
      map.set(s.id, s);
    }
  }
  for (const s of incoming) {
    if (s && typeof s.id === 'number') {
      map.set(s.id, s);
    }
  }
  return Array.from(map.values());
}

/**
 * 정적 CDN (public/data/spots.json)에서 10,000여 개 스팟 데이터를 비동기 로드합니다.
 * Supabase 일시 장애 또는 대역폭 초과 시에도 100% 무중단 서비스를 보장합니다.
 */
export async function loadStaticSpots(): Promise<Spot[]> {
  try {
    const res = await fetch('./data/spots.json');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const normalized = normalizeSpots(data as Spot[]);
        saveSpotsToCache(normalized);
        return normalized;
      }
    }
  } catch {
    // CDN 로드 실패 시 빌드 번들 내장 샘플로 최종 폴백
  }
  return normalizeSpots(rawSpotsData as Spot[]);
}

/**
 * Supabase DB에서 활성 스팟 목록을 가져옵니다.
 * 특정 regionMatches(예: ['서울'] 또는 ['경기', '인천'])가 지정되면 해당 지역만 우선 경량 조회합니다.
 * Supabase 접속 장애(402 Egress 초과 등) 발생 시 정적 CDN 스팟 데이터로 매끄럽게 자동 폴백합니다.
 */
export async function loadSpots(regionMatches?: string[]): Promise<Spot[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return loadStaticSpots();
  }

  // 브라우저 Mixed Content 방어: 프로덕션(HTTPS)에서 비보안 HTTP API 호출 시 브라우저 차단 에러 방지 -> 정적 CDN 폴백
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && SUPABASE_URL.startsWith('http://')) {
    return loadStaticSpots();
  }

  try {
    let regionFilter = '';
    if (regionMatches && regionMatches.length > 0) {
      if (regionMatches.length === 1) {
        regionFilter = `&region=eq.${encodeURIComponent(regionMatches[0])}`;
      } else {
        regionFilter = `&region=in.(${regionMatches.map((m) => `"${encodeURIComponent(m)}"`).join(',')})`;
      }
    }

    // Egress 대역폭 70% 절감을 위한 필수 컬럼 핀포인트 조회 (select=* 지양)
    const selectFields =
      'id,name,slot,region,area,address,location,price,summary,category,image_url,lat,lng,quality_score,verified,is_closed,parking_type,parking_info,price_tier,signature_items,mood_tags,curation_badges,social_links,hot_score';
    const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/spots?select=${selectFields}&is_closed=eq.false${regionFilter}&order=id.asc`;
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };

    // 1회차 조회 (0~999) + 전체 exact count 헤더 확인
    const firstRes = await fetch(`${baseUrl}&offset=0&limit=1000`, {
      headers: { ...headers, Prefer: 'count=exact' },
    });

    if (firstRes.ok || firstRes.status === 206) {
      const firstBatch = await firstRes.json();
      if (Array.isArray(firstBatch) && firstBatch.length > 0) {
        const contentRange = firstRes.headers.get('Content-Range') || '';
        const total = contentRange.includes('/') ? parseInt(contentRange.split('/')[1], 10) : firstBatch.length;

        // 전체가 1,000개 이하면 즉시 반환
        if (total <= firstBatch.length) {
          const normFirst = normalizeSpots(firstBatch as Spot[]);
          if (!regionMatches || regionMatches.length === 0) {
            saveSpotsToCache(normFirst);
          }
          return normFirst;
        }

        // 1,000개 초과 시 나머지 청크 병렬 페칭
        const allSpots: Spot[] = [...firstBatch];
        const fetchPromises: Promise<Spot[]>[] = [];

        for (let offset = 1000; offset < total; offset += 1000) {
          const p = fetch(`${baseUrl}&offset=${offset}&limit=1000`, {
            headers,
          })
            .then((r) => (r.ok || r.status === 206 ? r.json() : []))
            .catch(() => []);
          fetchPromises.push(p);
        }

        const remainingBatches = await Promise.all(fetchPromises);
        remainingBatches.forEach((batch) => {
          if (Array.isArray(batch)) {
            allSpots.push(...batch);
          }
        });

        // ⚡ ID 기준 중복 방어 필터링
        const uniqueIdMap = new Map<number, Spot>();
        for (const s of allSpots) {
          if (s && s.id && !uniqueIdMap.has(s.id)) {
            uniqueIdMap.set(s.id, s);
          }
        }
        const uniqueSpots = normalizeSpots(Array.from(uniqueIdMap.values()));
        if (!regionMatches || regionMatches.length === 0) {
          saveSpotsToCache(uniqueSpots);
        }
        return uniqueSpots;
      }
    } else {
      console.warn(`⚠️ Supabase 응답 실패 (${firstRes.status}). 정적 CDN 데이터로 자동 전환합니다.`);
      return loadStaticSpots();
    }
  } catch (err) {
    console.warn('⚠️ Supabase 통신 오류 발생. 정적 CDN 데이터로 자동 전환합니다:', err);
    return loadStaticSpots();
  }

  return loadStaticSpots();
}

