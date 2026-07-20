-- 队伍管理系统
-- 在 Supabase SQL Editor 中执行

-- 1) 创建 teams 表
CREATE TABLE IF NOT EXISTS public.teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  captain_player_id UUID NOT NULL,
  require_review BOOLEAN DEFAULT true,
  max_members INTEGER DEFAULT 5,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2) tournament_players 增加 team_id 字段
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS team_id UUID;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- 3) 关闭 RLS（保持和项目其它表一致）
ALTER TABLE public.teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_players DISABLE ROW LEVEL SECURITY;