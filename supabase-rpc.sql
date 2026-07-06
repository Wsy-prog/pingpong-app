-- ELO 积分结算存储过程（事务安全）
CREATE OR REPLACE FUNCTION public.settle_match_elo(
  p_match_id UUID,
  p1_id UUID,
  p1_new_score INTEGER,
  p2_id UUID,
  p2_new_score INTEGER,
  p1_delta INTEGER,
  p2_delta INTEGER,
  p_winner_id UUID,
  p_loser_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- 更新双方积分
  UPDATE public.profiles SET elo_score = p1_new_score WHERE id = p1_id;
  UPDATE public.profiles SET elo_score = p2_new_score WHERE id = p2_id;

  -- 写入积分变动历史
  INSERT INTO public.elo_history (profile_id, match_id, old_score, new_score, delta, opponent_id, opponent_score)
  VALUES
    (p1_id, p_match_id, p1_new_score - p1_delta, p1_new_score, p1_delta, p2_id, p2_new_score - p2_delta),
    (p2_id, p_match_id, p2_new_score - p2_delta, p2_new_score, p2_delta, p1_id, p1_new_score - p1_delta);

  -- 标记比赛已结算
  UPDATE public.matches SET rated = TRUE WHERE id = p_match_id;
END;
$$;
