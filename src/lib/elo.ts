const K_FACTOR = 32;
const INITIAL_SCORE = 1500;

/**
 * 计算期望胜率（基于开球网 ELO 算法）
 */
export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

/**
 * 计算 ELO 积分变动
 * @param ra 选手A当前积分
 * @param rb 选手B当前积分
 * @param winner 'player1' 或 'player2'
 * @returns 新旧积分及变动值
 */
export function calculateElo(
  ra: number,
  rb: number,
  winner: 'player1' | 'player2',
  kFactor: number = K_FACTOR
): {
  newRa: number;
  newRb: number;
  deltaA: number;
  deltaB: number;
} {
  const ea = expectedScore(ra, rb);
  const eb = expectedScore(rb, ra);
  const sa = winner === 'player1' ? 1 : 0;
  const sb = winner === 'player2' ? 1 : 0;

  const newRa = Math.round(ra + kFactor * (sa - ea));
  const newRb = Math.round(rb + kFactor * (sb - eb));

  return {
    newRa,
    newRb,
    deltaA: newRa - ra,
    deltaB: newRb - rb,
  };
}

/**
 * 批量结算比赛 ELO 积分
 * 更新双方 profiles.elo_score，写入 elo_history
 */
export async function settleMatchElo(
  supabase: any,
  matchId: string,
  player1Id: string,
  player2Id: string,
  winner: 'player1' | 'player2',
  kFactor: number = K_FACTOR
) {
  const { data: p1 } = await supabase
    .from('profiles')
    .select('id, elo_score')
    .eq('id', player1Id)
    .single();
  const { data: p2 } = await supabase
    .from('profiles')
    .select('id, elo_score')
    .eq('id', player2Id)
    .single();

  if (!p1 || !p2) throw new Error('选手不存在');

  const result = calculateElo(p1.elo_score, p2.elo_score, winner, kFactor);
  const winnerId = winner === 'player1' ? player1Id : player2Id;
  const loserId = winner === 'player1' ? player2Id : player1Id;

  // 事务：更新双方积分 + 写入历史 + 标记比赛已结算
  const { error } = await supabase.rpc('settle_match_elo', {
    p_match_id: matchId,
    p1_id: player1Id,
    p1_new_score: result.newRa,
    p2_id: player2Id,
    p2_new_score: result.newRb,
    p1_delta: result.deltaA,
    p2_delta: result.deltaB,
    p_winner_id: winnerId,
    p_loser_id: loserId,
  });

  if (error) throw error;
  return result;
}
