-- ==============================================================================
-- 오늘 데이트 (oneul-date) — Supabase PostgreSQL Schema (v4.0 대형화 & 다각화 확장)
-- ==============================================================================

-- 1. 확장 기능 활성화 (PostGIS 공간 쿼리 및 한국어/영문 트리그램 유사도)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. 데이트 스팟 테이블 생성 (신규 설치용 마스터 DDL)
CREATE TABLE IF NOT EXISTS public.spots (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    slot TEXT CHECK (slot IN ('day', 'evening', 'night', 'stay')),
    region TEXT NOT NULL,
    area TEXT,
    address TEXT,
    mood TEXT[] DEFAULT '{}'::TEXT[],
    location TEXT,
    price TEXT,
    summary TEXT,
    category TEXT,
    image_url TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    geom GEOGRAPHY(Point, 4326),
    quality_score INTEGER DEFAULT 50,
    fail_count INTEGER DEFAULT 0,
    source JSONB DEFAULT '{}'::JSONB,
    verified BOOLEAN DEFAULT false,
    is_closed BOOLEAN DEFAULT false,
    
    -- [v4.0 확장] 운영 시간 및 휴무일
    business_hours JSONB DEFAULT '{}'::JSONB,
    break_time JSONB DEFAULT '{}'::JSONB,
    closed_days TEXT[] DEFAULT '{}'::TEXT[],
    is_24h BOOLEAN DEFAULT false,

    -- [v4.0 확장] 주차 & 교통
    parking_type TEXT DEFAULT 'unknown',
    parking_info JSONB DEFAULT '{"type":"unknown"}'::JSONB,
    parking_detail TEXT,
    subway_info TEXT,

    -- [v4.0 확장] 예약 & 링크
    reservation_type TEXT DEFAULT 'none',
    reservation_url TEXT,
    booking_tips TEXT,
    booking_info JSONB DEFAULT '{}'::JSONB,

    -- [v4.0 확장] 가격대 & 메뉴
    price_tier TEXT CHECK (price_tier IN ('₩', '₩₩', '₩₩₩', '₩₩₩₩', 'FREE') OR price_tier IS NULL),
    avg_price_per_person INTEGER,
    signature_items TEXT[] DEFAULT '{}'::TEXT[],

    -- [v4.0 확장] 세부 분위기 & 데이트 상황 태그
    mood_tags TEXT[] DEFAULT '{}'::TEXT[],
    date_contexts TEXT[] DEFAULT '{}'::TEXT[],

    -- [v4.0 확장] 큐레이션 인증 뱃지 & 고유 Provider IDs
    curation_badges JSONB DEFAULT '{}'::JSONB,
    provider_ids JSONB DEFAULT '{}'::JSONB,
    ai_summary_editorial TEXT,

    -- [v4.0 확장] 소셜 메트릭 & 핫스코어
    social_links JSONB DEFAULT '{}'::JSONB,
    metrics JSONB DEFAULT '{}'::JSONB,
    hot_score NUMERIC(4, 1) DEFAULT 50.0,

    -- [v4.0 확장] 라이프사이클 및 검증 추적
    last_verified_at TIMESTAMPTZ,
    fts_tokens TSVECTOR,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2-1. 기존 테이블 호환을 위한 신규 컬럼 안전 추가 (ALTER TABLE IF NOT EXISTS)
DO $$ 
BEGIN
    -- 카테고리 / 이미지 / 좌표
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='category') THEN
        ALTER TABLE public.spots ADD COLUMN category TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='image_url') THEN
        ALTER TABLE public.spots ADD COLUMN image_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='lat') THEN
        ALTER TABLE public.spots ADD COLUMN lat DOUBLE PRECISION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='lng') THEN
        ALTER TABLE public.spots ADD COLUMN lng DOUBLE PRECISION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='geom') THEN
        ALTER TABLE public.spots ADD COLUMN geom GEOGRAPHY(Point, 4326);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='quality_score') THEN
        ALTER TABLE public.spots ADD COLUMN quality_score INTEGER DEFAULT 50;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='fail_count') THEN
        ALTER TABLE public.spots ADD COLUMN fail_count INTEGER DEFAULT 0;
    END IF;

    -- 운영시간 / 휴무
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='business_hours') THEN
        ALTER TABLE public.spots ADD COLUMN business_hours JSONB DEFAULT '{}'::JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='break_time') THEN
        ALTER TABLE public.spots ADD COLUMN break_time JSONB DEFAULT '{}'::JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='closed_days') THEN
        ALTER TABLE public.spots ADD COLUMN closed_days TEXT[] DEFAULT '{}'::TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='is_24h') THEN
        ALTER TABLE public.spots ADD COLUMN is_24h BOOLEAN DEFAULT false;
    END IF;

    -- 주차 / 교통
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='parking_type') THEN
        ALTER TABLE public.spots ADD COLUMN parking_type TEXT DEFAULT 'unknown';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='parking_info') THEN
        ALTER TABLE public.spots ADD COLUMN parking_info JSONB DEFAULT '{"type":"unknown"}'::JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='parking_detail') THEN
        ALTER TABLE public.spots ADD COLUMN parking_detail TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='subway_info') THEN
        ALTER TABLE public.spots ADD COLUMN subway_info TEXT;
    END IF;

    -- 예약 / 링크
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='reservation_type') THEN
        ALTER TABLE public.spots ADD COLUMN reservation_type TEXT DEFAULT 'none';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='reservation_url') THEN
        ALTER TABLE public.spots ADD COLUMN reservation_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='booking_tips') THEN
        ALTER TABLE public.spots ADD COLUMN booking_tips TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='booking_info') THEN
        ALTER TABLE public.spots ADD COLUMN booking_info JSONB DEFAULT '{}'::JSONB;
    END IF;

    -- 가격 / 메뉴
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='price_tier') THEN
        ALTER TABLE public.spots ADD COLUMN price_tier TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='avg_price_per_person') THEN
        ALTER TABLE public.spots ADD COLUMN avg_price_per_person INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='signature_items') THEN
        ALTER TABLE public.spots ADD COLUMN signature_items TEXT[] DEFAULT '{}'::TEXT[];
    END IF;

    -- 세부 분위기 & 데이트 태그
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='mood_tags') THEN
        ALTER TABLE public.spots ADD COLUMN mood_tags TEXT[] DEFAULT '{}'::TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='date_contexts') THEN
        ALTER TABLE public.spots ADD COLUMN date_contexts TEXT[] DEFAULT '{}'::TEXT[];
    END IF;

    -- 큐레이션 뱃지 & 식별자
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='curation_badges') THEN
        ALTER TABLE public.spots ADD COLUMN curation_badges JSONB DEFAULT '{}'::JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='provider_ids') THEN
        ALTER TABLE public.spots ADD COLUMN provider_ids JSONB DEFAULT '{}'::JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='ai_summary_editorial') THEN
        ALTER TABLE public.spots ADD COLUMN ai_summary_editorial TEXT;
    END IF;

    -- 소셜 메트릭 & 핫스코어
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='social_links') THEN
        ALTER TABLE public.spots ADD COLUMN social_links JSONB DEFAULT '{}'::JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='metrics') THEN
        ALTER TABLE public.spots ADD COLUMN metrics JSONB DEFAULT '{}'::JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='hot_score') THEN
        ALTER TABLE public.spots ADD COLUMN hot_score NUMERIC(4, 1) DEFAULT 50.0;
    END IF;

    -- 검증 라이프사이클 & FTS
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='last_verified_at') THEN
        ALTER TABLE public.spots ADD COLUMN last_verified_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='fts_tokens') THEN
        ALTER TABLE public.spots ADD COLUMN fts_tokens TSVECTOR;
    END IF;
