-- 给 tournaments 表增加开始时间字段（用于取消报名的时间检查）
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
