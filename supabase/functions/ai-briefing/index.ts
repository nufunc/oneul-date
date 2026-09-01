/**
 * ai-briefing — Groq AI 코스 브리핑 프록시 (Supabase Edge Function / Deno)
 * ============================================================================
 *
 * [목적]
 *   "오늘 데이트"는 GitHub Pages 정적 사이트라 프론트엔드 번들에 넣은 값은 모두
 *   공개된다. 기존에는 `VITE_GROQ_API_KEY`를 번들에 실어 브라우저가 직접
 *   api.groq.com을 호출했기 때문에 키가 그대로 노출됐다.
 *   이 함수는 그 호출을 서버 측으로 옮겨 Groq API 키를 숨기는 얇은 프록시다.
 *
 * [설계 원칙]
 *   - 프론트는 "재료"(스팟 목록 + 무드 키)만 보낸다. 프롬프트 문자열은 절대
 *     받지 않고 서버에서 조립한다. 임의 프롬프트를 받으면 이 엔드포인트가
 *     공짜 범용 LLM 프록시로 악용될 수 있기 때문이다.
 *   - Llama 3.3 (llama-3.3-70b-versatile) 기반의 고속·고감도 브리핑 생성:
 *     8대 분위기(로맨틱, 힐링, 미식, 핫플, 뷰·전망, 럭셔리, 레트로, 액티비티)와
 *     4개 시간 슬롯(낮/저녁/밤/숙박)을 고려하여 2~3줄의 감성 스토리 & 꿀팁 브리핑을 제공한다.
 *   - 실패는 조용히. 프론트가 로컬 템플릿(generateCourseStory)으로 폴백할 수
 *     있도록 에러 응답에도 CORS 헤더를 반드시 붙인다.
 *
 * [요청] — src/main.ts fetchAiBriefing과 확정된 계약
 *   POST /functions/v1/ai-briefing
 *   Content-Type: application/json   (Authorization 헤더 없음 → --no-verify-jwt 필요)
 *   {
 *     "spots": [
 *       {
 *         "slot": "낮",
 *         "name": "...",
 *         "category": "...",
 *         "summary": "...",
 *         "location": "...",
 *         "parking_type": "...",
 *         "price_tier": "...",
 *         "signature_items": ["..."],
 *         "curation_badges": { "blue_ribbon": 1, "michelin": "..." }
 *       }
 *     ],
 *     "mood": "romantic"
 *   }
 *   - `slot`은 한글 라벨(낮/저녁/밤/숙박) 또는 영문 키(day/evening/night/stay) 지원.
 *   - `mood`는 raw 키(ALL/romantic/...) 또는 호환 키 지원.
 *
 * [응답]
 *   200 { "text": "..." }            브리핑 본문 (프론트는 trim 후 15자 이상일 때만 채택)
 *   400 { "error": "..." }           입력 검증 실패
 *   403 { "error": "..." }           허용되지 않은 Origin
 *   405 { "error": "..." }           POST/OPTIONS 외 메서드
 *   429 { "error": "..." }           레이트리밋 초과
 *   502 { "error": "..." }           Groq 오류 또는 빈 응답
 *   504 { "error": "..." }           Groq 타임아웃(3초)
 *
 * [환경변수 / 시크릿]
 *   GROQ_API_KEY (필수) — Groq Console(https://console.groq.com/keys) 발급 키.
 *     등록: npx supabase secrets set GROQ_API_KEY=<새키> --project-ref uyhwhnnzzfhtxjernfit
 *   GROQ_MODEL (선택) — 기본값 'llama-3.3-70b-versatile'
 *
 * [배포]
 *   npx supabase functions deploy ai-briefing --project-ref uyhwhnnzzfhtxjernfit --no-verify-jwt
 */

