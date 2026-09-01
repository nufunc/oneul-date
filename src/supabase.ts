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
          resolve(val as Spot[]);
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
    store.put(spots, CACHE_KEY);
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
 * Supabase DB에서 활성 스팟 목록을 가져옵니다.
 * 특정 regionMatches(예: ['서울'] 또는 ['경기', '인천'])가 지정되면 해당 지역만 우선 경량 조회합니다.
 */
export async function loadSpots(regionMatches?: string[]): Promise<Spot[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return rawSpotsData as Spot[];
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

    const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/spots?select=*&is_closed=eq.false${regionFilter}&order=id.asc`;
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
          if (!regionMatches || regionMatches.length === 0) {
            saveSpotsToCache(firstBatch as Spot[]);
          }
          return firstBatch as Spot[];
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
        const uniqueSpots = Array.from(uniqueIdMap.values());
        if (!regionMatches || regionMatches.length === 0) {
          saveSpotsToCache(uniqueSpots);
        }
        return uniqueSpots;
      }
    }
  } catch {
    // 조용히 폴백
  }

  return rawSpotsData as Spot[];
}
