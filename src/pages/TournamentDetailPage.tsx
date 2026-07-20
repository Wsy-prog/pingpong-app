import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getEngine } from '../lib/tournament'
import { settleMatchElo } from '../lib/elo'
import type { Tournament, Match } from '../types'
import type { Player as EnginePlayer } from '../lib/tournament'
import { StatusBadge } from '../components/common/StatusBadge'
import { TeamManager } from '../components/tournament/TeamManager'

export function TournamentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user: currentUser, isAdmin } = useAuth()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [players, setPlayers] = useState<EnginePlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [scoreError, setScoreError] = useState('')

  useEffect(() => {
    if (id) loadTournament()
  }, [id])

  async function loadTournament() {
    const { data: t } = await supabase.from('tournaments').select('*').eq('id', id).single()
    if (t) setTournament(t)

    const { data: m } = await supabase.from('matches').select('*').eq('tournament_id', id)
    if (m) setMatches(m)

    const { data: p } = await supabase.from('tournament_players').select('*').eq('tournament_id', id)
    if (p) {
      setPlayers(p.map(p => ({
        id: p.id, name: p.player_name, seed: p.seed, group_name: p.group_name || undefined
      })))
    }
    setLoading(false)
  }

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>
  if (!tournament) return <div className="text-center py-10 text-gray-400">赛事不存在</div>

  const engine = getEngine(tournament.format)
  const groups = groupMatches(matches)
  const groupsList = Object.entries(groups)

  // 确定冠军
  const champion = (() => {
    const t = tournament! // 此处 tournament 已确保非 null（上面有 early return）
    if (t.status !== 'completed') return null

    if (t.format === 'knockout' || t.format === 'group_knockout') {
      const completedMatches = matches.filter(m => m.status === 'completed' && m.round)
      if (completedMatches.length === 0) return null
      const maxRound = Math.max(...completedMatches.map(m => m.round!))
      const finalMatch = completedMatches.find(m => m.round === maxRound)
      return finalMatch?.winner_name || null
    }

    if (t.format === 'round_robin') {
      const standings = engine.calculateStandings(
        matches.map(m => ({ player1_name: m.player1_name, player2_name: m.player2_name, winner_name: m.winner_name })),
        t.config as any
      )
      return standings.length > 0 ? standings[0].player_name : null
    }

    if (t.format === 'fun_arena') {
      const completedMatches = matches.filter(m => m.status === 'completed')
      if (completedMatches.length === 0) return null
      const lastMatch = completedMatches[completedMatches.length - 1]
      return lastMatch.winner_name || null
    }

    // 所有其他赛制：最后一场已完成的比赛的胜者
    const completed = matches.filter(m => m.status === 'completed' && m.winner_name)
    if (completed.length === 0) return null
    return completed[completed.length - 1].winner_name
  })()

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* 冠军横幅 */}
      {champion && (
        <div className="bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 rounded-xl p-5 shadow-lg text-center animate-pulse">
          <p className="text-sm font-bold text-yellow-900 mb-1">🏆 冠军 🏆</p>
          <p className="text-2xl font-extrabold text-white drop-shadow-lg">{champion}</p>
          <p className="text-xs text-yellow-900 mt-1 opacity-75">{tournament.name}</p>
        </div>
      )}

      {/* 赛事信息 */}
      <div>
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600">&larr; 返回</button>
        <h1 className="text-xl font-bold mt-1">{tournament.name}</h1>
        <div className="flex gap-2 mt-1">
          <StatusBadge status={tournament.status} />
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            {engine?.name || tournament.format}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            tournament.category === 'team' ? 'bg-purple-100 text-purple-700' :
            tournament.category === 'doubles' ? 'bg-orange-100 text-orange-700' :
            tournament.category === 'fun' ? 'bg-pink-100 text-pink-700' :
            'bg-green-100 text-green-700'
          }`}>
            {tournament.category === 'team' ? '👥 团体赛' :
             tournament.category === 'doubles' ? '🎯 双打' :
             tournament.category === 'fun' ? '🎪 趣味' : '🏓 单人赛'}
          </span>
        </div>
        {tournament.description && <p className="text-sm text-gray-500 mt-2">{tournament.description}</p>}
      </div>

      {/* ===== 第一部分：总体签表 ===== */}
      {tournament.format === 'knockout' && matches.some(m => m.round) && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm flex items-center gap-2">
            <span>📊</span> 总体签表
          </div>
          {renderBracketView(matches, currentUser?.nickname)}
        </div>
      )}

      {/* 混合赛 - 先小组签表再淘汰赛签表 */}
      {tournament.format === 'group_knockout' && (
        <KnockoutSection matches={matches} tournament={tournament} currentUserName={currentUser?.nickname} />
      )}

      {/* 循环赛赛程表 */}
      {tournament.format === 'round_robin' && matches.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm flex items-center gap-2">
            <span>📊</span> 总体赛程
          </div>
          <div className="divide-y">
            {matches.map(m => {
              const isMyMatch = currentUser && (
                m.player1_name === currentUser.nickname || m.player2_name === currentUser.nickname
              )
              const scores = m.player1_sets > 0 || m.player2_sets > 0 ? ` (${m.player1_sets}:${m.player2_sets})` : ''
              return (
                <Link key={m.id} to={`/matches/${m.id}`}
                  className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition ${
                    isMyMatch ? 'bg-yellow-50 border-l-2 border-yellow-400' : ''
                  }`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className={m.winner_name === m.player1_name ? 'font-bold text-green-700' : ''}>{m.player1_name}</span>
                      {' vs '}
                      <span className={m.winner_name === m.player2_name ? 'font-bold text-green-700' : ''}>{m.player2_name}</span>
                      {scores && <span className="text-gray-400 ml-1">{scores}</span>}
                    </p>
                    {m.group_name && <span className="text-xs text-gray-400">{m.group_name}</span>}
                  </div>
                  <StatusBadge status={m.status} />
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== 第二部分：我的对阵 ===== */}
      {currentUser && (
        <MyBracketSection
          currentUserName={currentUser.nickname}
          matches={matches}
          tournament={tournament}
          scoreError={scoreError} setScoreError={setScoreError}
          onUpdated={loadTournament}
        />
      )}

      {/* ===== 循环赛积分表 ===== */}
      {(tournament.format === 'round_robin' || tournament.format === 'group_knockout') && (
        groupsList.map(([groupName, groupMatches]) => {
          const standings = engine?.calculateStandings(
            groupMatches.map((m: any) => ({
              player1_name: m.player1_name,
              player2_name: m.player2_name,
              winner_name: m.winner_name,
            })),
            tournament.config as any
          ) || []
          return (
            <div key={groupName} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">
                {groupName === 'default' ? '📊 积分表' : `📊 ${groupName} 积分表`}
              </div>
              {standings.length === 0 ? (
                <p className="text-center text-gray-400 py-4 text-sm">暂无数据</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">选手</th>
                        <th className="px-3 py-2 text-center">胜</th>
                        <th className="px-3 py-2 text-center">负</th>
                        <th className="px-3 py-2 text-center">积分</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {standings.map((s, i) => {
                        const isMe = currentUser?.nickname === s.player_name
                        return (
                          <tr key={s.player_name}
                            className={`${isMe ? 'bg-yellow-100' : i === 0 ? 'bg-yellow-50' : ''}`}>
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className={`px-3 py-2 font-medium ${isMe ? 'text-yellow-800' : ''}`}>
                              {isMe ? '⭐ ' : ''}{s.player_name}
                            </td>
                            <td className="px-3 py-2 text-center text-green-600">{s.wins}</td>
                            <td className="px-3 py-2 text-center text-red-500">{s.losses}</td>
                            <td className="px-3 py-2 text-center font-bold">{s.points}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* ===== 选手列表 ===== */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">
          {tournament.category === 'team' ? '队员列表（按队伍）' : tournament.category === 'doubles' ? '双打选手' : tournament.category === 'fun' ? '选手' : '参赛选手'} ({players.length})
        </div>
        {players.length === 0 ? (
          <p className="text-center text-gray-400 py-4 text-sm">暂无选手</p>
        ) : tournament.category === 'team' ? (
          <div className="divide-y">
            {(() => {
              const teams = [...new Set(players.map(p => p.group_name || p.team_name || '').filter(Boolean))]
              return teams.map(team => (
                <div key={team}>
                  <div className="px-4 py-2 bg-purple-50 text-sm font-medium text-purple-700">
                    👥 {team} ({players.filter(p => (p.group_name || p.team_name) === team).length}人)
                  </div>
                  {players.filter(p => (p.group_name || p.team_name) === team).map((p, i) => (
                    <div key={p.id} className="px-4 py-2 flex items-center gap-3 text-sm pl-8">
                      <span className="text-gray-400 w-5">{i + 1}</span>
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              ))
            })()}
          </div>
        ) : (
          <div className="divide-y">
            {players.map((p, i) => (
              <div key={p.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="text-gray-400 w-5">{i + 1}</span>
                <span>{p.name}</span>
                {p.group_name && <span className="text-xs text-gray-400">({p.group_name})</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 擂台赛视图 */}
      {tournament.format === 'fun_arena' && (
        <ArenaView
          matches={matches}
          config={tournament.config as any}
          players={players}
        />
      )}

      {/* 盲盒双打配对结果 */}
      {tournament.format === 'fun_blind_doubles' && (tournament.config as any)?.teams && (
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
          <h3 className="font-medium">🎲 随机配对结果</h3>
          {((tournament.config as any).teams as any[]).map((team, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
              <span className="text-blue-400 font-medium">#{i + 1}</span>
              <span className="font-medium text-blue-700">{team.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* 队伍管理 — 团体赛草稿阶段 */}
      {tournament.status === 'draft' && tournament.category === 'team' && (
        <TeamManager tournamentId={id!} tournamentName={tournament.name} onUpdate={loadTournament} />
      )}

      {/* 操作按钮 */}
      {tournament.status === 'draft' && (
        <Link to={`/tournaments/${id}/setup`}
          className="block w-full text-center py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700">
          配置选手
        </Link>
      )}

      {tournament.status === 'in_progress' && (tournament.format === 'knockout' || tournament.format === 'group_knockout' || tournament.format === 'fun_arena') && (
        <AdvanceRoundButton tournamentId={id!} matches={matches} tournament={tournament} players={players} onUpdated={loadTournament} />
      )}

      {/* 结束赛事 */}
      {tournament.status === 'in_progress' && (
        <button onClick={async () => {
          if (confirm('确定结束赛事吗？')) {
            await supabase.from('tournaments').update({ status: 'completed' }).eq('id', id)
            loadTournament()
          }
        }}
          className="w-full py-2.5 border border-red-300 text-red-600 rounded-xl text-sm hover:bg-red-50">
          结束赛事
        </button>
      )}

      {/* 删除赛事 — 创建者或管理员可见 */}
      {(isAdmin || tournament.created_by === currentUser?.id) && (
        <button onClick={async () => {
          if (!confirm('⚠️ 确定删除此赛事及其所有相关数据？此操作不可撤销！')) return
          if (!confirm('再次确认：删除赛事「' + tournament.name + '」？')) return
          await supabase.from('matches').delete().eq('tournament_id', id)
          await supabase.from('teams').delete().eq('tournament_id', id)
          await supabase.from('notifications').delete().eq('related_id', id)
          await supabase.from('tournament_players').delete().eq('tournament_id', id)
          await supabase.from('tournaments').delete().eq('id', id)
          navigate('/tournaments')
        }}
          className="w-full py-2.5 border border-red-200 text-red-400 rounded-xl text-sm hover:bg-red-50">
          删除赛事
        </button>
      )}
    </div>
  )
}

function KnockoutSection({ matches, tournament, currentUserName }: { matches: Match[]; tournament: Tournament; currentUserName?: string }) {
  const koMatches = matches.filter(m => m.round && m.round >= 100)
  if (koMatches.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">淘汰赛阶段</div>
      {renderBracketView(koMatches, currentUserName)}
    </div>
  )
}

const ROUND_LABELS: Record<number, string> = {
  1: 'R1', 2: 'R2', 3: 'R3', 4: 'R4',
  101: 'QF', 102: 'SF', 103: 'F',
}

function getRoundLabel(round: number, isKo: boolean, totalRounds: number): string {
  if (ROUND_LABELS[round]) return ROUND_LABELS[round]

  const offset = isKo ? round - 100 : round
  if (offset === totalRounds) return 'F'
  if (offset === totalRounds - 1) return 'SF'
  if (offset === totalRounds - 2) return 'QF'
  return `R${offset}`
}

function renderBracketView(matches: Match[], currentUserName?: string) {
  const rounds = [...new Set(matches.filter(m => m.round).map(m => m.round!))].sort((a, b) => a - b)
  if (rounds.length === 0) return <p className="text-center text-gray-400 py-4 text-sm">待生成</p>

  const isKo = rounds[0] >= 100
  const totalRounds = rounds.length

  return (
    <div className="p-4 overflow-x-auto">
      <div className="flex items-stretch" style={{ minWidth: totalRounds * 180 + 40, gap: 0 }}>
        {rounds.map((round, roundIdx) => {
          const roundMatches = matches.filter(m => m.round === round).sort((a, b) => (a.bracket_pos || 0) - (b.bracket_pos || 0))
          const isLastRound = roundIdx === totalRounds - 1
          const label = getRoundLabel(round, isKo, totalRounds)

          return (
            <div key={round} style={{ flex: '0 0 170px', position: 'relative' }}>
              {/* 轮次标题 */}
              <div className={`text-center py-1.5 mb-3 rounded-t-md text-xs font-bold ${
                isLastRound ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {label}
              </div>

              {/* 比赛卡片 */}
              <div className="flex flex-col" style={{ justifyContent: 'space-around', minHeight: roundMatches.length * 80 }}>
                {roundMatches.map((m, i) => {
                  const isMyMatch = currentUserName && (
                    m.player1_name === currentUserName || m.player2_name === currentUserName
                  )
                  const isBye = m.player1_name === '(轮空)' || m.player2_name === '(轮空)'
                  const spacing = roundMatches.length === 1 ? 0 : i * Math.pow(2, roundIdx) * 40

                  return (
                    <div key={m.id} style={{ marginTop: i === 0 ? 0 : spacing }}>
                      <Link to={`/matches/${m.id}`}
                        className={`block border-2 text-sm transition relative ${
                          isMyMatch
                            ? 'border-yellow-400 bg-yellow-50 shadow-md'
                            : isBye ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 hover:border-blue-300 bg-white'
                        }`}
                        style={{ borderRadius: 6 }}>
                        {/* 选手1 */}
                        <div className={`px-2 py-1.5 ${isMyMatch && m.player1_name === currentUserName ? 'bg-yellow-200 font-bold' : ''}`}>
                          <span className={m.winner_name && m.winner_name !== m.player1_name ? 'text-gray-400' : ''}>
                            {m.player1_name}
                          </span>
                          {m.status === 'completed' && m.winner_name === m.player1_name && (
                            <span className="text-green-600 text-xs ml-1">✓</span>
                          )}
                        </div>
                        {/* 比分 */}
                        {m.status === 'completed' && (m.player1_sets > 0 || m.player2_sets > 0) && (
                          <div className="text-center text-xs text-gray-500 bg-gray-50 border-t border-b border-dashed px-2 py-0.5">
                            {m.player1_sets}:{m.player2_sets}
                          </div>
                        )}
                        {!(m.status === 'completed' && m.player1_sets > 0) && (
                          <div className="border-t border-gray-100" />
                        )}
                        <div className={`px-2 py-1.5 ${isMyMatch && m.player2_name === currentUserName ? 'bg-yellow-200 font-bold' : ''}`}>
                          <span className={m.winner_name && m.winner_name !== m.player2_name ? 'text-gray-400' : ''}>
                            {m.player2_name}
                          </span>
                          {m.status === 'completed' && m.winner_name === m.player2_name && (
                            <span className="text-green-600 text-xs ml-1">✓</span>
                          )}
                        </div>
                        {isMyMatch && m.status !== 'completed' && (
                          <div className="absolute -top-2 -right-2 bg-yellow-400 text-white text-[10px] px-1 rounded-full">
                            ⚡
                          </div>
                        )}
                      </Link>

                      {/* 树形连接线 — 非最后一轮 */}
                      {!isLastRound && i % 2 === 0 && roundIdx < totalRounds - 1 && (
                        <svg style={{
                          position: 'absolute', right: -12, top: '50%',
                          width: 12, height: spacing + 40,
                          transform: `translateY(-${(spacing + 40) / 2}px)`,
                          overflow: 'visible', pointerEvents: 'none',
                        }} className="text-gray-300">
                          <line x1="0" y1="50%" x2="12" y2="50%" stroke="currentColor" strokeWidth="1" />
                          <line x1="12" y1="0" x2="12" y2="100%" stroke="currentColor" strokeWidth="1" />
                        </svg>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 我的签位卡片 — 含成绩登记 + 下一场对手 */
function MyBracketSection({
  currentUserName, matches, tournament,
  scoreError, setScoreError,
  onUpdated,
}: {
  currentUserName: string; matches: Match[]; tournament: Tournament;
  scoreError: string; setScoreError: (v: string) => void;
  onUpdated: () => void;
}) {
  const [quickMatchId, setQuickMatchId] = useState<string | null>(null)
  const [scoreMap, setScoreMap] = useState<Record<string, [number, number]>>({})
  // 我的比赛
  const myMatches = matches.filter(m =>
    (m.player1_name === currentUserName || m.player2_name === currentUserName) &&
    m.player1_name !== '(轮空)' && m.player2_name !== '(轮空)'
  )

  // 未完成的比赛
  const myActiveMatches = myMatches.filter(m => m.status !== 'completed')

  // 已完成的比赛
  const myCompletedMatches = myMatches.filter(m => m.status === 'completed')

  // 下一场对手：在淘汰赛中，找出我赢了的比赛的下一轮对应位置的对手
  const nextOpponent = findNextOpponent(currentUserName, matches, tournament)

  // 赛制辅助
  const setsToWin = (tournament.config as any)?.sets_to_win || 2

  // 自动判断胜者
  function getWinnerForScore(p1: string, p2: string): 'player1' | 'player2' | null {
    const s1 = parseInt(p1); const s2 = parseInt(p2)
    if (isNaN(s1) || isNaN(s2)) return null
    if (s1 === setsToWin && s2 < setsToWin) return 'player1'
    if (s2 === setsToWin && s1 < setsToWin) return 'player2'
    return null
  }

  async function handleQuickSubmit(matchId: string, p1Name: string, p2Name: string, p1Val: string, p2Val: string) {
    const s1 = parseInt(p1Val); const s2 = parseInt(p2Val)
    if (isNaN(s1) || isNaN(s2)) { setScoreError('请填写双方局分'); return }

    const winner = getWinnerForScore(p1Val, p2Val)
    if (!winner) {
      if (s1 === s2) { setScoreError('局分不能相同'); return }
      setScoreError(`胜者必须赢得 ${setsToWin} 局`); return
    }

    const winnerName = winner === 'player1' ? p1Name : p2Name
    if (!confirm(`确认 ${winnerName} ${s1}:${s2} 获胜？`)) return

    const { data: current } = await supabase.from('matches').select('status').eq('id', matchId).single()
    if (current?.status === 'completed') { setScoreError('比赛已结束，请刷新'); return }

    const { error } = await supabase.from('matches').update({
      status: 'completed', winner_name: winnerName,
      player1_sets: s1, player2_sets: s2,
    }).eq('id', matchId).eq('status', 'in_progress')
    if (error) { setScoreError(error.message); return }

    // 结算 ELO 积分
    try {
      const { data: match } = await supabase.from('matches').select('player1_id, player2_id').eq('id', matchId).single()
      let p1Id = match?.player1_id
      let p2Id = match?.player2_id

      // 如果 match 上没有 player_id，从 tournament_players 按名称查找
      if (!p1Id || !p2Id) {
        const { data: players } = await supabase.from('tournament_players')
          .select('profile_id, player_name').eq('tournament_id', tournament.id)
        if (players) {
          const p1 = players.find(p => p.player_name === p1Name)
          const p2 = players.find(p => p.player_name === p2Name)
          if (!p1Id && p1?.profile_id) p1Id = p1.profile_id
          if (!p2Id && p2?.profile_id) p2Id = p2.profile_id
        }
      }

      if (p1Id && p2Id) {
        // Format-specific K factor
        const kFactor =
          tournament.format === 'fun_elo_handicap' ? 16 :
          tournament.format === 'fun_blind_doubles' ? 20 :
          tournament.format === 'fun_arena' ? 25 :
          32
        await settleMatchElo(supabase, matchId, p1Id, p2Id, winner as 'player1' | 'player2', kFactor)
      }
    } catch (eloErr: any) {
      console.warn('ELO settlement skipped:', eloErr?.message || eloErr)
    }

    setQuickMatchId(null); setScoreError('')
    setScoreMap(prev => { const n = { ...prev }; delete n[matchId]; return n })
    onUpdated()
  }

  if (myMatches.length === 0) return null

  return (
    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl shadow-sm overflow-hidden border-2 border-yellow-300">
      <div className="px-4 py-3 bg-yellow-100 border-b border-yellow-200 font-medium text-sm flex items-center gap-2">
        <span>🏓</span> 我的对阵 — <span className="text-yellow-800 font-bold">{currentUserName}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* 下一场对手 */}
        {nextOpponent && (
          <div className="bg-white rounded-lg p-3 border border-orange-200">
            <p className="text-xs text-orange-500 mb-1">⚔️ 下一场对手</p>
            <p className="text-lg font-bold text-orange-700">{nextOpponent}</p>
          </div>
        )}

        {/* 活跃比赛 — 选择比分 + 提交 */}
        {myActiveMatches.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">📋 待登记 ({myActiveMatches.length}场) — {tournament.config && `${setsToWin * 2 - 1}局${setsToWin}胜`}</p>
            <div className="space-y-3">
              {myActiveMatches.map(m => {
                const opponent = m.player1_name === currentUserName ? m.player2_name : m.player1_name
                const isOpen = quickMatchId === m.id
                const sel = scoreMap[m.id]
                return (
                  <div key={m.id} className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">vs {opponent}</p>
                      <StatusBadge status={m.status} />
                    </div>

                    {!isOpen ? (
                      <button onClick={() => setQuickMatchId(m.id)}
                        className="w-full py-2 bg-blue-50 text-blue-600 rounded text-sm font-bold hover:bg-blue-100">
                        + 登记结果
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {/* 双方局分输入 */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <p className="text-[10px] text-gray-400 text-center mb-1">{m.player1_name}</p>
                            <input type="number" min="0" max={setsToWin}
                              value={scoreMap[m.id]?.[0]?.toString() || ''}
                              onChange={e => setScoreMap(prev => ({ ...prev, [m.id]: [parseInt(e.target.value) || 0, prev[m.id]?.[1] || 0] }))}
                              placeholder="0"
                              className="w-full text-center text-xl font-extrabold py-2 border-2 border-gray-200 rounded-lg
                                focus:outline-none focus:border-blue-400 transition-all"
                              style={{ height: '44px' }}
                            />
                          </div>
                          <span className="text-lg font-bold text-gray-300 mt-4">:</span>
                          <div className="flex-1">
                            <p className="text-[10px] text-gray-400 text-center mb-1">{m.player2_name}</p>
                            <input type="number" min="0" max={setsToWin}
                              value={scoreMap[m.id]?.[1]?.toString() || ''}
                              onChange={e => setScoreMap(prev => ({ ...prev, [m.id]: [prev[m.id]?.[0] || 0, parseInt(e.target.value) || 0] }))}
                              placeholder="0"
                              className="w-full text-center text-xl font-extrabold py-2 border-2 border-gray-200 rounded-lg
                                focus:outline-none focus:border-blue-400 transition-all"
                              style={{ height: '44px' }}
                            />
                          </div>
                        </div>

                        {/* 判定结果 */}
                        {(() => {
                          const [sc1, sc2] = scoreMap[m.id] || [0, 0]
                          const autoW = getWinnerForScore(sc1.toString(), sc2.toString())
                          if (sc1 > 0 || sc2 > 0) {
                            if (autoW) {
                              const wName = autoW === 'player1' ? m.player1_name : m.player2_name
                              return (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                                  <p className="text-sm font-bold text-green-700">{wName} {sc1}:{sc2} 胜</p>
                                </div>
                              )
                            }
                            return (
                              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                                <p className="text-xs font-medium text-red-600">
                                  {sc1 === sc2 ? '局分不能相同' : `胜者须赢得 ${setsToWin} 局`}
                                </p>
                              </div>
                            )
                          }
                          return null
                        })()}

                        <div className="flex gap-2">
                          <button onClick={() => handleQuickSubmit(m.id, m.player1_name, m.player2_name,
                            (scoreMap[m.id]?.[0] || 0).toString(), (scoreMap[m.id]?.[1] || 0).toString())}
                            disabled={!getWinnerForScore((scoreMap[m.id]?.[0] || 0).toString(), (scoreMap[m.id]?.[1] || 0).toString())}
                            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
                            确认提交
                          </button>
                          <button onClick={() => { setQuickMatchId(null); setScoreMap(prev => { const n = { ...prev }; delete n[m.id]; return n }) }}
                            className="px-3 py-2 border rounded-lg text-sm text-gray-400">
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 已完成比赛 */}
        {myCompletedMatches.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">✅ 已完成 ({myCompletedMatches.length}场)</p>
            <div className="space-y-1">
              {myCompletedMatches.map(m => {
                const opponent = m.player1_name === currentUserName ? m.player2_name : m.player1_name
                const iWon = m.winner_name === currentUserName
                const scores = (m.player1_sets > 0 || m.player2_sets > 0) ? ` (${m.player1_sets}:${m.player2_sets})` : ''
                return (
                  <Link key={m.id} to={`/matches/${m.id}`}
                    className={`block p-2 rounded text-sm ${iWon ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    vs {opponent} — {iWon ? '🏆 胜' : '😞 负'}{scores}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {scoreError && <p className="text-red-500 text-xs">{scoreError}</p>}
      </div>
    </div>
  )
}

/** 预测下一场对手 */
function findNextOpponent(currentUserName: string, matches: Match[], tournament: Tournament): string | null {
  // 淘汰赛逻辑
  if (tournament.format === 'knockout' || tournament.format === 'group_knockout') {
    // 找当前用户完成的比赛
    const myCompleted = matches.filter(m =>
      (m.player1_name === currentUserName || m.player2_name === currentUserName) &&
      m.status === 'completed' && m.winner_name === currentUserName
    )
    if (myCompleted.length === 0) return null

    // 找最近的比赛
    const lastMatch = myCompleted.sort((a, b) => (b.round || 0) - (a.round || 0))[0]
    if (!lastMatch || !lastMatch.round || !lastMatch.bracket_pos) return null

    // 找同一轮相邻位置的另一场比赛的胜者
    const sameRound = matches.filter(m => m.round === lastMatch.round && m.id !== lastMatch.id)
    // 找到配对位置的比赛（bracket_pos 配对：0-1, 2-3, 4-5...）
    const pairedPos = lastMatch.bracket_pos % 2 === 0 ? lastMatch.bracket_pos + 1 : lastMatch.bracket_pos - 1
    const pairedMatch = sameRound.find(m => m.bracket_pos === pairedPos)

    if (pairedMatch && pairedMatch.status === 'completed' && pairedMatch.winner_name) {
      return pairedMatch.winner_name
    }
    if (pairedMatch && pairedMatch.status !== 'completed') {
      // 对手还未决出
      const p1 = pairedMatch.player1_name === '(轮空)' ? null : pairedMatch.player1_name
      const p2 = pairedMatch.player2_name === '(轮空)' ? null : pairedMatch.player2_name
      if (p1 && p2) return `${p1} 或 ${p2}`
      if (p1) return p1
      if (p2) return p2
    }
  }

  // 循环赛：列出还没打的对手
  if (tournament.format === 'round_robin') {
    const myMatches = matches.filter(m =>
      m.player1_name === currentUserName || m.player2_name === currentUserName
    )
    const played = new Set<string>()
    myMatches.forEach(m => {
      played.add(m.player1_name); played.add(m.player2_name)
    })
    const allPlayers = new Set<string>()
    matches.forEach(m => {
      allPlayers.add(m.player1_name); allPlayers.add(m.player2_name)
    })
    const remaining = [...allPlayers].filter(p => p !== currentUserName && !played.has(p) && p !== '(轮空)')
    if (remaining.length > 0) {
      return remaining[0] + (remaining.length > 1 ? ` 等${remaining.length}人` : '')
    }
  }

  return null
}

function AdvanceRoundButton({ tournamentId, matches, tournament, players, onUpdated }: {
  tournamentId: string; matches: Match[]; tournament: Tournament; players: EnginePlayer[]; onUpdated: () => void
}) {
  const engine = getEngine(tournament.format)
  const canAdvance = engine.canProceed?.({ matches: matches as any, config: tournament.config as any, players } as any)

  if (!canAdvance) return null

  const isArena = tournament.format === 'fun_arena'

  const handleAdvance = async () => {
    // Sort matches by bracket_pos before passing to engine (critical for correct pairing)
    const sortedMatches = [...matches].sort((a, b) => (a.bracket_pos || 0) - (b.bracket_pos || 0))
    const nextMatches = engine.getNextRound?.({
      matches: sortedMatches as any, config: tournament.config as any, players
    } as any)
    if (!nextMatches || nextMatches.length === 0) return

    // Arena: update champion and streak before inserting next match
    if (isArena) {
      const lastCompleted = matches.filter(m => m.status === 'completed').slice(-1)[0]
      if (lastCompleted) {
        const currentChampion = (tournament.config as any).arena_champion_name
        const newChampion = lastCompleted.winner_name
        const streak = newChampion === currentChampion ? ((tournament.config as any).arena_streak || 0) + 1 : 0
        await supabase.from('tournaments').update({
          config: { ...tournament.config as any, arena_champion_name: newChampion, arena_streak: streak }
        }).eq('id', tournamentId)
      }
    }

    const inserts = nextMatches.map(m => ({
      tournament_id: tournamentId,
      title: `${m.player1_name} vs ${m.player2_name}`,
      player1_name: m.player1_name,
      player2_name: m.player2_name,
      round: m.round || undefined,
      bracket_pos: m.bracket_pos || undefined,
      status: 'scheduled' as const,
    }))

    const { error } = await supabase.from('matches').insert(inserts)
    if (!error) onUpdated()
  }

  return (
    <button onClick={handleAdvance}
      className={`w-full py-3 text-white rounded-xl font-medium ${isArena ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'}`}>
      {isArena ? '生成下一场挑战赛' : '进入下一轮'}
    </button>
  )
}

function groupMatches(matches: Match[]): Record<string, Match[]> {
  const groups: Record<string, Match[]> = {}
  for (const m of matches) {
    const key = m.group_name || 'default'
    if (!groups[key]) groups[key] = []
    groups[key].push(m)
  }
  return groups
}

function ArenaView({ matches, config, players }: {
  matches: Match[];
  config: any;
  players: { id: string; name: string; seed: number; group_name?: string }[];
}) {
  const challengeOrder: { challenger_name: string; order: number }[] = config?.challenge_order || [];
  const champion = config?.arena_champion_name || players[0]?.name || '未知';
  const completedCount = matches.filter(m => m.status === 'completed').length;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
      <h3 className="font-medium">👑 擂台挑战赛</h3>
      <div className="bg-purple-50 rounded-lg p-3 text-center">
        <p className="text-xs text-purple-500">当前擂主</p>
        <p className="text-lg font-bold text-purple-800">{champion}</p>
        <p className="text-xs text-purple-600">
          连胜 {config?.arena_streak || 0} 场 | 挑战进度 {completedCount}/{challengeOrder.length}
        </p>
      </div>
      {challengeOrder.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">挑战顺序：</p>
          {challengeOrder.map((c, i) => {
            const match = matches[i];
            const isCompleted = match?.status === 'completed';
            const isCurrent = !isCompleted && i === completedCount;
            return (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                isCompleted ? 'bg-gray-50' : isCurrent ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 opacity-50'
              }`}>
                <span>
                  <span className="text-gray-400 mr-2">#{c.order}</span>
                  {c.challenger_name}
                </span>
                {isCompleted && (
                  <span className={match.winner_name === c.challenger_name ? 'text-green-600 font-medium' : 'text-red-400'}>
                    {match.winner_name === c.challenger_name ? '挑战成功🏆' : '挑战失败'}
                  </span>
                )}
                {isCurrent && (
                  <span className="text-yellow-600 text-xs">即将上场</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