// ---------------------------------------------------------------------------
// 상수 및 환경 설정
// ---------------------------------------------------------------------------

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_CASCADE = [
  'qwen/qwen3.8-27b',     // 1순위: 0.44초 초고속 & 한국어 에디토리얼 품질 최상위
  'groq/compound-mini',   // 2순위: 초경량 컴파운드
  'groq/compound',        // 3순위: 대용량 컴파운드
];
const DEFAULT_GROQ_MODEL = GROQ_MODELS_CASCADE[0];
const GROQ_TEMPERATURE = 0.72;
const GROQ_MAX_TOKENS = 350;

/**
 * Groq 호출 타임아웃.
 * 프론트(src/main.ts)의 fetch 타임아웃이 3.5초이므로 반드시 그보다 짧아야 한다.
 * 서버가 먼저 끊어야 스스로 정리하고 504를 돌려줄 수 있고, 프론트는 무의미한
 * 대기 없이 곧바로 로컬 템플릿으로 폴백한다.
 */
const GROQ_TIMEOUT_MS = 3_000;

/** 브리핑으로 인정할 최소 길이 (src/main.ts와 동일: 15자 미만이면 폴백) */
const MIN_TEXT_LENGTH = 15;

/**
 * 허용 slot 값 → 프롬프트에 조립할 한글 라벨.
 * 프론트(src/main.ts fetchAiBriefing)는 `SLOT_META[slot].label` 값을 보내며,
 * 영문 슬롯 키도 함께 허용하여 한글 라벨로 정규화한다.
 */
const SLOT_LABELS: Readonly<Record<string, string>> = {
  // 한글 라벨
  '낮': '낮',
  '저녁': '저녁',
  '밤': '밤',
  '숙박': '숙박',
  '숙소': '숙박',
  // 영문 슬롯 키
  day: '낮',
  evening: '저녁',
  night: '밤',
  stay: '숙박',
};

/** 무드 키 → 한글 라벨 (src/main.ts MOODS 및 호환 키) */
const MOOD_LABELS: Readonly<Record<string, string>> = {
  ALL: '전체',
  romantic: '로맨틱',
  trendy: '핫플',
  gourmet: '미식',
  healing: '힐링',
  view: '뷰·전망',
  scenic: '뷰·전망', // 호환성 보장
  luxury: '럭셔리',
  retro: '레트로·전통',
  active: '액티비티',
};

/** 입력 상한 */
const MIN_SPOTS = 1;
const MAX_SPOTS = 4;
const MAX_NAME_LEN = 100;
const MAX_CATEGORY_LEN = 60;
const MAX_SUMMARY_LEN = 300;
const MAX_LOCATION_LEN = 100;
const MAX_PARKING_LEN = 50;
const MAX_PRICE_TIER_LEN = 20;
/** 바디 파싱 전 1차 방어 (스팟 4개 + v4.0 메타데이터 고려하여 16KB로 확장) */
const MAX_BODY_BYTES = 16_384;

// ---------------------------------------------------------------------------
// 레이트리밋 (인메모리 슬라이딩 윈도우)
// ---------------------------------------------------------------------------

const RATE_LIMIT_PER_MINUTE = 25;
const RATE_LIMIT_PER_HOUR = 250;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_TRACKED_IPS = 10_000;

/** IP → 최근 1시간 내 요청 타임스탬프(ms) 오름차순 목록 */
const requestLog = new Map<string, number[]>();

/** 만료(1시간 초과) 타임스탬프를 걷어내고, 비어버린 IP 항목을 제거한다. */
function sweepRateLimiter(now: number): void {
  for (const [ip, stamps] of requestLog) {
    const fresh = stamps.filter((t) => now - t < HOUR_MS);
    if (fresh.length === 0) requestLog.delete(ip);
    else requestLog.set(ip, fresh);
  }
}

/**
 * 요청을 기록하고 한도 초과 여부를 판정한다.
 * @returns 초과 시 `retryAfter`(초)와 위반 윈도우, 통과 시 null
 */
