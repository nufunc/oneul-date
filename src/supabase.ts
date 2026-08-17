import rawSpotsData from './data/spots.sample.json';

export interface SocialPlatformLink {
  url: string;
  title?: string;
  views?: number;
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
  social_links?: SocialLinks;
  metrics?: SpotMetrics;
  hot_score?: number;
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
    const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/spots?select=*&is_closed=eq.false`;
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };

    // 1회차 조회 (0~999) + 전체 exact count 헤더 확인
    const firstRes = await fetch(`${baseUrl}&limit=1000`, {
      headers: { ...headers, Prefer: 'count=exact' },
    });

    if (firstRes.ok) {
      const firstBatch = await firstRes.json();
      if (Array.isArray(firstBatch) && firstBatch.length > 0) {
        const contentRange = firstRes.headers.get('Content-Range') || '';
        const total = contentRange.includes('/') ? parseInt(contentRange.split('/')[1], 10) : firstBatch.length;

        // 전체가 1,000개 이하면 즉시 반환
        if (total <= firstBatch.length) {
          console.log(`⚡ [Supabase Live] ${firstBatch.length}개 활성 스팟 로드 완료`);
          return firstBatch as Spot[];
        }

        // 1,000개 초과 시 나머지 청크 병렬 페칭 (Range 헤더)
        const allSpots: Spot[] = [...firstBatch];
        const fetchPromises: Promise<Spot[]>[] = [];

        for (let offset = 1000; offset < total; offset += 1000) {
          const end = Math.min(offset + 999, total - 1);
          const p = fetch(baseUrl, {
            headers: {
              ...headers,
              Range: `${offset}-${end}`,
            },
          })
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []);
          fetchPromises.push(p);
        }

        const remainingBatches = await Promise.all(fetchPromises);
        remainingBatches.forEach((batch) => {
          if (Array.isArray(batch)) {
            allSpots.push(...batch);
          }
        });

        console.log(`⚡ [Supabase Live] 1,000개 제한 돌파: 총 ${allSpots.length}개 전체 스팟 로드 완료`);
        return allSpots;
      }
    }
  } catch (err) {
    console.warn('⚠️ Supabase 연결 실패, 로컬 DB로 자동 폴백합니다:', err);
  }

  return rawSpotsData as Spot[];
}
