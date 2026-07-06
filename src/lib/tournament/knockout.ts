import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';

/**
 * 淘汰赛引擎
 * 单败淘汰制，选手按种子排名生成二叉树对阵
 */
export const knockoutEngine: TournamentEngine = {
  type: 'knockout',
  name: '淘汰赛',

  validate(config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 2) errors.push('至少需要2名选手');
    if (!config.sets_to_win || config.sets_to_win < 1) errors.push('请设置每场胜局数');

    // 淘汰赛需要 2^n 名选手，不足则首轮轮空
    const totalSlots = nextPowerOfTwo(playerCount);
    const byes = totalSlots - playerCount;
    // 允许轮空，所以不报错
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], _config): GeneratedMatch[] {
    const sorted = [...players].sort((a, b) => (b.seed || 999) - (a.seed || 999));
    const totalSlots = nextPowerOfTwo(sorted.length);
    const matches: GeneratedMatch[] = [];

    // 填充选手到种子位置
    const bracket: (Player | null)[] = new Array(totalSlots).fill(null);
    for (let i = 0; i < sorted.length; i++) {
      bracket[seedPosition(i, totalSlots)] = sorted[i];
    }

    // 生成第一轮对阵
    const firstRound = totalSlots / 2;
    for (let i = 0; i < firstRound; i++) {
      const p1 = bracket[i * 2];
      const p2 = bracket[i * 2 + 1];

      if (!p1 && !p2) continue; // 空位

      matches.push({
        player1_name: p1?.name || '(轮空)',
        player2_name: p2?.name || '(轮空)',
        round: 1,
        bracket_pos: i,
      });
    }

    return matches;
  },

  calculateStandings(matches, _config): Standing[] {
    const playerMap = new Map<string, Standing>();
    const eliminated = new Set<string>();

    for (const m of matches) {
      for (const name of [m.player1_name, m.player2_name]) {
        if (name === '(轮空)' || eliminated.has(name)) continue;
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            player_name: name, wins: 0, losses: 0, draws: 0,
            points: 0, sets_won: 0, sets_lost: 0,
          });
        }
      }

      if (!m.winner_name) continue;

      // 胜者赢1场
      const winner = playerMap.get(m.winner_name);
      if (winner) winner.wins++;

      // 败者淘汰标记
      const loserName = m.winner_name === m.player1_name ? m.player2_name : m.player1_name;
      if (loserName !== '(轮空)') {
        const loser = playerMap.get(loserName);
        if (loser) loser.losses++;
        eliminated.add(loserName);
      }
    }

    return Array.from(playerMap.values()).sort((a, b) => b.wins - a.wins);
  },

  canProceed(tournament): boolean {
    const { matches } = tournament;
    if (matches.length === 0) return false;

    // 检查当前轮次是否全部完成
    const currentRound = Math.max(...matches.map((m: any) => m.round || 1));
    const roundMatches = matches.filter((m: any) => m.round === currentRound);
    const allDone = roundMatches.every((m: any) =>
      m.status === 'completed' || m.player1_name === '(轮空)' || m.player2_name === '(轮空)'
    );

    if (!allDone) return false;

    // 如果第一轮还没生成或者冠军赛已完成，则不能继续
    const championMatch = roundMatches.length === 1;
    return !championMatch;
  },

  getNextRound(tournament): GeneratedMatch[] {
    const { matches } = tournament;
    if (!this.canProceed!(tournament)) return [];

    const currentRound = Math.max(...matches.map((m: any) => m.round || 1));
    const roundMatches = matches.filter((m: any) => m.round === currentRound);
    const nextMatches: GeneratedMatch[] = [];

    // 收集胜者
    const winners: string[] = [];
    for (let i = 0; i < roundMatches.length; i += 2) {
      const m1 = roundMatches[i];
      const m2 = roundMatches[i + 1];

      if (!m1 || !m2) continue;

      const w1 = m1.winner_name || m1.player1_name;
      const w2 = m2.winner_name || m2.player1_name;

      if (w1 !== '(轮空)' && w2 !== '(轮空)') {
        nextMatches.push({
          player1_name: w1,
          player2_name: w2,
          round: currentRound + 1,
          bracket_pos: Math.floor(i / 2),
        });
      }
    }

    return nextMatches;
  },
};

/** 不小于 n 的最小 2 的幂 */
function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** 种子排位算法，让强种子在后期相遇 */
function seedPosition(index: number, totalSlots: number): number {
  if (totalSlots === 2) return index;
  const half = totalSlots / 2;
  if (index < half) {
    return seedPosition(index, half) * 2;
  } else {
    return seedPosition(index - half, half) * 2 + 1;
  }
}
