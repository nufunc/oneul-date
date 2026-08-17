import rawSpotsData from './data/spots.sample.json';

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
  source: { type: string; url: string | null; note: string };
  verified: boolean;
  is_closed?: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Supabase DB에서 활성 스팟 목록을 실시간으로 가져옵니다.
 * 환경변수가 없거나 네트워크 오류 시 로컬 spots.json으로 안전하게 자동 폴백합니다.
 */
export async function loadSpots(): Promise<Spot[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return rawSpotsData as Spot[];
  }

  try {
    const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/spots?select=*&is_closed=eq.false&limit=10000`;
    const res = await fetch(endpoint, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`⚡ [Supabase] 실시간 DB 연동 성공: ${data.length}개 활성 스팟 로드`);
        return data as Spot[];
      }
    }
  } catch (err) {
    console.warn('⚠️ Supabase 연결 실패, 로컬 DB로 자동 폴백합니다:', err);
  }

  return rawSpotsData as Spot[];
}