function checkRateLimit(ip: string): { retryAfter: number; scope: string } | null {
  const now = Date.now();

  if (requestLog.size > MAX_TRACKED_IPS) sweepRateLimiter(now);

  const stamps = (requestLog.get(ip) ?? []).filter((t) => now - t < HOUR_MS);

  const inLastMinute = stamps.filter((t) => now - t < MINUTE_MS);
  if (inLastMinute.length >= RATE_LIMIT_PER_MINUTE) {
    requestLog.set(ip, stamps);
    const oldest = inLastMinute[0];
    return {
      retryAfter: Math.max(1, Math.ceil((MINUTE_MS - (now - oldest)) / 1000)),
      scope: 'minute',
    };
  }

  if (stamps.length >= RATE_LIMIT_PER_HOUR) {
    requestLog.set(ip, stamps);
    const oldest = stamps[0];
    return {
      retryAfter: Math.max(1, Math.ceil((HOUR_MS - (now - oldest)) / 1000)),
      scope: 'hour',
    };
  }

  stamps.push(now);
  requestLog.set(ip, stamps);
  return null;
}

/** 클라이언트 IP 추출 */
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

// ---------------------------------------------------------------------------
// CORS / Origin 검증 및 응답 헬퍼
// ---------------------------------------------------------------------------

/**
 * CORS 허용 Origin 판별
 * - 프로덕션: https://nufunc.github.io
 * - 로컬 개발 / 프리뷰 환경: http://localhost:* 또는 http://127.0.0.1:*
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === 'https://nufunc.github.io') return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

/**
 * CORS 헤더 생성.
 * 허용목록에 있는 Origin일 때 Access-Control-Allow-Origin을 반환한다.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin!;
  }
  return headers;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// ---------------------------------------------------------------------------
// 입력 검증
// ---------------------------------------------------------------------------

interface SpotInput {
  /** 검증 단계에서 한글 라벨로 정규화된 값 (낮/저녁/밤/숙박) */
  slotLabel: string;
  name: string;
  category: string;
  summary: string;
  location?: string;
  parking_type?: string;
  price_tier?: string;
  signature_items?: string[];
  curation_badges?: {
    michelin?: string;
    blue_ribbon?: number | string;
    tour_api?: string;
    catchtable?: string;
    [key: string]: unknown;
  };
}

interface BriefingRequest {
  spots: SpotInput[];
  mood: string;
}

/** 선택 필드용 안전 변환 */
function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 요청 바디 검증
 */
