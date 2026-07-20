export interface Profile {
  id: string
  username: string
  nickname: string
  bio?: string | null
  blade?: string | null
  forehand_rubber?: string | null
  backhand_rubber?: string | null
  elo_score: number
  coins: number
  badges: string[]
  created_at: string
}

export interface Match {
  id: string
  tournament_id: string | null
  title: string
  player1_id: string | null
  player2_id: string | null
  player1_name: string
  player2_name: string
  match_date: string | null
  location: string | null
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  winner_name: string | null
  player1_sets: number
  player2_sets: number
  rated: boolean
  prediction_enabled: boolean
  round: number | null
  bracket_pos: number | null
  group_name: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Set {
  id: string
  match_id: string
  set_number: number
  player1_score: number
  player2_score: number
  created_at: string
}

export interface Tournament {
  id: string
  name: string
  format: 'single_match' | 'round_robin' | 'knockout' | 'group_knockout' | 'custom_score' | 'fun_100_individual' | 'fun_100_team' | 'fun_elo_handicap' | 'fun_blind_doubles' | 'fun_arena'
  category: 'singles' | 'doubles' | 'team' | 'fun'
  config: Record<string, unknown>
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled'
  description: string | null
  max_players: number | null
  start_time: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface MatchmakingPost {
  id: string
  author_id: string
  title: string
  location: string
  match_time: string
  note: string | null
  skill_level: string | null
  status: 'open' | 'matched' | 'closed' | 'cancelled'
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  sender_id: string
  receiver_id: string | null
  content: string
  created_at: string
}

export interface EloHistory {
  id: string
  profile_id: string
  match_id: string
  old_score: number
  new_score: number
  delta: number
  opponent_id: string | null
  opponent_score: number | null
  created_at: string
}

export interface FortuneItem {
  id: string
  content: string
  category: string
  is_unique: boolean
  unique_claimed_by: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface HealthCheckin {
  id: string
  profile_id: string
  checkin_date: string
  sport_type: string
  duration_minutes: number
  created_at: string
}

export interface HealthWeeklyScore {
  id: string
  profile_id: string
  week_start: string
  week_end: string
  score: number
  days_count: number
  total_minutes: number
  max_streak: number
  detail: {
    freq_score: number
    dur_score: number
    streak_score: number
    days_count: number
    total_minutes: number
    max_streak: number
  }
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  content: string
  created_by: string
  created_by_name: string
  priority: string
  expires_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// === 有奖竞猜系统 ===

export interface CoinTransaction {
  id: string
  profile_id: string
  amount: number
  type: 'daily_checkin' | 'tournament_reward' | 'admin_grant' | 'bet_place' | 'bet_win' | 'bet_refund' | 'reward_redeem'
  reference_id: string | null
  balance_after: number
  note: string | null
  created_at: string
}

export interface PredictionOption {
  label: string
  value: string
}

export interface PredictionEvent {
  id: string
  title: string
  description: string | null
  match_id: string | null
  tournament_id: string | null
  event_type: 'platform_match' | 'external_custom'
  options: PredictionOption[]
  pool_total: number
  status: 'open' | 'closed' | 'settled' | 'cancelled'
  winning_option: number | null
  house_cut: number
  deadline: string
  created_by: string
  created_at: string
  settled_at: string | null
}

export interface PredictionBet {
  id: string
  event_id: string
  user_id: string
  option_index: number
  amount: number
  settled: boolean
  won_amount: number | null
  created_at: string
}

export interface RewardItem {
  id: string
  name: string
  description: string | null
  image_url: string | null
  cost: number
  stock: number
  type: 'physical' | 'badge'
  badge_id: string | null
  is_active: boolean
  created_at: string
}

export interface RewardRedemption {
  id: string
  item_id: string
  user_id: string
  coins_spent: number
  status: 'pending' | 'fulfilled' | 'cancelled'
  created_at: string
}

export interface DailyCheckin {
  id: string
  user_id: string
  checkin_date: string
  coins_earned: number
  streak_count: number
  created_at: string
}
