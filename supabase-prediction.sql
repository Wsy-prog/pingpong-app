-- =============================================
-- 有奖竞猜模块 — 完整建表 + RPC 脚本
-- 执行方式: Supabase Dashboard → SQL Editor → 粘贴运行
-- =============================================

-- 0. matches 表新增 prediction_enabled 字段
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS prediction_enabled BOOLEAN NOT NULL DEFAULT false;

-- 1. profiles 新增字段
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS badges JSONB NOT NULL DEFAULT '[]';

-- 2. coin_transactions (金币流水)
CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES public.profiles(id),
  amount        INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN (
                  'daily_checkin', 'tournament_reward', 'admin_grant',
                  'bet_place', 'bet_win', 'bet_refund', 'reward_redeem'
                )),
  reference_id  UUID,
  balance_after INTEGER NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ct_profile ON coin_transactions(profile_id);
CREATE INDEX IF NOT EXISTS idx_ct_type ON coin_transactions(type);
CREATE INDEX IF NOT EXISTS idx_ct_created ON coin_transactions(created_at DESC);

-- 3. daily_checkins (每日签到)
CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id),
  checkin_date  DATE NOT NULL,
  coins_earned  INTEGER NOT NULL DEFAULT 10,
  streak_count  INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, checkin_date)
);
CREATE INDEX IF NOT EXISTS idx_dc_user ON daily_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_dc_date ON daily_checkins(checkin_date DESC);

-- 4. prediction_events (竞猜事件)
CREATE TABLE IF NOT EXISTS public.prediction_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  match_id        UUID REFERENCES public.matches(id),
  event_type      TEXT NOT NULL DEFAULT 'platform_match'
                  CHECK (event_type IN ('platform_match', 'external_custom')),
  options         JSONB NOT NULL DEFAULT '[]',
  pool_total      INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'closed', 'settled', 'cancelled')),
  winning_option  INTEGER,
  house_cut       REAL NOT NULL DEFAULT 0.05 CHECK (house_cut >= 0 AND house_cut <= 1),
  deadline        TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pe_status ON prediction_events(status);
CREATE INDEX IF NOT EXISTS idx_pe_match ON prediction_events(match_id);
CREATE INDEX IF NOT EXISTS idx_pe_deadline ON prediction_events(deadline);

-- 5. prediction_bets (用户投注)
CREATE TABLE IF NOT EXISTS public.prediction_bets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.prediction_events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id),
  option_index  INTEGER NOT NULL,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  settled       BOOLEAN NOT NULL DEFAULT false,
  won_amount    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pb_event ON prediction_bets(event_id);
CREATE INDEX IF NOT EXISTS idx_pb_user ON prediction_bets(user_id);

-- 6. reward_items (可兑换奖励)
CREATE TABLE IF NOT EXISTS public.reward_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  image_url     TEXT,
  cost          INTEGER NOT NULL CHECK (cost > 0),
  stock         INTEGER NOT NULL DEFAULT -1,
  type          TEXT NOT NULL DEFAULT 'physical'
                CHECK (type IN ('physical', 'badge')),
  badge_id      TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. reward_redemptions (兑换记录)
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES public.reward_items(id),
  user_id       UUID NOT NULL REFERENCES public.profiles(id),
  coins_spent   INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rr_user ON reward_redemptions(user_id);

-- =============================================
-- RPC 函数
-- =============================================

