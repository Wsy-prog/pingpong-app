-- 点赞表（不依赖 news_flashes 的 likes_count 字段）
CREATE TABLE IF NOT EXISTS public.flash_likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flash_id    UUID NOT NULL REFERENCES public.news_flashes(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(flash_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_flash_likes_flash ON flash_likes(flash_id);
CREATE INDEX IF NOT EXISTS idx_flash_likes_profile ON flash_likes(profile_id);

ALTER TABLE public.flash_likes DISABLE ROW LEVEL SECURITY;

-- 不再使用 news_flashes.likes_count 字段，用 COUNT 替代
-- 可选：删除旧的 likes_count 列（不影响功能）
ALTER TABLE public.news_flashes DROP COLUMN IF EXISTS likes_count;
