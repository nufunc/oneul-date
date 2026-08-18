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
 *   - 모델/프롬프트/파라미터는 src/main.ts의 fetchGroqAiStory와 1:1로 동일하다.
 *     (프론트 로컬 폴백 텍스트와 톤이 어긋나지 않게 하기 위함)
 *   - 실패는 조용히. 프론트가 로컬 템플릿(generateCourseStory)으로 폴백할 수
 *     있도록 에러 응답에도 CORS 헤더를 반드시 붙인다.
 *
 * [요청] — src/main.ts fetchAiBriefing과 확정된 계약
 *   POST /functions/v1/ai-briefing
 *   Content-Type: application/json   (Authorization 헤더 없음 → --no-verify-jwt 필요)
 *   {
 *     "spots": [ { "slot": "낮", "name": "...", "category": "...", "summary": "..." } ],
 *     "mood": "romantic"
 *   }
 *   - `slot`은 한글 라벨(낮/저녁/밤/숙박)로 온다. 영문 키(day/evening/night/stay)도
 *     호환을 위해 허용하며 서버에서 한글 라벨로 정규화한다.
 *   - `mood`는 raw 키(ALL/romantic/...)로 오고, 한글 라벨 변환은 서버 담당이다.
 *
 * [응답]
 *   200 { "text": "..." }            브리핑 본문 (프론트는 trim 후 15자 이상일 때만 채택)
 *   400 { "error": "..." }           입력 검증 실패
 *   403 { "error": "..." }           허용되지 않은 Origin
 *   405 { "error": "..." }           POST/OPTIONS 외 메서드
 *   429 { "error": "..." }           레이트리밋 초과
 *   502 { "error": "..." }           Groq 오류 또는 빈 응답
 *   504 { "error": "..." }           Groq 타임아웃(3초)
 *   프론트는 실패 상태코드·네트워크 오류를 모두 조용히 삼키고 로컬 템플릿으로
 *   폴백하므로, 에러 응답에도 CORS 헤더가 붙어야 브라우저 콘솔이 깨끗하다.
 *
 * [환경변수 / 시크릿]
 *   GROQ_API_KEY (필수) — Groq Console(https://console.groq.com/keys) 발급 키.
 *     등록: npx supabase secrets set GROQ_API_KEY=<새키> --project-ref uyhwhnnzzfhtxjernfit
 *
 * [배포]
 *   npx supabase functions deploy ai-briefing --project-ref uyhwhnnzzfhtxjernfit --no-verify-jwt
 *   자세한 절차·키 회전·검증 curl은 docs/EDGE-FUNCTION.md 참고.
 *
 * 외부 의존성 없음 (Deno 표준 런타임 API만 사용).
 */

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** CORS 허용 Origin 목록 (프로덕션 GitHub Pages + 로컬 Vite 개발 서버) */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'https://nufunc.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_TEMPERATURE = 0.72;

/**
 * ⚠️ `openai/gpt-oss-120b`는 **추론(reasoning) 모델**이다.
 *
 * max_tokens는 `추론 토큰 + 출력 토큰`을 합산해 제한하며, 추론이 예산을 다 쓰면
 * `finish_reason: "length"`와 함께 **`message.content`가 빈 문자열로** 돌아온다
 * (실제 답변은 응답의 `reasoning` 필드에 갇힌다).
 *
 * src/main.ts의 기존 설정(max_tokens 150, reasoning_effort 미지정)이 정확히 이
 * 상태였다 — 실측 결과 추론에만 145/150 토큰을 쓰고 content는 항상 비었다.
 * 즉 기존 AI 브리핑은 사실상 매번 로컬 템플릿으로 폴백하고 있었다.
 *
 * 그래서 이식하면서 두 가지를 바로잡았다 (프롬프트·모델·temperature는 그대로):
 *   1) reasoning_effort: 'low'  → 추론 토큰을 20~40개 수준으로 억제
 *   2) max_tokens: 400          → 추론이 조금 길어져도 본문이 잘리지 않을 여유
 * 이 조합에서 finish_reason은 'stop', 실제 소비는 90~100 토큰 안팎이다.
 *
 * 이 두 값을 되돌리면 브리핑이 조용히 전부 폴백하니 주의할 것.
 */
const GROQ_MAX_TOKENS = 400;
const GROQ_REASONING_EFFORT = 'low';
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
 *
 * 프론트(src/main.ts fetchAiBriefing)는 `SLOT_META[slot].label`, 즉 **한글 라벨**을
 * 그대로 보낸다. 기존 프롬프트의 스팟 줄이 한글 라벨을 쓰고 있어 서버가 추가
 * 매핑 없이 조립할 수 있게 맞춘 계약이다.
 * 다만 영문 키(day/evening/night/stay)로 보내는 클라이언트도 깨지지 않도록
 * 양쪽을 모두 허용하고 한글 라벨로 정규화한다.
 * '숙소'는 '숙박'의 동의 표기로 함께 받아준다(호출자마다 표기가 갈릴 수 있음).
 */
const SLOT_LABELS: Readonly<Record<string, string>> = {
  // 한글 라벨 (프론트가 실제로 보내는 형태)
  '낮': '낮',
  '저녁': '저녁',
  '밤': '밤',
  '숙박': '숙박',
  '숙소': '숙소',
  // 영문 슬롯 키 → 한글 라벨 정규화
  day: '낮',
  evening: '저녁',
  night: '밤',
  stay: '숙박',
};

/** 무드 키 → 한글 라벨 (src/main.ts MOODS). 이 목록에 없는 키는 400. */
const MOOD_LABELS: Readonly<Record<string, string>> = {
  ALL: '전체',
  romantic: '로맨틱',
  trendy: '핫플',
  gourmet: '미식',
  healing: '힐링',
  view: '뷰·전망',
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
/** 바디 파싱 전 1차 방어 (스팟 4개 상한이면 수 KB로 충분) */
const MAX_BODY_BYTES = 8_192;

// ---------------------------------------------------------------------------
// 레이트리밋 (인메모리 슬라이딩 윈도우)
// ---------------------------------------------------------------------------
//
// 주의: Edge Function은 요청량/리전에 따라 여러 인스턴스로 확장될 수 있고,
// 유휴 인스턴스는 회수(cold start)되어 카운터가 초기화된다. 따라서 이 카운터는
// 인스턴스 로컬이며 전역적으로 정확하지 않다 — 실제 허용량은 최악의 경우
// (동시 인스턴스 수 × 아래 한도)까지 늘어날 수 있다.
// 목적은 "완벽한 차단"이 아니라 "단일 클라이언트의 폭주로 Groq 무료 쿼터가
// 순식간에 소진되는 것"을 막는 것이다. 엄격한 보장이 필요해지면 Postgres나
// Upstash Redis 같은 공유 저장소 기반으로 옮겨야 한다.

const RATE_LIMIT_PER_MINUTE = 20;
const RATE_LIMIT_PER_HOUR = 200;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
/** 메모리 폭주 방지: 추적 중인 IP가 이 수를 넘으면 만료 항목을 청소한다. */
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

  // 1시간 윈도우 밖 기록은 버린다
  const stamps = (requestLog.get(ip) ?? []).filter((t) => now - t < HOUR_MS);

  const inLastMinute = stamps.filter((t) => now - t < MINUTE_MS);
  if (inLastMinute.length >= RATE_LIMIT_PER_MINUTE) {
    // 정리된 목록은 반영하되, 차단된 이번 요청은 기록하지 않는다
    // (차단 요청까지 세면 윈도우가 계속 밀려 영구 차단이 된다)
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

/**
 * 클라이언트 IP 추출. Supabase Edge Runtime은 x-forwarded-for에
 * "client, proxy1, proxy2" 형태로 넣어주므로 첫 주소를 쓴다.
 * 헤더는 위조 가능하지만, 레이트리밋의 목적(폭주 차단)에는 충분하다.
 */
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

// ---------------------------------------------------------------------------
// CORS / 응답 헬퍼
// ---------------------------------------------------------------------------

/**
 * CORS 헤더 생성.
 * 허용목록에 있는 Origin일 때만 Access-Control-Allow-Origin을 반환한다.
 * 403 응답에도 나머지 CORS 헤더는 붙여, 디버깅 시 "CORS 설정 누락"과
 * "의도적 차단"이 구분되도록 한다.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    // Origin에 따라 응답 헤더가 달라지므로 캐시 오염 방지
    'Vary': 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
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
      // AI 브리핑은 개인화 결과 — 중간 캐시에 남기지 않는다.
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
}

interface BriefingRequest {
  spots: SpotInput[];
  mood: string;
}

/** 선택 필드용: 문자열이 아니면 빈 문자열 (src/main.ts의 `s.category || ''`와 동일 동작) */
function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 요청 바디를 검증한다.
 * @returns 성공 시 `{ data }`, 실패 시 `{ error }` (400으로 응답)
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

    spots.push({ slotLabel, name, category, summary });
  }

  return { data: { spots, mood } };
}

// ---------------------------------------------------------------------------
// 프롬프트 조립 (src/main.ts fetchGroqAiStory에서 그대로 이식)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `당신은 킨포크(Kinfolk)와 아이즈매거진(eyesmag)의 수석 데이트 큐레이터입니다.
[절대 금지]
1. 장소의 실제 카테고리와 다른 활동 묘사 금지 (예: 미술관에 "티타임", 카페에 "전시 관람" 등 ❌).
2. 단순 동선 나열식 문형(~에서 시작해 ~를 거쳐 ~로 마무리하는 코스예요)은 '절대 금지'.
3. "터져 나오는", "오감이 충만", "감각적인 코스" 같은 과장된 클리셰 금지.
4. 장소명을 3개 이상 억지로 나열하지 마세요. 코스 전체 분위기를 1~2곳만 자연스럽게 언급하며 압축하세요.

[필수 원칙]
1. 각 장소의 카테고리(미술관, 식당, 카페, 바 등)에 정확히 부합하는 체험을 묘사하세요.
2. 공간의 질감, 빛, 두 사람의 감정선이 자연스럽게 이어지는 에디토리얼 산문(1~2문장, 60~90자)으로 작성하세요.
3. 불필요한 따옴표나 서두 없이 정제된 본문 텍스트만 출력하세요.

[톤앤매너 예시]
- 나른한 오후, 러스트베이커리의 버터 풍미를 따라가다 양키통닭의 바삭한 온기를 지나 신흥상회에서 와인 한잔에 젖어드는 둘만의 깊은 밤.
- 서울숲 산책로에 드리운 나른한 빛, 정갈한 다이닝의 여운, 그리고 루프탑에서 마주하는 도시의 밤.`;

/** "낮: 러스트베이커리 (베이커리, 버터향 가득한 ...)" 형태의 줄 목록 */
function buildSpotDescriptions(spots: SpotInput[]): string {
  return spots
    .map((spot) => `${spot.slotLabel}: ${spot.name} (${spot.category}, ${spot.summary})`)
    .join('\n');
}

function buildUserPrompt(spots: SpotInput[], mood: string): string {
  return `[스팟 리스트 — 카테고리를 반드시 참고하세요]\n${buildSpotDescriptions(spots)}\n\n[무드 테마]: ${MOOD_LABELS[mood]}\n\n위 장소들의 실제 카테고리에 맞는 체험을 살려, 과장 없이 잡지 에디터 노트 스타일로 브리핑을 작성해줘.`;
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

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(spots, mood) },
        ],
        temperature: GROQ_TEMPERATURE,
        max_tokens: GROQ_MAX_TOKENS,
        // 추론 모델 전용 — 상단 GROQ_MAX_TOKENS 주석 참고
        reasoning_effort: GROQ_REASONING_EFFORT,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 업스트림 응답 본문은 계정/쿼터 정보를 담을 수 있으므로
      // 클라이언트로 전달하지 않고 함수 로그에만 남긴다.
      const detail = await res.text().catch(() => '');
      console.error(`[ai-briefing] groq upstream ${res.status}: ${detail.slice(0, 500)}`);
      return { ok: false, status: 502, error: 'upstream error' };
    }

    const data = await res.json().catch(() => null);
    const rawText = data?.choices?.[0]?.message?.content?.trim();
    if (typeof rawText !== 'string' || rawText.length < MIN_TEXT_LENGTH) {
      console.error('[ai-briefing] groq returned an empty or too-short completion');
      return { ok: false, status: 502, error: 'empty completion' };
    }

    // 앞뒤 따옴표 제거 (src/main.ts와 동일한 후처리)
    const cleanText = rawText.replace(/^["'“”]/, '').replace(/["'“”]$/, '').trim();
    return { ok: true, text: cleanText };
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
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    return jsonResponse({ error: 'origin not allowed' }, 403, origin);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405, origin, { Allow: 'POST, OPTIONS' });
  }

  // 2) Origin 허용목록
  //    Origin 헤더가 없는 요청(curl, 서버 간 호출)도 차단한다. 이 엔드포인트는
  //    브라우저 전용이므로 비브라우저 호출을 허용할 이유가 없다.
  //    (헤더 위조 자체는 막을 수 없지만, 웹에서 유입되는 대량 남용은 차단된다.)
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
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