-- RPC 1: 每日签到
CREATE OR REPLACE FUNCTION public.daily_checkin(p_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_existing RECORD;
  v_yesterday RECORD;
  v_streak INTEGER := 1;
  v_coins INTEGER := 10;
  v_balance INTEGER;
BEGIN
  -- 检查今日是否已签到
  SELECT * INTO v_existing FROM public.daily_checkins
  WHERE user_id = p_user_id AND checkin_date = v_today;
  IF FOUND THEN
    RETURN json_build_object('error', '今日已签到');
  END IF;

  -- 查昨天签到，计算连续天数
  SELECT * INTO v_yesterday FROM public.daily_checkins
  WHERE user_id = p_user_id AND checkin_date = v_today - 1
  ORDER BY checkin_date DESC LIMIT 1;
  IF FOUND THEN
    v_streak := v_yesterday.streak_count + 1;
  END IF;

  -- 连续7天额外奖励
  IF v_streak > 0 AND v_streak % 7 = 0 THEN
    v_coins := v_coins + 5;
  END IF;

  -- 写入签到记录
  INSERT INTO public.daily_checkins (user_id, checkin_date, coins_earned, streak_count)
  VALUES (p_user_id, v_today, v_coins, v_streak);

  -- 加币 + 写流水
  UPDATE public.profiles SET coins = coins + v_coins WHERE id = p_user_id
  RETURNING coins INTO v_balance;

  INSERT INTO public.coin_transactions (profile_id, amount, type, balance_after, note)
  VALUES (p_user_id, v_coins, 'daily_checkin', v_balance,
          '每日签到 +' || v_coins || '币 (连续' || v_streak || '天)');

  RETURN json_build_object(
    'coins_earned', v_coins,
    'streak_count', v_streak,
    'balance', v_balance
  );
END;
$$;

-- RPC 2: 投注
CREATE OR REPLACE FUNCTION public.place_bet(
  p_user_id UUID, p_event_id UUID, p_option_index INTEGER, p_amount INTEGER
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event RECORD;
  v_balance INTEGER;
  v_existing RECORD;
BEGIN
  -- 检查事件状态
  SELECT * INTO v_event FROM public.prediction_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', '竞猜事件不存在');
  END IF;
  IF v_event.status != 'open' THEN
    RETURN json_build_object('error', '竞猜已关闭');
  END IF;
  IF v_event.deadline IS NOT NULL AND NOW() > v_event.deadline THEN
    RETURN json_build_object('error', '已过投注截止时间');
  END IF;

  -- 检查选项有效性
  IF p_option_index < 0 OR p_option_index >= jsonb_array_length(v_event.options) THEN
    RETURN json_build_object('error', '无效的投注选项');
  END IF;

  IF p_amount < 1 THEN
    RETURN json_build_object('error', '投注金额至少为1币');
  END IF;

  -- 检查是否已投注（先查，避免无意义锁行）
  SELECT * INTO v_existing FROM public.prediction_bets
  WHERE event_id = p_event_id AND user_id = p_user_id;
  IF FOUND THEN
    RETURN json_build_object('error', '已投注过该事件');
  END IF;

  -- 检查余额并加行锁（防并发超扣）
  SELECT coins INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', '用户不存在');
  END IF;
  IF v_balance < p_amount THEN
    RETURN json_build_object('error', '金币不足');
  END IF;

  -- 扣币
  UPDATE public.profiles SET coins = coins - p_amount WHERE id = p_user_id
  RETURNING coins INTO v_balance;

  -- 写投注记录
  INSERT INTO public.prediction_bets (event_id, user_id, option_index, amount)
  VALUES (p_event_id, p_user_id, p_option_index, p_amount);

  -- 更新奖池
  UPDATE public.prediction_events SET pool_total = pool_total + p_amount WHERE id = p_event_id;

  -- 写流水
  INSERT INTO public.coin_transactions (profile_id, amount, type, reference_id, balance_after, note)
  VALUES (p_user_id, -p_amount, 'bet_place', p_event_id, v_balance,
          '投注"' || v_event.title || '" ' || p_amount || '币');

  RETURN json_build_object('success', true, 'balance', v_balance);
END;
$$;

-- RPC 3: 结算竞猜事件（奖池分红）
CREATE OR REPLACE FUNCTION public.settle_prediction_event(
  p_event_id UUID, p_winning_option INTEGER
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event RECORD;
  v_admin RECORD;
  v_total_pool INTEGER;
  v_house_fee INTEGER;
  v_prize_pool INTEGER;
  v_winner_pool INTEGER;
  v_bet RECORD;
  v_won INTEGER;
  v_distributed INTEGER := 0;
  v_balance INTEGER;
  v_winner_count INTEGER := 0;
  v_option_count INTEGER;
BEGIN
  -- 管理员权限校验（调用者必须是 guanliyuan）
  SELECT username INTO v_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_admin.username IS NULL OR v_admin.username != 'guanliyuan' THEN
    RETURN json_build_object('error', '仅管理员可操作');
  END IF;

  -- 获取事件
  SELECT * INTO v_event FROM public.prediction_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', '事件不存在');
  END IF;
  IF v_event.status != 'open' AND v_event.status != 'closed' THEN
    RETURN json_build_object('error', '事件状态不允许结算');
  END IF;

  -- 校验获胜选项合法性
  v_option_count := COALESCE(jsonb_array_length(v_event.options), 0);
  IF p_winning_option IS NULL OR p_winning_option < 0 OR p_winning_option >= v_option_count THEN
    RETURN json_build_object('error', '无效的获胜选项');
  END IF;

  -- 计算奖池
  v_total_pool := v_event.pool_total;
  v_house_fee := FLOOR(v_total_pool * v_event.house_cut);
  v_prize_pool := v_total_pool - v_house_fee;

  -- 计算赢家投注总额
  SELECT COALESCE(SUM(amount), 0) INTO v_winner_pool
  FROM public.prediction_bets
  WHERE event_id = p_event_id AND option_index = p_winning_option;

  -- 分红给赢家（最后一个赢家分剩余，防止 CEIL 累积超发）
  IF v_winner_pool > 0 THEN
    FOR v_bet IN
      SELECT * FROM public.prediction_bets
      WHERE event_id = p_event_id AND option_index = p_winning_option
      ORDER BY id
    LOOP
      v_winner_count := v_winner_count + 1;
      IF v_winner_count = (SELECT COUNT(*) FROM public.prediction_bets WHERE event_id = p_event_id AND option_index = p_winning_option) THEN
        -- 最后一个赢家：分剩余奖池，避免向上取整累积超发
        v_won := GREATEST(0, v_prize_pool - v_distributed);
      ELSE
        v_won := FLOOR((v_bet.amount::REAL / v_winner_pool::REAL) * v_prize_pool);
      END IF;

      IF v_won > 0 THEN
        UPDATE public.profiles SET coins = coins + v_won WHERE id = v_bet.user_id
        RETURNING coins INTO v_balance;

        INSERT INTO public.coin_transactions (profile_id, amount, type, reference_id, balance_after, note)
        VALUES (v_bet.user_id, v_won, 'bet_win', p_event_id, v_balance,
                '竞猜获胜 +' || v_won || '币 (投' || v_bet.amount || '得' || v_won || ')');
      END IF;

      UPDATE public.prediction_bets
      SET settled = true, won_amount = v_won
      WHERE id = v_bet.id;

      v_distributed := v_distributed + v_won;
    END LOOP;
  END IF;

  -- 标记输家（没猜中的）
  UPDATE public.prediction_bets
  SET settled = true, won_amount = 0
  WHERE event_id = p_event_id AND option_index != p_winning_option;

  -- 更新事件
  UPDATE public.prediction_events
  SET status = 'settled', winning_option = p_winning_option, settled_at = NOW()
  WHERE id = p_event_id;

  RETURN json_build_object(
    'total_pool', v_total_pool,
    'house_fee', v_house_fee,
    'prize_pool', v_prize_pool,
    'winner_pool', v_winner_pool,
    'winner_count', v_winner_count,
    'distributed', v_distributed
  );
END;
$$;

-- RPC 4: 兑换奖励
CREATE OR REPLACE FUNCTION public.redeem_reward(p_user_id UUID, p_item_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item RECORD;
  v_balance INTEGER;
  v_badge JSONB;
BEGIN
  SELECT * INTO v_item FROM public.reward_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', '奖励不存在');
  END IF;
  IF NOT v_item.is_active THEN
    RETURN json_build_object('error', '奖励已下架');
  END IF;
  IF v_item.stock = 0 THEN
    RETURN json_build_object('error', '库存不足');
  END IF;

  -- 检查余额
  SELECT coins INTO v_balance FROM public.profiles WHERE id = p_user_id;
  IF v_balance < v_item.cost THEN
    RETURN json_build_object('error', '金币不足');
  END IF;

  -- 扣币
  UPDATE public.profiles SET coins = coins - v_item.cost WHERE id = p_user_id
  RETURNING coins INTO v_balance;

  -- 减库存
  IF v_item.stock > 0 THEN
    UPDATE public.reward_items SET stock = stock - 1 WHERE id = p_item_id;
  END IF;

  -- 写兑换记录
  INSERT INTO public.reward_redemptions (item_id, user_id, coins_spent)
  VALUES (p_item_id, p_user_id, v_item.cost);

  -- 如果是徽章，加到 profiles.badges
  IF v_item.type = 'badge' AND v_item.badge_id IS NOT NULL THEN
    SELECT badges INTO v_badge FROM public.profiles WHERE id = p_user_id;
    IF v_badge IS NULL THEN v_badge := '[]'::JSONB; END IF;
    IF NOT v_badge @> to_jsonb(v_item.badge_id) THEN
      UPDATE public.profiles
      SET badges = badges || to_jsonb(v_item.badge_id)
      WHERE id = p_user_id;
    END IF;
  END IF;

  -- 写流水
  INSERT INTO public.coin_transactions (profile_id, amount, type, reference_id, balance_after, note)
  VALUES (p_user_id, -v_item.cost, 'reward_redeem', p_item_id, v_balance,
          '兑换"' || v_item.name || '" -' || v_item.cost || '币');

  RETURN json_build_object('success', true, 'balance', v_balance, 'item_name', v_item.name);
END;
$$;

-- RPC 5: 管理员发币
CREATE OR REPLACE FUNCTION public.admin_grant_coins(
  p_admin_id UUID, p_target_id UUID, p_amount INTEGER, p_note TEXT DEFAULT '管理员发放'
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin RECORD;
  v_balance INTEGER;
BEGIN
  -- 验证管理员身份
  SELECT username INTO v_admin FROM public.profiles WHERE id = p_admin_id;
  IF NOT FOUND OR v_admin.username IS NULL OR v_admin.username != 'guanliyuan' THEN
    RETURN json_build_object('error', '仅管理员可操作');
  END IF;

  IF p_amount <= 0 THEN
    RETURN json_build_object('error', '发放金额必须大于0');
  END IF;

  -- 发币
  UPDATE public.profiles SET coins = coins + p_amount WHERE id = p_target_id
  RETURNING coins INTO v_balance;

  -- 写流水
  INSERT INTO public.coin_transactions (profile_id, amount, type, reference_id, balance_after, note)
  VALUES (p_target_id, p_amount, 'admin_grant', p_admin_id, v_balance, p_note);

  RETURN json_build_object('success', true, 'target_balance', v_balance);
END;
$$;

-- RPC 6: 取消竞猜事件（退还所有投注）
CREATE OR REPLACE FUNCTION public.cancel_prediction_event(p_event_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event RECORD;
  v_admin RECORD;
  v_bet RECORD;
  v_balance INTEGER;
  v_count INTEGER := 0;
BEGIN
  -- 管理员权限校验
  SELECT username INTO v_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_admin.username IS NULL OR v_admin.username != 'guanliyuan' THEN
    RETURN json_build_object('error', '仅管理员可操作');
  END IF;

  SELECT * INTO v_event FROM public.prediction_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', '事件不存在');
  END IF;
  IF v_event.status != 'open' THEN
    RETURN json_build_object('error', '只能取消进行中的事件');
  END IF;

  -- 退还所有投注
  FOR v_bet IN SELECT * FROM public.prediction_bets WHERE event_id = p_event_id
  LOOP
    UPDATE public.profiles SET coins = coins + v_bet.amount WHERE id = v_bet.user_id
    RETURNING coins INTO v_balance;

    UPDATE public.prediction_bets
    SET settled = true, won_amount = 0
    WHERE id = v_bet.id;

    INSERT INTO public.coin_transactions (profile_id, amount, type, reference_id, balance_after, note)
    VALUES (v_bet.user_id, v_bet.amount, 'bet_refund', p_event_id, v_balance,
            '竞猜取消退款 +' || v_bet.amount || '币');

    v_count := v_count + 1;
  END LOOP;

  -- 更新事件
  UPDATE public.prediction_events SET status = 'cancelled' WHERE id = p_event_id;

  RETURN json_build_object('success', true, 'refunded_count', v_count);
END;
$$;

-- =============================================
-- RLS 关闭（所有新表，与现有表保持一致）
-- =============================================
ALTER TABLE public.coin_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checkins DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_bets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions DISABLE ROW LEVEL SECURITY;
