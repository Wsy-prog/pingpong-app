import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';

/**
 * 循环赛引擎
 * 所有选手两两对战，按积分排名
 */
export const roundRobinEngine: TournamentEngine = {
  type: 'round_robin',
  name: '循环赛',

  validate(config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 2) errors.push('至少需要2名选手');
    if (!config.sets_to_win || config.sets_to_win < 1) errors.push('请设置每场胜局数');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], _config): GeneratedMatch[] {
    const matches: GeneratedMatch[] = [];
    const groups = groupPlayers(players);

    for (const [groupName, groupPlayers] of Object.entries(groups)) {
      for (let i = 0; i < groupPlayers.length; i++) {
        for (let j = i + 1; j < groupPlayers.length; j++) {
          matches.push({
            player1_name: groupPlayers[i].name,
            player2_name: groupPlayers[j].name,
            group_name: groupName || undefined,
          });
        }
      }
    }

    return matches;
  },

  calculateStandings(matches, _config): Standing[] {
    const playerMap = new Map<string, Standing>();

    for (const m of matches) {
      if (!playerMap.has(m.player1_name)) {
        playerMap.set(m.player1_name, {
          player_name: m.player1_name, wins: 0, losses: 0, draws: 0,
          points: 0, sets_won: 0, sets_lost: 0,
        });
      }
      if (!playerMap.has(m.player2_name)) {
        playerMap.set(m.player2_name, {
          player_name: m.player2_name, wins: 0, losses: 0, draws: 0,
          points: 0, sets_won: 0, sets_lost: 0,
        });
      }

      if (!m.winner_name) continue;

      const p1 = playerMap.get(m.player1_name)!;
      const p2 = playerMap.get(m.player2_name)!;

      if (m.winner_name === m.player1_name) {
        p1.wins++; p2.losses++;
      } else if (m.winner_name === m.player2_name) {
        p2.wins++; p1.losses++;
      }
    }

    // 计算积分
    const pointConfig = { win: _config.points_per_win ?? 1, draw: _config.points_per_draw ?? 0 };
    for (const s of playerMap.values()) {
      s.points = s.wins * pointConfig.win + s.draws * pointConfig.draw;
    }

    // 按积分排序，同分按胜场
    return Array.from(playerMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.wins - a.wins;
    });
  },
};

function groupPlayers(players: Player[]): Record<string, Player[]> {
  const groups: Record<string, Player[]> = {};
  for (const p of players) {
    const key = p.group_name || 'default';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return groups;
}
