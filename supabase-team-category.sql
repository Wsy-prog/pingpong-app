-- 赛事分类：单人赛 / 团体赛
-- 在 Supabase SQL Editor 中执行以下语句：
-- https://supabase.com/dashboard → 项目 pingpong-app → SQL Editor

ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'singles'
  CHECK (category IN ('singles', 'team'));

-- 团体赛需要 team_name 记录选手所属队伍
ALTER TABLE public.tournament_players ADD COLUMN IF NOT EXISTS team_name TEXT;
