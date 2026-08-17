-- ==============================================================================
-- 오늘 데이트 (oneul-date) — Supabase PostgreSQL Schema (고급화 확장)
-- ==============================================================================

-- 1. 데이트 스팟 테이블 생성 (최신 스키마)
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
    quality_score INTEGER DEFAULT 50,
    fail_count INTEGER DEFAULT 0,
    source JSONB DEFAULT '{}'::JSONB,
    verified BOOLEAN DEFAULT false,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 1-1. 기존 테이블 호환을 위한 신규 컬럼 안전 추가 (ALTER TABLE IF NOT EXISTS)
DO $$ 
BEGIN
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
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='quality_score') THEN
        ALTER TABLE public.spots ADD COLUMN quality_score INTEGER DEFAULT 50;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spots' AND column_name='fail_count') THEN
        ALTER TABLE public.spots ADD COLUMN fail_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. 검색 및 필터링 성능 극대화 인덱스
CREATE INDEX IF NOT EXISTS idx_spots_region ON public.spots (region);
CREATE INDEX IF NOT EXISTS idx_spots_slot ON public.spots (slot);
CREATE INDEX IF NOT EXISTS idx_spots_is_closed ON public.spots (is_closed);
CREATE INDEX IF NOT EXISTS idx_spots_area ON public.spots (area);
CREATE INDEX IF NOT EXISTS idx_spots_quality ON public.spots (quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_spots_mood ON public.spots USING GIN (mood);

-- 3. Row Level Security (RLS) 보안 정책 설정
ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;

-- 3-1. 일반 사용자/프론트엔드 (Anon Key): 활성 스팟(is_closed = false) 읽기 전용 허용
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
END $$;

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS on_spots_updated ON public.spots;
CREATE TRIGGER on_spots_updated
    BEFORE UPDATE ON public.spots
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();
