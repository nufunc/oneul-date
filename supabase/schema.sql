-- ==============================================================================
-- 오늘 데이트 (oneul-date) — Supabase PostgreSQL Schema
-- ==============================================================================

-- 1. 데이트 스팟 테이블 생성
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
    source JSONB DEFAULT '{}'::JSONB,
    verified BOOLEAN DEFAULT false,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. 검색 및 필터링 성능 극대화를 위한 B-Tree & GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_spots_region ON public.spots (region);
CREATE INDEX IF NOT EXISTS idx_spots_slot ON public.spots (slot);
CREATE INDEX IF NOT EXISTS idx_spots_is_closed ON public.spots (is_closed);
CREATE INDEX IF NOT EXISTS idx_spots_area ON public.spots (area);
CREATE INDEX IF NOT EXISTS idx_spots_mood ON public.spots USING GIN (mood);

-- 3. Row Level Security (RLS) 보안 정책 설정
ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;

-- 3-1. 일반 사용자/프론트엔드 (Anon Key): 활성 스팟(is_closed = false) 읽기 전용 허용
CREATE POLICY "Allow public read access for active spots" 
ON public.spots 
FOR SELECT 
USING (is_closed = false);

-- 3-2. 백엔드/Cron VM (Service Role Key): 모든 데이터 읽기/쓰기/수정/삭제 전권 허용
CREATE POLICY "Allow full access for service role" 
ON public.spots 
FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

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
