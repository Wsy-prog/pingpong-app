export type TournamentFormat =
  | 'single_match'
  | 'round_robin'
  | 'knockout'
  | 'group_knockout'
  | 'custom_score'
  | 'fun_100_individual'
  | 'fun_100_team'
  | 'fun_elo_handicap'
  | 'fun_blind_doubles'
  | 'fun_arena';

export interface TournamentConfig {
  sets_to_win: number;         // 每场比赛赢几局获胜（如 3局2胜）
  points_per_win?: number;      // 循环赛胜场积分（默认1）
  points_per_draw?: number;     // 循环赛平局积分（默认0）
  third_place_match?: boolean;  // 淘汰赛是否进行三四名决赛
  groups?: number;              // 混合赛小组数
  advance_per_group?: number;   // 混合赛每组晋级人数
  // 趣味赛事配置
  target_score?: number;              // 百分制目标分
  handicap_score?: number;            // ELO让分赛：低分者领先分数
  handicap_player_id?: string;        // ELO让分赛：获得让分的选手ID
  teams?: { name: string; player_ids: string[] }[];  // 盲盒双打赛：随机配对结果
  challenge_order?: { challenger_name: string; order: number }[];  // 擂台赛：挑战顺序
  arena_champion_name?: string;       // 擂台赛：当前擂主
  arena_streak?: number;              // 擂台赛：连胜数
  mode?: string;                      // 模式标记（如 'team_relay'）
  team1?: any;                        // 百分团体赛队伍1
  team2?: any;                        // 百分团体赛队伍2
  stages?: any[];                     // 团体赛阶段
  current_stage?: number;             // 团体赛当前阶段
}

export interface Player {
  id: string;
  name: string;
  seed: number;
  group_name?: string;
  team_name?: string;
}

export interface GeneratedMatch {
  player1_name: string;
  player2_name: string;
  round?: number;
  bracket_pos?: number;
  group_name?: string;
}

export interface Standing {
  player_name: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  sets_won: number;
  sets_lost: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TournamentEngine {
  /** 赛制唯一标识 */
  readonly type: TournamentFormat;
  /** 赛制显示名 */
  readonly name: string;

  /** 验证配置是否合法 */
  validate(config: TournamentConfig, playerCount: number): ValidationResult;

  /** 生成比赛对阵 */
  generateMatches(players: Player[], config: TournamentConfig): GeneratedMatch[];

  /** 计算排名/积分表 */
  calculateStandings(
    matches: { player1_name: string; player2_name: string; winner_name: string | null }[],
    config: TournamentConfig
  ): Standing[];

  /** 是否可以进入下一轮（淘汰赛用） */
  canProceed?(tournament: { matches: any[]; config: TournamentConfig }): boolean;

  /** 生成下一轮比赛（淘汰赛用） */
  getNextRound?(tournament: { matches: any[]; config: TournamentConfig; players: Player[] }): GeneratedMatch[];
}
