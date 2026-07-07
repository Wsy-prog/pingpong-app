-- =============================================
-- 健康打卡系统 — 表 + RPC
-- 执行方式: Supabase Dashboard → SQL Editor → 粘贴运行
-- =============================================

-- 1. health_checkins (每日打卡记录)
CREATE TABLE IF NOT EXISTS public.health_checkins (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES public.profiles(id),
  checkin_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  sport_type        TEXT NOT NULL DEFAULT '乒乓球',
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 600),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, checkin_date)
);

-- 2. health_weekly_scores (每周评估结果快照)
CREATE TABLE IF NOT EXISTS public.health_weekly_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES public.profiles(id),
  week_start        DATE NOT NULL,
  week_end          DATE NOT NULL,
  score             INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  days_count        INTEGER NOT NULL DEFAULT 0,
  total_minutes     INTEGER NOT NULL DEFAULT 0,
  max_streak        INTEGER NOT NULL DEFAULT 0,
  detail            JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_health_checkins_profile_date ON health_checkins(profile_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_health_weekly_profile ON health_weekly_scores(profile_id, week_start);

ALTER TABLE public.health_checkins DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_weekly_scores DISABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. RPC: 计算某用户指定周的评估结果
-- =============================================
CREATE OR REPLACE FUNCTION calculate_weekly_health(
  p_profile_id UUID,
  p_week_start DATE
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_week_end DATE := p_week_start + INTERVAL '6 days';
  v_days_count INTEGER;
  v_total_minutes INTEGER;
  v_max_streak INTEGER := 0;
  v_current_streak INTEGER := 0;
  v_prev_date DATE;
  v_rec RECORD;
  v_score INTEGER;
  v_freq_score NUMERIC;
  v_dur_score NUMERIC := 0;
  v_streak_score NUMERIC := 0;
  v_detail JSONB;
BEGIN
  -- 获取该周所有打卡记录（按日期排序）
  SELECT COUNT(*), COALESCE(SUM(duration_minutes), 0)
  INTO v_days_count, v_total_minutes
  FROM public.health_checkins
  WHERE profile_id = p_profile_id
    AND checkin_date >= p_week_start
    AND checkin_date <= v_week_end;

  -- 计算连续天数
  v_prev_date := (p_week_start - 1);
  FOR v_rec IN
    SELECT checkin_date FROM public.health_checkins
    WHERE profile_id = p_profile_id
      AND checkin_date >= p_week_start
      AND checkin_date <= v_week_end
    ORDER BY checkin_date
  LOOP
    IF v_rec.checkin_date = v_prev_date + 1 THEN
      v_current_streak := v_current_streak + 1;
    ELSE
      v_current_streak := 1;
    END IF;
    IF v_current_streak > v_max_streak THEN
      v_max_streak := v_current_streak;
    END IF;
    v_prev_date := v_rec.checkin_date;
  END LOOP;

  -- ① 运动天数分 (0~40)
  v_freq_score := LEAST((v_days_count::NUMERIC / 7.0) * 40, 40);

  -- ② 运动时长分 (0~45)
  IF v_days_count > 0 THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN duration_minutes BETWEEN 30 AND 90 THEN 5.0
        WHEN duration_minutes < 30 THEN (duration_minutes::NUMERIC / 30.0) * 5.0
        ELSE -- > 90 分钟，超出部分递减
          5.0 + GREATEST(0, 5.0 * (1.0 - (duration_minutes - 90)::NUMERIC / 90.0))
      END
    ), 0) INTO v_dur_score
    FROM public.health_checkins
    WHERE profile_id = p_profile_id
      AND checkin_date >= p_week_start
      AND checkin_date <= v_week_end;
  END IF;
  v_dur_score := LEAST(v_dur_score, 45);

  -- ③ 连续运动加分 (0~15)
  IF v_max_streak >= 2 THEN
    v_streak_score := LEAST(
      CASE v_max_streak
        WHEN 2 THEN 2 WHEN 3 THEN 5 WHEN 4 THEN 8
        WHEN 5 THEN 10 WHEN 6 THEN 12 ELSE 15
      END, 15
    );
  END IF;

  -- 总分封顶100
  v_score := LEAST(ROUND(v_freq_score + v_dur_score + v_streak_score)::INTEGER, 100);

  v_detail := jsonb_build_object(
    'freq_score', ROUND(v_freq_score::NUMERIC, 1),
    'dur_score', ROUND(v_dur_score::NUMERIC, 1),
    'streak_score', ROUND(v_streak_score::NUMERIC, 1),
    'days_count', v_days_count,
    'total_minutes', v_total_minutes,
    'max_streak', v_max_streak
  );

  -- 写入/更新 weekly_scores
  INSERT INTO public.health_weekly_scores
    (profile_id, week_start, week_end, score, days_count, total_minutes, max_streak, detail)
  VALUES
    (p_profile_id, p_week_start, v_week_end, v_score, v_days_count, v_total_minutes, v_max_streak, v_detail)
  ON CONFLICT (profile_id, week_start)
  DO UPDATE SET
    score = EXCLUDED.score,
    days_count = EXCLUDED.days_count,
    total_minutes = EXCLUDED.total_minutes,
    max_streak = EXCLUDED.max_streak,
    detail = EXCLUDED.detail,
    created_at = NOW();

  RETURN jsonb_build_object(
    'week_start', p_week_start,
    'week_end', v_week_end,
    'score', v_score,
    'days_count', v_days_count,
    'total_minutes', v_total_minutes,
    'max_streak', v_max_streak,
    'detail', v_detail
  );
END;
$$;
