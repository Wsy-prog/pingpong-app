import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';

/**
 * 百分个人大战引擎
 * 2人参赛，先得100分者胜
 * 实际比赛生成由 TournamentSetupPage 的最低人数 bypass 处理
 */
export const fun100IndividualEngine: TournamentEngine = {
  type: 'fun_100_individual',
  name: '百分个人大战',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 2) errors.push('至少需要2名选手');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(_players: Player[], _config): GeneratedMatch[] {
    // 实际由 TournamentSetupPage bypass 处理
    return [];
  },

  calculateStandings(matches, _config): Standing[] {
    const playerMap = new Map<string, Standing>();
    for (const m of matches) {
      for (const name of [m.player1_name, m.player2_name]) {
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            player_name: name, wins: 0, losses: 0, draws: 0,
            points: 0, sets_won: 0, sets_lost: 0,
          });
        }
      }
      if (m.winner_name) {
        const winner = playerMap.get(m.winner_name);
        if (winner) { winner.wins++; winner.points = 1; }
        const loserName = m.winner_name === m.player1_name ? m.player2_name : m.player1_name;
        const loser = playerMap.get(loserName);
        if (loser) loser.losses++;
      }
    }
    return Array.from(playerMap.values()).sort((a, b) => b.points - a.points);
  },
};

/**
 * 百分团体大赛引擎
 * 2队各5人，7阶段接力，累计100分
 * 实际比赛生成由 TournamentSetupPage bypass 处理
 */
export const fun100TeamEngine: TournamentEngine = {
  type: 'fun_100_team',
  name: '百分团体大赛',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 10) errors.push('每队需要5名选手，共10人');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(_players: Player[], _config): GeneratedMatch[] {
    // 实际由 TournamentSetupPage bypass 处理
    return [];
  },

  calculateStandings(matches, _config): Standing[] {
    const playerMap = new Map<string, Standing>();
    for (const m of matches) {
      for (const name of [m.player1_name, m.player2_name]) {
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            player_name: name, wins: 0, losses: 0, draws: 0,
            points: 0, sets_won: 0, sets_lost: 0,
          });
        }
      }
      if (m.winner_name) {
        const winner = playerMap.get(m.winner_name);
        if (winner) { winner.wins++; winner.points = 1; }
        const loserName = m.winner_name === m.player1_name ? m.player2_name : m.player1_name;
        const loser = playerMap.get(loserName);
        if (loser) loser.losses++;
      }
    }
    return Array.from(playerMap.values()).sort((a, b) => b.points - a.points);
  },
};
