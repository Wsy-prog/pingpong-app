import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getEngine } from '../lib/tournament'
import type { Tournament, Match } from '../types'
import type { Player as EnginePlayer } from '../lib/tournament'

export function TournamentDetailPage() {
  const { id } = useParams()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [players, setPlayers] = useState<EnginePlayer[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* 赛事信息 */}
      <div>
        <Link to="/history" className="text-sm text-blue-600">&larr; 赛事列表</Link>
        <h1 className="text-xl font-bold mt-1">{tournament.name}</h1>
        <div className="flex gap-2 mt-1">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            tournament.status === 'completed' ? 'bg-green-100 text-green-700' :
            tournament.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {tournament.status === 'draft' && '未开始'}
            {tournament.status === 'in_progress' && '进行中'}
            {tournament.status === 'completed' && '已结束'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            {engine?.name || tournament.format}
          </span>
        </div>
        {tournament.description && <p className="text-sm text-gray-500 mt-2">{tournament.description}</p>}
      </div>

      {/* 选手列表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">参赛选手 ({players.length})</div>
        {players.length === 0 ? (
          <p className="text-center text-gray-400 py-4 text-sm">暂无选手</p>
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

      {/* 循环赛积分表 */}
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
                {groupName === 'default' ? '积分表' : groupName}
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
                      {standings.map((s, i) => (
                        <tr key={s.player_name} className={i === 0 ? 'bg-yellow-50' : ''}>
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{s.player_name}</td>
                          <td className="px-3 py-2 text-center text-green-600">{s.wins}</td>
                          <td className="px-3 py-2 text-center text-red-500">{s.losses}</td>
                          <td className="px-3 py-2 text-center font-bold">{s.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* 淘汰赛对阵图 */}
      {tournament.format === 'knockout' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">对阵图</div>
          {renderBracketView(matches)}
        </div>
      )}

      {/* 混合赛 - 小组赛+淘汰赛 */}
      {tournament.format === 'group_knockout' && (
        <KnockoutSection matches={matches} tournament={tournament} />
      )}

      {/* 比赛列表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">所有比赛</div>
        {matches.length === 0 && tournament.status === 'draft' ? (
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm mb-3">还未配置选手和赛程</p>
            <Link to={`/tournaments/${id}/setup`}
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
              去配置选手
            </Link>
          </div>
        ) : matches.length === 0 ? (
          <p className="text-center text-gray-400 py-4 text-sm">暂无比赛</p>
        ) : (
          <div className="divide-y">
            {matches.map(m => {
              const isBye = m.player1_name === '(轮空)' || m.player2_name === '(轮空)'
              return (
                <Link key={m.id} to={`/matches/${m.id}`}
                  className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition ${isBye ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{m.player1_name} vs {m.player2_name}</p>
                    <div className="flex gap-2 mt-0.5">
                      {m.round && <span className="text-xs text-gray-400">第{m.round}轮</span>}
                      {m.group_name && <span className="text-xs text-gray-400">{m.group_name}</span>}
                      {m.winner_name && <span className="text-xs text-green-600">胜: {m.winner_name}</span>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    m.status === 'completed' ? 'bg-green-100 text-green-700' :
                    m.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {m.status === 'completed' ? '已结束' : m.status === 'in_progress' ? '进行中' : '未开始'}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      {tournament.status === 'draft' && (
        <Link to={`/tournaments/${id}/setup`}
          className="block w-full text-center py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700">
          配置选手
        </Link>
      )}

      {tournament.status === 'in_progress' && tournament.format === 'knockout' && (
        <AdvanceRoundButton tournamentId={id!} matches={matches} tournament={tournament} onUpdated={loadTournament} />
      )}

      {tournament.status === 'in_progress' && tournament.format === 'group_knockout' && (
        <AdvanceRoundButton tournamentId={id!} matches={matches} tournament={tournament} onUpdated={loadTournament} />
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
    </div>
  )
}

function KnockoutSection({ matches, tournament }: { matches: Match[]; tournament: Tournament }) {
  const koMatches = matches.filter(m => m.round && m.round >= 100)
  if (koMatches.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">淘汰赛阶段</div>
      {renderBracketView(koMatches)}
    </div>
  )
}

function renderBracketView(matches: Match[]) {
  const rounds = [...new Set(matches.filter(m => m.round).map(m => m.round!))].sort((a, b) => a - b)
  if (rounds.length === 0) return <p className="text-center text-gray-400 py-4 text-sm">待生成</p>

  return (
    <div className="p-4 overflow-x-auto">
      <div className="flex gap-8" style={{ minWidth: rounds.length * 200 }}>
        {rounds.map(round => {
          const roundMatches = matches.filter(m => m.round === round)
          return (
            <div key={round} className="flex flex-col gap-4">
              <p className="text-xs text-gray-400 text-center mb-2">第{round - (round >= 100 ? 100 : 0)}轮</p>
              {roundMatches.map((m, i) => (
                <Link key={m.id} to={`/matches/${m.id}`}
                  className="block w-44 p-3 border rounded-lg text-sm hover:border-blue-300 transition"
                  style={{ marginTop: i > 0 ? `${Math.pow(2, round - 1) * 8 - 8}px` : '0' }}>
                  <div className={`py-1 ${m.winner_name === m.player1_name ? 'font-bold text-green-700' : m.winner_name ? 'text-gray-400' : ''}`}>
                    {m.player1_name}
                  </div>
                  <div className="border-t my-1" />
                  <div className={`py-1 ${m.winner_name === m.player2_name ? 'font-bold text-green-700' : m.winner_name ? 'text-gray-400' : ''}`}>
                    {m.player2_name}
                  </div>
                  {m.status === 'completed' && (
                    <div className="text-xs text-green-600 mt-1 text-center">✓ {m.winner_name}</div>
                  )}
                </Link>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AdvanceRoundButton({ tournamentId, matches, tournament, onUpdated }: {
  tournamentId: string; matches: Match[]; tournament: Tournament; onUpdated: () => void
}) {
  const engine = getEngine(tournament.format)
  const canAdvance = engine.canProceed?.({ matches: matches as any, config: tournament.config as any })

  if (!canAdvance) return null

  const handleAdvance = async () => {
    const nextMatches = engine.getNextRound?.({
      matches: matches as any, config: tournament.config as any, players: []
    })
    if (!nextMatches || nextMatches.length === 0) return

    const inserts = nextMatches.map(m => ({
      tournament_id: tournamentId,
      title: `${m.player1_name} vs ${m.player2_name}`,
      player1_name: m.player1_name,
      player2_name: m.player2_name,
      round: m.round || undefined,
      bracket_pos: m.bracket_pos || undefined,
      status: 'scheduled' as const,
      created_by: matches[0]?.created_by || '',
    }))

    const { error } = await supabase.from('matches').insert(inserts)
    if (!error) onUpdated()
  }

  return (
    <button onClick={handleAdvance}
      className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">
      进入下一轮
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