function validate(raw: unknown): { data: BriefingRequest } | { error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'body must be a JSON object' };
  }
  const body = raw as Record<string, unknown>;

  // --- mood: 알려진 키만 허용 ---
  const mood = body.mood;
  if (typeof mood !== 'string' || !Object.prototype.hasOwnProperty.call(MOOD_LABELS, mood)) {
    return { error: `mood must be one of: ${Object.keys(MOOD_LABELS).join(', ')}` };
  }

  // --- spots: 길이 1~4 배열 ---
  const spotsRaw = body.spots;
  if (!Array.isArray(spotsRaw)) return { error: 'spots must be an array' };
  if (spotsRaw.length < MIN_SPOTS || spotsRaw.length > MAX_SPOTS) {
    return { error: `spots must contain ${MIN_SPOTS}-${MAX_SPOTS} items` };
  }

  const spots: SpotInput[] = [];
  for (let i = 0; i < spotsRaw.length; i++) {
    const item = spotsRaw[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { error: `spots[${i}] must be an object` };
    }
    const spot = item as Record<string, unknown>;

    const slot = spot.slot;
    if (typeof slot !== 'string' || !Object.prototype.hasOwnProperty.call(SLOT_LABELS, slot)) {
      return { error: `spots[${i}].slot must be one of: ${Object.keys(SLOT_LABELS).join(', ')}` };
    }
    const slotLabel = SLOT_LABELS[slot];

    const name = typeof spot.name === 'string' ? spot.name.trim() : '';
    if (!name) return { error: `spots[${i}].name is required` };
    if (name.length > MAX_NAME_LEN) {
      return { error: `spots[${i}].name exceeds ${MAX_NAME_LEN} characters` };
    }

    const category = optionalString(spot.category);
    if (category.length > MAX_CATEGORY_LEN) {
      return { error: `spots[${i}].category exceeds ${MAX_CATEGORY_LEN} characters` };
    }

    const summary = optionalString(spot.summary);
    if (summary.length > MAX_SUMMARY_LEN) {
      return { error: `spots[${i}].summary exceeds ${MAX_SUMMARY_LEN} characters` };
    }

    const location = optionalString(spot.location);
    const parking_type = optionalString(spot.parking_type);
    const price_tier = optionalString(spot.price_tier);

    let signature_items: string[] | undefined;
    if (Array.isArray(spot.signature_items)) {
      signature_items = spot.signature_items
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 50))
        .slice(0, 5);
      if (signature_items.length === 0) signature_items = undefined;
    }

    let curation_badges: SpotInput['curation_badges'] | undefined;
    if (typeof spot.curation_badges === 'object' && spot.curation_badges !== null && !Array.isArray(spot.curation_badges)) {
      const cb = spot.curation_badges as Record<string, unknown>;
      curation_badges = {
        michelin: typeof cb.michelin === 'string' ? cb.michelin.slice(0, 50) : undefined,
        blue_ribbon: (typeof cb.blue_ribbon === 'number' || typeof cb.blue_ribbon === 'string') ? cb.blue_ribbon : undefined,
        tour_api: typeof cb.tour_api === 'string' ? cb.tour_api.slice(0, 50) : undefined,
        catchtable: typeof cb.catchtable === 'string' ? cb.catchtable.slice(0, 50) : undefined,
      };
      if (!curation_badges.michelin && !curation_badges.blue_ribbon && !curation_badges.tour_api && !curation_badges.catchtable) {
        curation_badges = undefined;
      }
    }

    spots.push({
      slotLabel,
      name,
      category,
      summary,
      location: location.length > 0 ? location.slice(0, MAX_LOCATION_LEN) : undefined,
      parking_type: parking_type.length > 0 ? parking_type.slice(0, MAX_PARKING_LEN) : undefined,
      price_tier: price_tier.length > 0 ? price_tier.slice(0, MAX_PRICE_TIER_LEN) : undefined,
      signature_items,
      curation_badges,
    });
  }

  return { data: { spots, mood } };
}

// ---------------------------------------------------------------------------
// 프롬프트 조립 (Llama 3.3 감성 큐레이션 엔진 + v4.0 메타데이터)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `당신은 감성 라이프스타일 매거진(킨포크, 아이즈매거진)의 수석 데이트 코스 큐레이터입니다.
주어진 장소 목록(스팟명, 카테고리, 요약, 위치)과 v4.0 메타데이터(블루리본/미쉐린 인증, 시그니처 메뉴, 가격대, 주차/발렛 정보) 및 분위기(무드 테마)를 바탕으로, 두 사람의 하루를 완성하는 다채롭고 감각적인 2~3줄 맞춤형 코스 브리핑을 작성합니다.

[핵심 어조 및 다채로운 톤앤매너 가이드라인 (매우 중요)]
1. 문어체 서술형 종결어미(~한다, ~남긴다, ~맞이한다, ~이어간다 ❌)는 절대 사용하지 마세요.
2. 매 추천마다 단조롭지 않게, 상황과 장소의 매력에 맞추어 아래 5가지 다채로운 에디토리얼 어조를 풍성하게 활용하세요:
   • 🌸 다정하고 세련된 매거진 톤: "~해서 둘만의 특별한 시간을 보내기 참 좋은 데이트 코스예요!", "~와 함께 여유로운 오후를 다정하게 시작해보세요."
   • ✨ 핫플 & 트렌드 가이드 톤: "~의 힙한 무드가 돋보여서 강력 추천해요!", "~와 근사한 테이블이 어우러져 실패 없는 데이트가 될 거예요!"
   • 🍷 미식 & 페어링 큐레이터 톤: "~가 자랑하는 섬세한 요리를 오롯이 만끽할 수 있는 미식 코스입니다.", "~의 대표 시그니처와 함께 달콤한 마무리를 추천해요."
   • 🌿 힐링 & 시적 감성 톤: "~의 은은한 조명이 로맨틱한 밤으로 어우러질 수 있어요.", "~에서 따스한 계절의 온기를 기분 좋게 맞이할 수 있어요."
   • 🚗 드라이브 & 실용 컨시어지 톤: "~는 주차가 편리해 드라이브 코스로 제격이에요.", "~만의 탁 트인 뷰를 즐기며 둘만의 깊은 대화를 나눠보세요."