END $$;

-- 3. 기존 lat, lng 기반 geom 포인트 일괄 생성
UPDATE public.spots
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
WHERE lat IS NOT NULL AND lng IS NOT NULL AND geom IS NULL;

-- 4. lat, lng 변경 시 geom 및 FTS 자동 동기화 트리거
CREATE OR REPLACE FUNCTION public.handle_spots_sync()
RETURNS TRIGGER AS $$
BEGIN
    -- 공간 포인트 동기화
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
    ELSE
        NEW.geom := NULL;
    END IF;

    -- 한국어 통합 전문 검색 FTS 토큰 생성
    NEW.fts_tokens := 
        to_tsvector('simple', COALESCE(NEW.name, '')) ||
        to_tsvector('simple', COALESCE(NEW.category, '')) ||
        to_tsvector('simple', COALESCE(NEW.area, '')) ||
        to_tsvector('simple', COALESCE(NEW.location, '')) ||
        to_tsvector('simple', COALESCE(array_to_string(NEW.signature_items, ' '), '')) ||
        to_tsvector('simple', COALESCE(array_to_string(NEW.mood_tags, ' '), ''));

    NEW.updated_at := TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_spots_sync ON public.spots;
CREATE TRIGGER trg_spots_sync
    BEFORE INSERT OR UPDATE ON public.spots
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_spots_sync();

