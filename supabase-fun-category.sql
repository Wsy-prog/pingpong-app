-- 更新 category CHECK 约束以支持 doubles 和 fun
-- 在 Supabase SQL Editor 中执行以下语句：
-- https://supabase.com/dashboard → 项目 pingpong-app → SQL Editor

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_category_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_category_check
  CHECK (category IN ('singles', 'doubles', 'team', 'fun'));
