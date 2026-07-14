import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';
import { knockoutEngine } from './knockout';
import { groupKnockoutEngine } from './group-knockout';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 盲盒双打赛引擎
 * 4的倍数参赛（4~16人），随机配对组队
 * 4队→淘汰赛，≥6队→先小组后淘汰
 */
export const blindDoublesEngine: TournamentEngine = {
  type: 'fun_blind_doubles',
  name: '盲盒双打赛',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 4) errors.push('盲盒双打赛至少需要4名选手');
    if (playerCount > 16) errors.push('盲盒双打赛最多16名选手');
    if (playerCount % 4 !== 0) errors.push('盲盒双打赛人数必须是4的倍数');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], config): GeneratedMatch[] {
    // 随机配对成2人一队
    const shuffled = shuffle(players);
    const teamCount = shuffled.length / 2;
    const teams: { name: string; player_ids: string[] }[] = [];

    for (let i = 0; i < teamCount; i++) {
      const p1 = shuffled[i * 2];
      const p2 = shuffled[i * 2 + 1];
      teams.push({
        name: `${p1.name}/${p2.name}`,
        player_ids: [p1.id, p2.id],
      });
    }

    // 写入 teams 到 config（调用者负责持久化）
    (config as any).teams = teams;

    // 将队伍转为伪 Player 供委托引擎使用
    const teamPlayers: Player[] = teams.map((t, i) => ({
      id: `team_${i}`,
      name: t.name,
      seed: i + 1,
    }));

    // 根据队伍数委托给不同引擎
    if (teamCount === 2) {
      // 2队直接决赛
      return [{
        player1_name: teamPlayers[0].name,
        player2_name: teamPlayers[1].name,
      }];
    } else if (teamCount === 4) {
      return knockoutEngine.generateMatches(teamPlayers, config);
    } else {
      // ≥6队 → 小组+淘汰
      const groupConfig = { ...config, groups: Math.ceil(teamCount / 3), advance_per_group: 2, sets_to_win: config.sets_to_win || 3 };
      return groupKnockoutEngine.generateMatches(teamPlayers, groupConfig);
    }
  },

  calculateStandings(matches, config): Standing[] {
    if ((config as any).groups) {
      return groupKnockoutEngine.calculateStandings(matches, config);
    }
    return knockoutEngine.calculateStandings(matches, config);
  },

  canProceed(tournament): boolean {
    const teamCount = tournament.config.teams?.length ?? 0;
    if (teamCount <= 2) return false;
    if (teamCount === 4) return knockoutEngine.canProceed!(tournament);
    return groupKnockoutEngine.canProceed!(tournament);
  },

  getNextRound(tournament): GeneratedMatch[] {
    const teamCount = tournament.config.teams?.length ?? 0;
    if (teamCount <= 2) return [];
    if (teamCount === 4) return knockoutEngine.getNextRound!(tournament);
    return groupKnockoutEngine.getNextRound!(tournament);
  },
};