-- 5. 초고속 검색 & 공간 쿼리 인덱스 최적화
CREATE INDEX IF NOT EXISTS idx_spots_region ON public.spots (region);
CREATE INDEX IF NOT EXISTS idx_spots_slot ON public.spots (slot);
CREATE INDEX IF NOT EXISTS idx_spots_is_closed ON public.spots (is_closed);
CREATE INDEX IF NOT EXISTS idx_spots_area ON public.spots (area);
CREATE INDEX IF NOT EXISTS idx_spots_quality ON public.spots (quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_spots_hot_score ON public.spots (hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_spots_mood ON public.spots USING GIN (mood);
CREATE INDEX IF NOT EXISTS idx_spots_mood_tags ON public.spots USING GIN (mood_tags);
CREATE INDEX IF NOT EXISTS idx_spots_date_contexts ON public.spots USING GIN (date_contexts);
CREATE INDEX IF NOT EXISTS idx_spots_signature ON public.spots USING GIN (signature_items);
CREATE INDEX IF NOT EXISTS idx_spots_geom ON public.spots USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_spots_fts ON public.spots USING GIN (fts_tokens);
CREATE INDEX IF NOT EXISTS idx_spots_trgm_name ON public.spots USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_spots_verification_queue ON public.spots (is_closed, last_verified_at ASC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_spots_provider_naver ON public.spots ((provider_ids->>'naver'));
CREATE INDEX IF NOT EXISTS idx_spots_provider_kakao ON public.spots ((provider_ids->>'kakao'));

-- 6. 전국 행정구역 마이닝 분산 큐 테이블 (250개 시·군·구 균등 수집용)
CREATE TABLE IF NOT EXISTS public.administrative_divisions (
    id SERIAL PRIMARY KEY,
    region TEXT NOT NULL,
    area TEXT NOT NULL,
    adm_code TEXT UNIQUE,
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    target_count INTEGER DEFAULT 300,
    current_count INTEGER DEFAULT 0,
    last_mined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_mined_queue ON public.administrative_divisions (last_mined_at ASC NULLS FIRST);

-- 7. Row Level Security (RLS) 보안 정책 설정
ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrative_divisions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spots' AND policyname = 'Allow public read access for active spots') THEN
        CREATE POLICY "Allow public read access for active spots" 
        ON public.spots FOR SELECT USING (is_closed = false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spots' AND policyname = 'Allow full access for service role') THEN
        CREATE POLICY "Allow full access for service role" 
        ON public.spots FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'administrative_divisions' AND policyname = 'Allow public read for admin divisions') THEN
        CREATE POLICY "Allow public read for admin divisions" 
        ON public.administrative_divisions FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'administrative_divisions' AND policyname = 'Allow service role for admin divisions') THEN
        CREATE POLICY "Allow service role for admin divisions" 
        ON public.administrative_divisions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;
