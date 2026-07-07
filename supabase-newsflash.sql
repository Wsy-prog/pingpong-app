-- =============================================
-- 新闻快报系统 — 表
-- =============================================
CREATE TABLE IF NOT EXISTS public.news_flashes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES public.profiles(id),
  nickname          TEXT NOT NULL,
  content           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_flashes_created ON news_flashes(created_at DESC);

ALTER TABLE public.news_flashes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.flash_config (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  max_count         INTEGER NOT NULL DEFAULT 5
);

INSERT INTO public.flash_config (id, max_count) VALUES (1, 5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.flash_config DISABLE ROW LEVEL SECURITY;
