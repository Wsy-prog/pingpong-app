-- 给 profiles 表增加个人宣言字段
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
