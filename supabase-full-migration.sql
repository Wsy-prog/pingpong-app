-- ============================================================
-- 乒乓球约球比赛平台 — 完整数据库迁移
-- 在 Supabase SQL Editor 一次性执行
-- https://supabase.com/dashboard → 项目 pingpong-app → SQL Editor
-- ============================================================

-- 1) tournaments: 添加 category 列（单人/双打/团体/趣味）
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'singles';
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_category_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_category_check
  CHECK (category IN ('singles', 'doubles', 'team', 'fun'));

-- 2) tournaments: 添加开始时间列
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;

-- 3) tournaments: 扩展 format CHECK 约束（支持全部 10 种赛制）
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_format_check
  CHECK (format IN (
    'single_match', 'round_robin', 'knockout', 'group_knockout', 'custom_score',
    'fun_100_individual', 'fun_100_team',
    'fun_elo_handicap', 'fun_blind_doubles', 'fun_arena'
  ));

-- 4) tournament_players: 添加 team_name（团体赛队伍名称）
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS team_name TEXT;

-- 5) tournament_players: 添加 team_id 和 role（队伍管理系统）
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS team_id UUID;
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- 6) 创建 teams 表
CREATE TABLE IF NOT EXISTS public.teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  captain_player_id UUID NOT NULL,
  require_review BOOLEAN DEFAULT true,
  max_members INTEGER DEFAULT 5,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 7) 关闭 RLS（保持和项目其他表一致）
ALTER TABLE public.teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_players DISABLE ROW LEVEL SECURITY;