3. 종결어미를 매번 다채롭게 변주하세요:
   - "~하는 데이트 코스예요!" / "~하기 좋은 코스입니다."
   - "~해서 강력 추천해요!" / "~만의 매력을 오롯이 만끽해보세요."
   - "~와 자연스럽게 어우러질 수 있어요." / "~을 다정하게 맞이할 수 있어요."
   - "~로 하루가 더욱 특별해질 거예요." / "~에서 잊지 못할 추억을 완성해보세요."

[핵심 작성 원칙]
1. 분량 및 구성 (2~3문장, 약 120~220자):
   - 1~2문장: 시간의 자연스러운 흐름(낮의 햇살/커피/산책 → 저녁의 미식/노을 → 밤의 조명/와인/야경 → 숙박의 쉼)과 공간의 감각적 매력을 엮은 코스 스토리.
   - 마지막 1문장: 해당 코스를 200% 만끽할 수 있는 실용 팁이나 다정한 추천 포인트 (예: 발렛/주차 편의, 대표 시그니처 메뉴 페어링, 프라이빗 뷰 포인트 등).

2. v4.0 메타데이터의 자연스럽고 감각적인 활용:
   - 인증 배지: 블루리본 서베이나 미쉐린 가이드 인증이 있다면 "블루리본 인증을 받은 대표 파스타 맛집", "미쉐린이 인정한 정갈한 테이블"처럼 신뢰감을 주는 에디토리얼 표현으로 자연스럽게 녹여냅니다.
   - 시그니처 메뉴: 장소의 대표 시그니처 메뉴가 제공되면 미식 스토리텔링이나 추천 팁에 매력적인 포인트로 언급합니다.
   - 주차/편의: 발렛 파킹이나 편리한 주차가 지원되는 장소라면 "발렛 주차가 편리한 야경 와인바라 드라이브 데이트로 추천해요", "주차 부담 없이 여유롭게 즐길 수 있어요"처럼 운전자를 배려한 실용 팁으로 활용합니다.
   - 가격대: 가성비 좋은 캐주얼 데이트(₩)부터 특별한 기념일을 위한 럭셔리 다이닝(₩₩₩₩)까지 분위기에 맞는 격조와 톤을 살립니다.
   - ※ 모든 메타데이터를 나열식으로 억지로 채우지 말고, 코스에서 가장 돋보이는 1~2가지 매력 포인트를 세련되게 연결하세요.

3. 8대 무드 테마별 톤앤매너 완벽 반영:
   - 로맨틱 (romantic): 설렘, 은은한 조명, 다정한 시선과 둘만의 깊은 대화.
   - 힐링 (healing): 숲과 자연의 여백, 고요한 숨고르기와 따스한 위로.
   - 미식 (gourmet): 풍부한 아로마와 페어링, 정갈한 플레이팅과 미각의 즐거움.
   - 핫플 (trendy): 트렌디한 감각, 감각적인 공간 미학과 위트 있는 에너지.
   - 뷰·전망 (view): 탁 트인 시야, 아름다운 노을과 윤슬, 반짝이는 도시 야경.
   - 럭셔리 (luxury): 격조 높은 우아함, 프라이빗하고 특별한 대접의 순간.
   - 레트로·전통 (retro): 아날로그 감성, 시간의 결이 묻어나는 아늑한 골목 정취.
   - 액티비티 (active): 생동감 넘치는 움직임, 함께 몰입하는 유쾌한 활력.

