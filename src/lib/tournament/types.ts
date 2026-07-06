export type TournamentFormat =
  | 'single_match'
  | 'round_robin'
  | 'knockout'
  | 'group_knockout'
  | 'custom_score';

export interface TournamentConfig {
  sets_to_win: number;         // 每场比赛赢几局获胜（如 3局2胜）
  points_per_win?: number;      // 循环赛胜场积分（默认1）
  points_per_draw?: number;     // 循环赛平局积分（默认0）
  third_place_match?: boolean;  // 淘汰赛是否进行三四名决赛
  groups?: number;              // 混合赛小组数
  advance_per_group?: number;   // 混合赛每组晋级人数
}

export interface Player {
  id: string;
  name: string;
  seed: number;
  group_name?: string;
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
