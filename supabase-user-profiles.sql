-- 删除旧的 profiles 表（依赖 auth.users）
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 把 users 表改名成 profiles，和前端代码兼容
ALTER TABLE public.users RENAME TO profiles;

-- 新 profiles 表的结构:
-- id, username, password_hash (仅后端用), nickname, elo_score, created_at
  
-- 更新积分结算 RPC 引用新表名
CREATE OR REPLACE FUNCTION public.settle_match_elo(
  p_match_id UUID, p1_id UUID, p1_new_score INTEGER,
  p2_id UUID, p2_new_score INTEGER, p1_delta INTEGER, p2_delta INTEGER,
  p_winner_id UUID, p_loser_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET elo_score = p1_new_score WHERE id = p1_id;
  UPDATE public.profiles SET elo_score = p2_new_score WHERE id = p2_id;
  INSERT INTO public.elo_history (profile_id, match_id, old_score, new_score, delta, opponent_id, opponent_score)
  VALUES (p1_id, p_match_id, p1_new_score - p1_delta, p1_new_score, p1_delta, p2_id, p2_new_score - p2_delta),
         (p2_id, p_match_id, p2_new_score - p2_delta, p2_new_score, p2_delta, p1_id, p1_new_score - p1_delta);
  UPDATE public.matches SET rated = TRUE WHERE id = p_match_id;
END;
$$;

-- 注册 RPC
CREATE OR REPLACE FUNCTION register_user(p_username TEXT, p_password TEXT, p_nickname TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user public.profiles;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = p_username) THEN
    RETURN json_build_object('error', '用户名已存在');
  END IF;
  INSERT INTO public.profiles (username, password_hash, nickname)
  VALUES (p_username, crypt(p_password, gen_salt('bf')), p_nickname)
  RETURNING * INTO v_user;
  RETURN json_build_object('id', v_user.id, 'username', v_user.username, 'nickname', v_user.nickname, 'elo_score', v_user.elo_score);
END;
$$;

-- 登录 RPC
CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.profiles WHERE username = p_username;
  IF v_user.id IS NULL THEN RETURN json_build_object('error', '用户不存在'); END IF;
  IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN json_build_object('error', '密码错误');
  END IF;
  RETURN json_build_object('id', v_user.id, 'username', v_user.username, 'nickname', v_user.nickname, 'elo_score', v_user.elo_score);
END;
$$;