4. 시간대별 슬롯(낮/저녁/밤/숙박) 흐름 반영:
   - 낮: 햇살, 여유로운 오후, 커피/베이커리/전시/산책.
   - 저녁: 그윽한 노을, 정갈한 식사와 테이블.
   - 밤: 은은한 조명, 와인/바, 깊어지는 밤의 낭만.
   - 숙박: 하루의 온전한 쉼, 아늑한 프라이빗 휴식.

5. 절대 금지 사항:
   - 문어체 종결어미 (~한다, ~남긴다, ~맞이한다 ❌).
   - 장소의 실제 카테고리와 다른 활동 묘사 금지 (예: 미술관에 "식사", 카페에 "전시 관람" 등 실제 카테고리와 어긋나는 묘사 ❌).
   - 단순 나열식 문형 금지 ("~에서 시작해 ~를 거쳐 ~로 끝나는 코스입니다" ❌).
   - 과장된 클리셰 금지 ("오감이 충만", "터져 나오는", "환상적인 케미" ❌).
   - 마크다운 볼드(**), 불릿 기호(-), 큰따옴표 없이 깔끔한 순수 한글 문장만 출력하세요.`;

/** v4.0 메타데이터를 포함한 스팟별 상세 설명 줄 목록 생성 */
function buildSpotDescriptions(spots: SpotInput[]): string {
  return spots
    .map((spot) => {
      const metaDetails: string[] = [];
      if (spot.category) metaDetails.push(`카테고리: ${spot.category}`);
      if (spot.location) metaDetails.push(`위치: ${spot.location}`);
      if (spot.summary) metaDetails.push(`소개: ${spot.summary}`);

      // 배지 인증 정보
      if (spot.curation_badges) {
        const badges: string[] = [];
        const cb = spot.curation_badges;
        if (cb.blue_ribbon) badges.push(`블루리본 서베이(${cb.blue_ribbon})`);
        if (cb.michelin) badges.push(`미쉐린 가이드(${cb.michelin})`);
        if (cb.tour_api) badges.push('한국관광공사 추천');
        if (cb.catchtable) badges.push('캐치테이블 인기');
        if (badges.length > 0) metaDetails.push(`인증: ${badges.join(', ')}`);
      }

      // 시그니처 메뉴
      if (spot.signature_items && spot.signature_items.length > 0) {
        metaDetails.push(`시그니처: ${spot.signature_items.join(', ')}`);
      }

      // 가격대
      if (spot.price_tier) {
        metaDetails.push(`가격대: ${spot.price_tier}`);
      }

      // 주차 정보
      if (spot.parking_type) {
        metaDetails.push(`주차: ${spot.parking_type}`);
      }

      return `- ${spot.slotLabel}: ${spot.name} (${metaDetails.join(' | ')})`;
    })
    .join('\n');
}

function buildUserPrompt(spots: SpotInput[], mood: string): string {
  const moodLabel = MOOD_LABELS[mood] || mood;
  return `[스팟 리스트 — 슬롯, 카테고리 및 v4.0 메타데이터를 참고하세요]\n${buildSpotDescriptions(spots)}\n\n[무드 테마]: ${moodLabel}\n\n위 장소들의 실제 카테고리와 v4.0 메타데이터(블루리본/미쉐린, 시그니처 메뉴, 발렛/주차 팁 등)를 적절히 녹여내어, 매거진 에디터가 추천하는 듯한 실용적이고 감각적인 2~3줄 코스 스토리와 데이트 팁을 작성해주세요.`;
}

// ---------------------------------------------------------------------------
// Groq 호출
// ---------------------------------------------------------------------------

type GroqOutcome =
  | { ok: true; text: string }
  | { ok: false; status: 502 | 504; error: string };

async function callGroq(apiKey: string, spots: SpotInput[], mood: string): Promise<GroqOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  const customModel = Deno.env.get('GROQ_MODEL');
  const modelsToTry = customModel ? [customModel] : GROQ_MODELS_CASCADE;
  const userPrompt = buildUserPrompt(spots, mood);

  try {
    for (const targetModel of modelsToTry) {
      if (controller.signal.aborted) break;

      const requestBody: Record<string, unknown> = {
        model: targetModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: GROQ_TEMPERATURE,
        max_tokens: GROQ_MAX_TOKENS,
      };

      if (targetModel.includes('gpt-oss') || targetModel.includes('deepseek-r1') || targetModel.includes('qwen-qwq')) {
        requestBody.reasoning_effort = 'low';
      }

      try {
        const res = await fetch(GROQ_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          console.warn(`[ai-briefing] model ${targetModel} upstream ${res.status}: ${detail.slice(0, 200)} → 다음 모델 시도`);
          continue;
        }

        const data = await res.json().catch(() => null);
        const rawText = data?.choices?.[0]?.message?.content?.trim();
        if (typeof rawText !== 'string' || rawText.length < MIN_TEXT_LENGTH) {
          console.warn(`[ai-briefing] model ${targetModel} returned empty completion → 다음 모델 시도`);
          continue;
        }

        const cleanText = rawText
          .replace(/^["'“”]/, '')
          .replace(/["'“”]$/, '')
          .replace(/\*\*/g, '')
          .trim();

        return { ok: true, text: cleanText };
      } catch (innerErr) {
        if (innerErr instanceof DOMException && innerErr.name === 'AbortError') {
          break;
        }
        console.warn(`[ai-briefing] model ${targetModel} fetch error:`, innerErr);
        continue;
      }
    }

    return { ok: false, status: 502, error: 'all upstream models failed' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error(`[ai-briefing] groq timed out after ${GROQ_TIMEOUT_MS}ms`);
      return { ok: false, status: 504, error: 'upstream timeout' };
    }
    console.error('[ai-briefing] groq fetch failed:', err);
    return { ok: false, status: 502, error: 'upstream unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');

  // 1) CORS 프리플라이트 — 허용 Origin이면 204, 아니면 403
  if (req.method === 'OPTIONS') {
    if (isAllowedOrigin(origin)) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    return jsonResponse({ error: 'origin not allowed' }, 403, origin);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405, origin, { Allow: 'POST, OPTIONS' });
  }

  // 2) Origin 허용목록 검증
  //    웹 브라우저의 무단 남용 방지
  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: 'origin not allowed' }, 403, origin);
  }

  // 3) 레이트리밋
  const ip = clientIp(req);
  const limited = checkRateLimit(ip);
  if (limited) {
    return jsonResponse(
      { error: `rate limit exceeded (per ${limited.scope})` },
      429,
      origin,
      { 'Retry-After': String(limited.retryAfter) },
    );
  }

  // 4) 바디 크기 1차 방어
  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'payload too large' }, 400, origin);
  }

  // 5) 파싱 + 검증
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'payload too large' }, 400, origin);
    }
    raw = JSON.parse(text);
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400, origin);
  }

  const validated = validate(raw);
  if ('error' in validated) {
    return jsonResponse({ error: validated.error }, 400, origin);
  }

  // 6) 시크릿 확인
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    console.error('[ai-briefing] GROQ_API_KEY secret is not set');
    return jsonResponse({ error: 'service unavailable' }, 502, origin);
  }

  // 7) Groq 호출
  const { spots, mood } = validated.data;
  const outcome = await callGroq(apiKey, spots, mood);
  if (!outcome.ok) {
    return jsonResponse({ error: outcome.error }, outcome.status, origin);
  }

  return jsonResponse({ text: outcome.text }, 200, origin);
});
