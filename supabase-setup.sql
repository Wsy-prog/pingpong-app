-- =============================================
-- 乒乓球约球比赛平台 — 完整建表脚本
-- 执行方式: Supabase Dashboard → SQL Editor → 粘贴运行
-- =============================================

-- 1. profiles (用户资料)
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname    TEXT NOT NULL,
  avatar_url  TEXT,
  bio         TEXT,
  elo_score   INTEGER NOT NULL DEFAULT 1500,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_profiles_elo ON profiles(elo_score DESC);

-- 2. tournaments (赛事)
CREATE TABLE public.tournaments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  format          TEXT NOT NULL
                  CHECK (format IN ('single_match','round_robin','knockout','group_knockout','custom_score')),
  config          JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','in_progress','completed','cancelled')),
  description     TEXT,
  max_players     INTEGER,
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tournaments_format ON tournaments(format);
CREATE INDEX idx_tournaments_status ON tournaments(status);

-- 3. tournament_players (赛事选手)
CREATE TABLE public.tournament_players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  profile_id      UUID REFERENCES public.profiles(id),
  player_name     TEXT NOT NULL,
  seed            INTEGER DEFAULT 0,
  group_name      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tournament_id, player_name)
);
CREATE INDEX idx_tp_tournament ON tournament_players(tournament_id);

-- 4. matches (比赛)
CREATE TABLE public.matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  player1_id      UUID REFERENCES public.profiles(id),
  player2_id      UUID REFERENCES public.profiles(id),
  player1_name    TEXT NOT NULL,
  player2_name    TEXT NOT NULL,
  match_date      TIMESTAMPTZ,
  location        TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  winner_name     TEXT,
  player1_sets    INTEGER DEFAULT 0,
  player2_sets    INTEGER DEFAULT 0,
  rated           BOOLEAN NOT NULL DEFAULT FALSE,
  round           INTEGER,
  bracket_pos     INTEGER,
  group_name      TEXT,
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_matches_player1 ON matches(player1_id);
CREATE INDEX idx_matches_player2 ON matches(player2_id);
CREATE INDEX idx_matches_status ON matches(status);

-- 5. sets (局分)
CREATE TABLE public.sets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  set_number      INTEGER NOT NULL,
  player1_score   INTEGER DEFAULT 0,
  player2_score   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, set_number)
);
CREATE INDEX idx_sets_match ON sets(match_id);

-- 6. matchmaking_posts (约球帖子)
CREATE TABLE public.matchmaking_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID NOT NULL REFERENCES public.profiles(id),
  title           TEXT NOT NULL,
  location        TEXT NOT NULL,
  match_time      TIMESTAMPTZ NOT NULL,
  note            TEXT,
  skill_level     TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','matched','closed','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mp_author ON matchmaking_posts(author_id);
CREATE INDEX idx_mp_status ON matchmaking_posts(status);
CREATE INDEX idx_mp_time ON matchmaking_posts(match_time);

-- 7. matchmaking_responses (约球响应)
CREATE TABLE public.matchmaking_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES public.matchmaking_posts(id) ON DELETE CASCADE,
  responder_id    UUID NOT NULL REFERENCES public.profiles(id),
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, responder_id)
);
CREATE INDEX idx_mr_post ON matchmaking_responses(post_id);
CREATE INDEX idx_mr_responder ON matchmaking_responses(responder_id);

-- 8. messages (聊天消息)
CREATE TABLE public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       UUID NOT NULL REFERENCES public.profiles(id),
  receiver_id     UUID,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_global ON messages(receiver_id) WHERE receiver_id IS NULL;
CREATE INDEX idx_messages_private ON messages(sender_id, receiver_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- 9. elo_history (ELO积分变动记录)
CREATE TABLE public.elo_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES public.profiles(id),
  match_id        UUID NOT NULL REFERENCES public.matches(id),
  old_score       INTEGER NOT NULL,
  new_score       INTEGER NOT NULL,
  delta           INTEGER NOT NULL,
  opponent_id     UUID REFERENCES public.profiles(id),
  opponent_score  INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_eh_profile ON elo_history(profile_id);
CREATE INDEX idx_eh_match ON elo_history(match_id);

-- =============================================
-- RLS (Row Level Security)
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE elo_history ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- matches
CREATE POLICY "matches_select" ON matches FOR SELECT USING (true);
CREATE POLICY "matches_insert" ON matches FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "matches_update" ON matches FOR UPDATE USING (auth.role() = 'authenticated');

-- sets
CREATE POLICY "sets_select" ON sets FOR SELECT USING (true);
CREATE POLICY "sets_insert" ON sets FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "sets_update" ON sets FOR UPDATE USING (auth.role() = 'authenticated');

-- tournaments
CREATE POLICY "tournaments_select" ON tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments_insert" ON tournaments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "tournaments_update" ON tournaments FOR UPDATE USING (auth.role() = 'authenticated');

-- tournament_players
CREATE POLICY "tp_select" ON tournament_players FOR SELECT USING (true);
CREATE POLICY "tp_insert" ON tournament_players FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "tp_update" ON tournament_players FOR UPDATE USING (auth.role() = 'authenticated');

-- matchmaking_posts
CREATE POLICY "mp_select" ON matchmaking_posts FOR SELECT USING (true);
CREATE POLICY "mp_insert" ON matchmaking_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "mp_update" ON matchmaking_posts FOR UPDATE USING (auth.uid() = author_id);

-- matchmaking_responses
CREATE POLICY "mr_select" ON matchmaking_responses FOR SELECT USING (true);
CREATE POLICY "mr_insert" ON matchmaking_responses FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "mr_update" ON matchmaking_responses FOR UPDATE USING (auth.uid() = responder_id);

-- messages
CREATE POLICY "msg_select" ON messages FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    receiver_id IS NULL OR sender_id = auth.uid() OR receiver_id = auth.uid()
  )
);
CREATE POLICY "msg_insert" ON messages FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND sender_id = auth.uid()
);

-- elo_history
CREATE POLICY "eh_select" ON elo_history FOR SELECT USING (true);

-- =============================================
-- 启用 Realtime (聊天推送)
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- =============================================
-- 用户注册时自动创建 profile
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nickname', '球友' || substr(NEW.id::text, 1, 6))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
