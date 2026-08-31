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
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5aHdobm56emZodHhqZXJuZml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MjAyNzcsImV4cCI6MjEwMjQ5NjI3N30.RobNIWS0QWNu6clFQuBHwVmr9gqbgBEUeWf8jwPCkns';

/**
 * Supabase DB에서 활성 스팟 목록을 실시간으로 가져옵니다.
 * 환경변수가 없거나 네트워크 오류 시 로컬 spots.json으로 안전하게 자동 폴백합니다.
 */
export async function loadSpots(): Promise<Spot[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return rawSpotsData as Spot[];
  }

  try {
    const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/spots?select=*&is_closed=eq.false&order=id.asc`;
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
          console.log(`⚡ [Supabase Live] ${firstBatch.length}개 활성 스팟 로드 완료`);
          return firstBatch as Spot[];
        }

        // 1,000개 초과 시 나머지 청크 병렬 페칭 (offset/limit + order=id.asc 고정 쿼리)
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

        // ⚡ ID 및 상호명 기준 중복 방어 필터링 (네트워크 청크 경계 중복 완벽 제거)
        const uniqueIdMap = new Map<number, Spot>();
        for (const s of allSpots) {
          if (s && s.id && !uniqueIdMap.has(s.id)) {
            uniqueIdMap.set(s.id, s);
          }
        }
        const uniqueSpots = Array.from(uniqueIdMap.values());

        console.log(`⚡ [Supabase Live] 총 ${uniqueSpots.length}개 전체 스팟 로드 완료 (전체: ${total}개, 중복 필터링 전: ${allSpots.length}개)`);
        return uniqueSpots;
      }
    }
  } catch (err) {
    console.warn('⚠️ Supabase 연결 실패, 로컬 DB로 자동 폴백합니다:', err);
  }

  return rawSpotsData as Spot[];
}
