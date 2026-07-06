import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';
import { roundRobinEngine } from './round-robin';
import { knockoutEngine } from './knockout';

/**
 * 混合赛引擎
 * 先小组循环赛，每组前 N 名出线后进行淘汰赛
 */
export const groupKnockoutEngine: TournamentEngine = {
  type: 'group_knockout',
  name: '混合赛（小组+淘汰）',

  validate(config, playerCount): ValidationResult {
    const errors: string[] = [];
    const groups = config.groups || 2;
    const advance = config.advance_per_group || 2;

    if (playerCount < groups) errors.push('选手数不能少于小组数');
    if (groups < 1) errors.push('至少需要1个小组');
    if (advance < 1) errors.push('每组至少晋级1人');
    if (!config.sets_to_win || config.sets_to_win < 1) errors.push('请设置每场胜局数');

    // 淘汰赛阶段需要 2^n 晋级选手
    const totalAdvance = groups * advance;
    const totalSlots = nextPowerOfTwo(totalAdvance);
    if (totalSlots !== totalAdvance) {
      errors.push(`晋级人数 (${totalAdvance}) 不是2的幂，需要 ${totalSlots} 人`);
    }

    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], config: TournamentConfig): GeneratedMatch[] {
    // 分组
    const groups = distributePlayers(players, config.groups || 2);
    const matches: GeneratedMatch[] = [];

    // 小组循环赛
    for (const [groupName, groupPlayers] of Object.entries(groups)) {
      const groupMatches = roundRobinEngine.generateMatches(
        groupPlayers.map(p => ({ id: p.id, name: p.name, seed: 0, group_name: groupName })),
        config
      );
      matches.push(...groupMatches.map(m => ({ ...m, group_name: groupName })));
    }

    return matches;
  },

  calculateStandings(matches, config): Standing[] {
    return roundRobinEngine.calculateStandings(matches, config);
  },

  canProceed(tournament): boolean {
    // 检查小组赛是否全部完成
    const groupMatches = tournament.matches.filter((m: any) => m.group_name && !m.round);
    const allDone = groupMatches.every((m: any) => m.status === 'completed');
    if (!allDone) return false;

    // 是否已经生成淘汰赛
    const knockoutMatches = tournament.matches.filter((m: any) => m.round);
    return knockoutMatches.length === 0;
  },

  getNextRound(tournament): GeneratedMatch[] {
    const groups = tournament.config.groups || 2;
    const advance = tournament.config.advance_per_group || 2;

    // 从已完成的小组赛中找出晋级选手
    const groupWinners: string[] = [];
    for (let g = 0; g < groups; g++) {
      const groupName = String.fromCharCode(65 + g); // A, B, C...
      const groupMatches = tournament.matches.filter(
        (m: any) => m.group_name === groupName || m.group_name === `第${g + 1}组`
      );
      const standings = this.calculateStandings(groupMatches, tournament.config);
      for (let i = 0; i < Math.min(advance, standings.length); i++) {
        groupWinners.push(standings[i].player_name);
      }
    }

    // 用淘汰赛引擎生成对阵
    const koPlayers = groupWinners.map((name, i) => ({
      id: '', name, seed: groupWinners.length - i,
    }));

    return knockoutEngine.generateMatches(koPlayers, tournament.config).map(m => ({
      ...m,
      round: (m.round || 1) + 100, // 淘汰赛轮次偏移，避免和小组赛混淆
    }));
  },
};

function distributePlayers(players: Player[], groupCount: number): Record<string, Player[]> {
  const groups: Record<string, Player[]> = {};
  const sorted = [...players].sort((a, b) => (b.seed || 0) - (a.seed || 0));

  // 蛇形排位
  for (let i = 0; i < sorted.length; i++) {
    const groupIndex = i % groupCount;
    const groupName = String.fromCharCode(65 + groupIndex); // A, B, C...
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(sorted[i]);
  }

  return groups;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

import type { TournamentConfig } from './types';
