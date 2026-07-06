export interface Profile {
  id: string
  nickname: string
  avatar_url: string | null
  bio: string | null
  elo_score: number
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
  format: 'single_match' | 'round_robin' | 'knockout' | 'group_knockout' | 'custom_score'
  config: Record<string, unknown>
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled'
  description: string | null
  max_players: number | null
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
