import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';

/**
 * ELO 让分赛引擎
 * 2人参赛，ELO高者让低者分数（每50分让1分，上限15分）
 * 低分者从让分数开始计分，先得21分且领先≥2分者胜
 */
export const eloHandicapEngine: TournamentEngine = {
  type: 'fun_elo_handicap',
  name: 'ELO让分赛',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount !== 2) errors.push('ELO让分赛需要恰好2名选手');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], config): GeneratedMatch[] {
    // 只生成1场决胜赛
    return [{
      player1_name: players[0].name,
      player2_name: players[1].name,
    }];
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
