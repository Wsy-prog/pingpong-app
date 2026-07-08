-- 给 profiles 表增加球拍配置字段
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blade TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS forehand_rubber TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS backhand_rubber TEXT;
