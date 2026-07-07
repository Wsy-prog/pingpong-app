-- =============================================
-- 今日运势系统 — 表 + RPC
-- 执行方式: Supabase Dashboard → SQL Editor → 粘贴运行
-- =============================================

-- 1. fortune_items (运势内容库)
CREATE TABLE IF NOT EXISTS public.fortune_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content           TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'general',
  is_unique         BOOLEAN NOT NULL DEFAULT false,
  unique_claimed_by UUID REFERENCES public.profiles(id),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. user_fortunes (用户每日抽取记录)
CREATE TABLE IF NOT EXISTS public.user_fortunes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id),
  fortune_id  UUID NOT NULL REFERENCES public.fortune_items(id),
  drawn_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, drawn_date)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_fortune_items_active ON fortune_items(is_active);
CREATE INDEX IF NOT EXISTS idx_fortune_items_unique ON fortune_items(is_unique) WHERE is_unique = true;
CREATE INDEX IF NOT EXISTS idx_user_fortunes_profile_date ON user_fortunes(profile_id, drawn_date);

-- =============================================
-- 3. RPC: 每日抽签
-- 每人每天只能抽一次；设置了唯一性的运势有且仅有一人能抽到
-- =============================================
CREATE OR REPLACE FUNCTION draw_daily_fortune(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_existing RECORD;
  v_fortune RECORD;
BEGIN
  -- ① 检查今天是否已经抽过
  SELECT uf.fortune_id, f.id AS fid, f.content, f.category, f.is_unique,
         f.unique_claimed_by IS NOT NULL AS unique_claimed
  INTO v_existing
  FROM public.user_fortunes uf
  JOIN public.fortune_items f ON f.id = uf.fortune_id
  WHERE uf.profile_id = p_user_id AND uf.drawn_date = v_today;

  IF v_existing.fortune_id IS NOT NULL THEN
    RETURN json_build_object(
      'id', v_existing.fid,
      'content', v_existing.content,
      'category', v_existing.category,
      'is_unique', v_existing.is_unique,
      'unique_claimed', v_existing.unique_claimed,
      'already_drawn', true
    );
  END IF;

  -- ② 检查是否有可用的运势内容
  IF NOT EXISTS (SELECT 1 FROM public.fortune_items WHERE is_active = true) THEN
    RETURN json_build_object('error', '运势池为空，请联系管理员补充运势内容');
  END IF;

  -- ③ 随机抽取一条未被领取的唯一性运势，或任意非唯一运势
  SELECT f.id, f.content, f.category, f.is_unique
  INTO v_fortune
  FROM public.fortune_items f
  WHERE f.is_active = true
    AND (f.is_unique = false OR f.unique_claimed_by IS NULL)
  ORDER BY RANDOM()
  LIMIT 1;

  IF v_fortune.id IS NULL THEN
    RETURN json_build_object('error', '所有唯一运势已被领取完，请联系管理员补充新内容');
  END IF;

  -- ④ 如果是唯一性运势，标记为已领取
  IF v_fortune.is_unique THEN
    UPDATE public.fortune_items
    SET unique_claimed_by = p_user_id, updated_at = NOW()
    WHERE id = v_fortune.id;
  END IF;

  -- ⑤ 记录抽取
  INSERT INTO public.user_fortunes (profile_id, fortune_id, drawn_date)
  VALUES (p_user_id, v_fortune.id, v_today);

  RETURN json_build_object(
    'id', v_fortune.id,
    'content', v_fortune.content,
    'category', v_fortune.category,
    'is_unique', v_fortune.is_unique,
    'unique_claimed', v_fortune.is_unique,
    'already_drawn', false
  );
END;
$$;
