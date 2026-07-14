-- 新增3个趣味赛制到 tournaments.format CHECK 约束
-- 在 Supabase SQL Editor 中执行：
-- https://supabase.com/dashboard → 项目 pingpong-app → SQL Editor

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_format_check
  CHECK (format IN (
    'single_match', 'round_robin', 'knockout', 'group_knockout', 'custom_score',
    'fun_100_individual', 'fun_100_team',
    'fun_elo_handicap', 'fun_blind_doubles', 'fun_arena'
  ));
