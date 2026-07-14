import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';

/**
 * 擂台挑战赛引擎
 * 3~8人参赛，第1位报名者为擂主
 * 挑战者按ELO从低到高依次上场，胜者成为新擂主
 * 全部挑战完毕后的最终擂主为冠军
 */
export const arenaEngine: TournamentEngine = {
  type: 'fun_arena',
  name: '擂台挑战赛',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 3) errors.push('擂台挑战赛至少需要3名选手');
    if (playerCount > 8) errors.push('擂台挑战赛最多8名选手');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], config): GeneratedMatch[] {
    // 第1位报名者为初始擂主
    const champion = players[0];
    // 其余选手为挑战者
    const challengers = players.slice(1);

    // 写入挑战顺序到 config（调用者负责持久化）
    (config as any).challenge_order = challengers.map((c, i) => ({
      challenger_name: c.name,
      order: i + 1,
    }));
    (config as any).arena_champion_name = champion.name;
    (config as any).arena_streak = 0;

    // 只生成第一场：擂主 vs 第1位挑战者
    if (challengers.length === 0) return [];
    return [{
      player1_name: champion.name,
      player2_name: challengers[0].name,
    }];
  },

  calculateStandings(matches, _config): Standing[] {
    const playerMap = new Map<string, Standing>();
    const completed = matches.filter(m => m.winner_name);
    for (const m of completed) {
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
    // 最终擂主（最后一场的胜者）排第一，其他按胜场排
    return Array.from(playerMap.values()).sort((a, b) => b.points - a.points || b.wins - a.wins);
  },

  canProceed(tournament): boolean {
    const { matches, config } = tournament;
    const order: { challenger_name: string; order: number }[] = (config as any).challenge_order || [];
    if (order.length === 0) return false;

    // 所有挑战者是否都已上场
    const lastMatch = matches[matches.length - 1];
    if (!lastMatch) return false;

    // 最后一场必须完成
    if (lastMatch.status !== 'completed') return false;

    // 还有未上场的挑战者？
    const currentChallengerCount = matches.length;
    return currentChallengerCount < order.length;
  },

  getNextRound(tournament): GeneratedMatch[] {
    const { matches, config } = tournament;
    if (!this.canProceed!(tournament)) return [];

    const lastMatch = matches[matches.length - 1];
    const champion = lastMatch.winner_name || lastMatch.player1_name;
    const order: { challenger_name: string; order: number }[] = (config as any).challenge_order || [];
    const nextIndex = matches.length; // 0-based，当前已完成场数 = 下一挑战者索引
    const nextChallenger = order[nextIndex];

    if (!nextChallenger) return [];

    return [{
      player1_name: champion,
      player2_name: nextChallenger.challenger_name,
    }];
  },
};
