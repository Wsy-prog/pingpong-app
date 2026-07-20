import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';

/**
 * 百分个人大战引擎
 * 2人参赛，先得100分者胜
 */
export const fun100IndividualEngine: TournamentEngine = {
  type: 'fun_100_individual',
  name: '百分个人大战',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 2) errors.push('至少需要2名选手');
    if (playerCount > 2) errors.push('百分个人大战仅支持2人对战');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], config): GeneratedMatch[] {
    if (players.length < 2) return [];
    config.target_score = 100;
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

/**
 * 百分团体大赛引擎
 * 2队各5人，7阶段接力，累计100分
 */
export const fun100TeamEngine: TournamentEngine = {
  type: 'fun_100_team',
  name: '百分团体大赛',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 10) errors.push('每队需要5名选手，共10人');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], config): GeneratedMatch[] {
    // Get team names from the players' team assignments
    const teamNames = [...new Set(players.map(p => p.team_name || '').filter(Boolean))]
    if (teamNames.length < 2 || players.length < 10) return []

    const t1Players = players.filter(p => p.team_name === teamNames[0])
    const t2Players = players.filter(p => p.team_name === teamNames[1])

    config.target_score = 100
    config.mode = 'team_relay'
    config.team1 = { name: teamNames[0], players: t1Players.map(p => p.name) }
    config.team2 = { name: teamNames[1], players: t2Players.map(p => p.name) }

    // Single match entry (stage details handled in MatchDetailPage)
    return [{
      player1_name: teamNames[0],
      player2_name: teamNames[1],
    }]
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
