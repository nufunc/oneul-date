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

// 옛 Supabase 프로젝트 주소가 기본값이라 매 로드마다 DNS 실패 요청을 보낸 뒤 폴백했다. 설정이 없으면 호출하지 않는다
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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

// 받은 링크 첫 방문은 전체 spots.json(gzip 3.7MB, Slow 4G 21초)이 와야 수신자 화면을 그렸다. 공유 id 행만 Range 요청으로 찾는다.
// spots.json이 id 오름차순이고 행마다 `{"id":`로 시작한다는 전제에 기댄다(collector/sync_live_spots.py가 쓰기 전에 assert한다)
const RANGE_URL = './data/spots.json';
const ROW_HEAD = [0x7b, 0x22, 0x69, 0x64, 0x22, 0x3a]; // {"id":
const RANGE_PROBE_BYTES = 2048; // 행 최대 1,838B(2026-10-20)보다 커야 조각마다 행 머리가 하나 들어 있다
const RANGE_PROBES = 7;
const RANGE_FINAL_BYTES = 16384;
const RANGE_MAX_REQUESTS = 300; // 공유 3곳에 88건(라운드 4번)이다
const RANGE_TIMEOUT_MS = 6000;

/** 조각에서 from 이후 첫 행 머리의 바이트 위치와 id. 문자열로 디코드해 세면 다중 바이트 문자에서 위치가 어긋나 바이트로 센다 */
export function findRowHead(buf: Uint8Array, from = 0): { pos: number; id: number } | null {
  outer: for (let i = from; i + ROW_HEAD.length < buf.length; i++) {
    for (let j = 0; j < ROW_HEAD.length; j++) if (buf[i + j] !== ROW_HEAD[j]) continue outer;
    let k = i + ROW_HEAD.length;
    let id = 0;
    while (k < buf.length && buf[k] >= 0x30 && buf[k] <= 0x39) id = id * 10 + (buf[k++] - 0x30);
    // 숫자가 없거나 조각 끝에서 잘렸으면 id를 믿을 수 없다
    if (k === i + ROW_HEAD.length || k === buf.length) return null;
    return { pos: i, id };
  }
  return null;
}

/** 조각에서 id 행을 꺼낸다. 행 끝은 다음 행 머리 앞이나 배열 끝 `]` 앞의 마지막 `}`다 */
export function extractRow(buf: Uint8Array, id: number): Spot | null {
  let head = findRowHead(buf);
  while (head && head.id !== id) head = findRowHead(buf, head.pos + 1);
  if (!head) return null;
  const next = findRowHead(buf, head.pos + 1);
  let end = next ? next.pos : buf.length;
  while (end > head.pos && buf[end - 1] !== 0x7d) end--;
  try {
    const row = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(head.pos, end)));
    return row && row.id === id ? (row as Spot) : null;
  } catch {
    return null;
  }
}

/**
 * spots.json에서 ids 행을 Range 요청 k분 탐색으로 찾는다. 하나라도 못 찾았거나 아래 조건에 걸리면 빈 배열이고 호출부는 전체 파일을 기다린다.
 * 206이 아님, content-encoding 있음(압축본 기준 조각), 응답마다 전체 크기가 다름(탐색 중 동기화), 요청 수 상한, 6초 초과
 */
export async function findSpotsByRange(ids: number[]): Promise<Spot[]> {
  if (ids.length === 0) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RANGE_TIMEOUT_MS);
  let total = -1;
  let requests = 0;
  const get = async (from: number, to: number): Promise<Uint8Array> => {
    if (++requests > RANGE_MAX_REQUESTS) throw new Error('range: too many requests');
    const res = await fetch(RANGE_URL, { headers: { Range: `bytes=${from}-${to - 1}` }, cache: 'no-store', signal: ctrl.signal });
    if (res.status !== 206 || res.headers.get('content-encoding')) throw new Error(`range: status ${res.status}`);
    const m = /^bytes (\d+)-\d+\/(\d+)$/.exec(res.headers.get('content-range') || '');
    if (!m || Number(m[1]) !== from || (total >= 0 && Number(m[2]) !== total)) throw new Error('range: content-range');
    total = Number(m[2]);
    return new Uint8Array(await res.arrayBuffer());
  };
  const find = async (id: number): Promise<Spot | null> => {
    let lo = 0;
    let hi = total;
    while (hi - lo > RANGE_FINAL_BYTES) {
      const offs = Array.from({ length: RANGE_PROBES }, (_, i) => Math.floor(lo + ((hi - lo) * (i + 1)) / (RANGE_PROBES + 1)));
      const heads = await Promise.all(
        offs.map(async (o) => {
          const h = findRowHead(await get(o, Math.min(o + RANGE_PROBE_BYTES, total)));
          return h && { pos: o + h.pos, id: h.id };
        }),
      );
      for (const h of heads) {
        if (!h) continue;
        if (h.id <= id) lo = Math.max(lo, h.pos);
        else hi = Math.min(hi, h.pos);
      }
    }
    return extractRow(await get(lo, hi), id);
  };
  try {
    await get(0, 1); // 전체 크기를 먼저 안다
    const rows = await Promise.all(ids.map(find));
    return rows.every(Boolean) ? normalizeSpots(rows as Spot[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    ctrl.abort(); // 실패했을 때 남은 요청을 끊는다
  }
}

/** 병합으로 닫힌 스팟의 옛 id → 남은 id (동기화가 public/data/spot_aliases.json으로 내보낸다). 실패하면 빈 객체 */
export async function loadSpotAliases(): Promise<Record<string, number>> {
  try {
    const res = await fetch('./data/spot_aliases.json');
    if (res.ok) return (await res.json()) as Record<string, number>;
  } catch {
    // 별칭이 없어도 앱은 동작한다. 병합된 옛 id만 찾지 못한다
  }
  return {};
}

/** 도시철도 역 이름 → 역사 좌표([위도, 경도]) (한국철도공사 도시철도역사정보, public/data/stations.json). 실패하면 빈 객체 */
export async function loadStations(): Promise<Record<string, [number, number][]>> {
  try {
    const res = await fetch('./data/stations.json');
    if (res.ok) return ((await res.json()) as { stations: Record<string, [number, number][]> }).stations;
  } catch {
    // 역 좌표가 없어도 앱은 동작한다. 역 이름 검색만 기존 방식으로 처리한다
  }
  return {};
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

