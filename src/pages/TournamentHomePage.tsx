import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { listEngines } from '../lib/tournament'
import type { Tournament } from '../types'

interface TournamentWithCount extends Tournament {
  player_count: number
  joined: boolean
}

type TabType = 'menu' | 'my' | 'all'

export function TournamentHomePage() {
  const { user: profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabType>('menu')
  const [myTournaments, setMyTournaments] = useState<(Tournament & { player_count: number })[]>([])
  const [ongoingTournaments, setOngoingTournaments] = useState<TournamentWithCount[]>([])
  const [historyTournaments, setHistoryTournaments] = useState<TournamentWithCount[]>([])
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)
  const [showOngoing, setShowOngoing] = useState(true)
  const [showDraft, setShowDraft] = useState(true)
  const [showEnded, setShowEnded] = useState(true)
  const [showAllRunning, setShowAllRunning] = useState(true)
  const [showAllDraft, setShowAllDraft] = useState(true)
  const [showAllHistory, setShowAllHistory] = useState(true)
  const engineNames: Record<string, string> = Object.fromEntries(
    listEngines().map(e => [e.type, e.name])
  )

  useEffect(() => {
    if (profile && tab === 'my') loadMyTournaments()
    if (tab === 'all') loadAllTournaments()
  }, [profile, tab])

  async function loadMyTournaments() {
    if (!profile) return
    setLoading(true)
    const { data: myPlayers } = await supabase
      .from('tournament_players')
      .select('tournament_id')
      .eq('player_name', profile.nickname)

    const ids = [...new Set((myPlayers || []).map(p => p.tournament_id))]
    if (ids.length === 0) {
      setMyTournaments([])
      setLoading(false)
      return
    }

    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: false })

    const items = await Promise.all((tournaments || []).map(async (t) => {
      const { count: pc } = await supabase
        .from('tournament_players').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id)
      return { ...t, player_count: pc || 0 }
    }))

    setMyTournaments(items)
    setLoading(false)
  }

  async function loadAllTournaments() {
    setLoading(true)
    const { data } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) {
      const withCounts = await Promise.all((data as Tournament[]).map(async (t) => {
        const { count: pc } = await supabase
          .from('tournament_players').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id)
        let joined = false
        if (profile) {
          const { data: existing } = await supabase
            .from('tournament_players').select('id').eq('tournament_id', t.id).eq('player_name', profile.nickname).maybeSingle()
          joined = !!existing
        }
        return { ...t, player_count: pc || 0, joined }
      }))

      setOngoingTournaments(withCounts.filter(t => t.status === 'in_progress' || t.status === 'draft'))
      setHistoryTournaments(withCounts.filter(t => t.status === 'completed' || t.status === 'cancelled'))
    }
    setLoading(false)
  }

  async function joinTournament(tournamentId: string) {
    if (!profile) return
    setJoining(tournamentId)
    const t = ongoingTournaments.find(o => o.id === tournamentId)
    if (!t) { setJoining(null); return }
    if (t.status === 'in_progress') {
      alert('该赛事已开始，无法报名')
      setJoining(null)
      return
    }
    if (t.max_players && t.player_count >= t.max_players) {
      alert('该赛事已满员')
      setJoining(null)
      return
    }
    const { error } = await supabase.from('tournament_players').insert({
      tournament_id: tournamentId,
      player_name: profile.nickname,
    })
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        alert('你已经报名了该赛事')
      } else {
        alert('报名失败: ' + error.message)
      }
    } else {
      setOngoingTournaments(prev => prev.map(o =>
        o.id === tournamentId ? { ...o, player_count: o.player_count + 1, joined: true } : o
      ))
    }
    setJoining(null)
  }

  function canCancel(t: TournamentWithCount | (Tournament & { player_count: number })): { ok: boolean; reason?: string } {
    if (t.status === 'in_progress') return { ok: false, reason: '比赛已开始，无法取消' }
    if (!t.start_time) return { ok: true }
    const now = new Date()
    const start = new Date(t.start_time)
    const diffMs = start.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours < 3) return { ok: false, reason: '距开赛不足3小时，无法取消' }
    return { ok: true }
  }

  function showCancelButton(t: TournamentWithCount | (Tournament & { player_count: number })): boolean {
    if (t.status === 'in_progress') return false
    return canCancel(t).ok
  }

  async function cancelRegistration(tournamentId: string) {
    if (!profile) return
    const t = [...ongoingTournaments, ...historyTournaments].find(o => o.id === tournamentId)
    // 所有有 start_time 且距开赛不足 3 小时的比赛都不可取消
    if (t) {
      const cancelCheck = canCancel(t)
      if (!cancelCheck.ok) {
        alert(cancelCheck.reason)
        return
      }
    }
    if (!window.confirm('确定取消报名吗？')) return
    setJoining(tournamentId)
    const { error } = await supabase
      .from('tournament_players')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('player_name', profile.nickname)
    if (error) {
      alert('取消失败: ' + error.message)
    } else {
      setOngoingTournaments(prev => prev.map(o =>
        o.id === tournamentId ? { ...o, player_count: Math.max(0, o.player_count - 1), joined: false } : o
      ))
      loadMyTournaments()
      loadAllTournaments()
    }
    setJoining(null)
  }

  function renderOngoingCard(t: TournamentWithCount) {
    return (
      <div key={t.id}
        className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition border-l-4"
        style={{ borderLeftColor: '#22c55e' }}>
        <div className="flex items-start justify-between">
          <Link to={`/tournaments/${t.id}`} className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{t.name}</h3>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {engineNames[t.format] || t.format}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">🔥 进行</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {t.player_count}{t.max_players ? `/${t.max_players}` : ''}人 · {new Date(t.created_at).toLocaleDateString('zh-CN')}
            </p>
          </Link>
          <div className="ml-3 shrink-0 flex flex-col items-center justify-center">
            {t.joined ? (
              <div className="flex flex-col items-center gap-1">
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium whitespace-nowrap">
                  ✓ 已报名
                </span>
                {showCancelButton(t) && (
                  <button onClick={(e) => { e.preventDefault(); cancelRegistration(t.id) }}
                    disabled={joining === t.id}
                    className="text-xs text-red-500 hover:text-red-700 underline">
                    {joining === t.id ? '...' : '取消报名'}
                  </button>
                )}
                {!showCancelButton(t) && t.status !== 'in_progress' && t.start_time && (
                  <span className="text-[10px] text-gray-400 text-center leading-tight mt-1">
                    距开赛不足3h<br />无法取消
                  </span>
                )}
              </div>
            ) : (
              <span className="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-lg text-xs font-medium">已开始</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderDraftCard(t: TournamentWithCount) {
    const isFull = t.max_players && t.player_count >= t.max_players
    return (
      <div key={t.id}
        className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition border-l-4"
        style={{ borderLeftColor: '#eab308' }}>
        <div className="flex items-start justify-between">
          <Link to={`/tournaments/${t.id}`} className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{t.name}</h3>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {engineNames[t.format] || t.format}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">📝 筹备</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {t.player_count}{t.max_players ? `/${t.max_players}` : ''}人 · {new Date(t.created_at).toLocaleDateString('zh-CN')}
            </p>
          </Link>
          <div className="ml-3 shrink-0 flex flex-col items-center justify-center">
            {t.joined ? (
              <div className="flex flex-col items-center gap-1">
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium whitespace-nowrap">
                  ✓ 已报名
                </span>
                {showCancelButton(t) && (
                <button onClick={(e) => { e.preventDefault(); cancelRegistration(t.id) }}
                  disabled={joining === t.id}
                  className="text-xs text-red-500 hover:text-red-700 underline">
                  {joining === t.id ? '...' : '取消报名'}
                </button>
              )}
              {!showCancelButton(t) && t.start_time && (
                <span className="text-[10px] text-gray-400 text-center leading-tight mt-1">
                  距开赛不足3h<br />无法取消
                </span>
              )}
            </div>
          ) : isFull ? (
              <span className="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-lg text-xs font-medium">已满员</span>
            ) : (
              <button onClick={(e) => { e.preventDefault(); joinTournament(t.id) }}
                disabled={joining === t.id}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition disabled:opacity-50">
                {joining === t.id ? '...' : '报名参加'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold">🏆 赛事中心</h1>

      {tab === 'menu' && (
        <div className="space-y-4">
          <Link to="/tournaments/new"
            className="block bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl p-5 hover:from-blue-600 hover:to-indigo-700 transition shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-3xl">+</span>
              <div>
                <p className="font-bold text-lg">创建赛事</p>
                <p className="text-sm text-blue-100">循环赛 / 淘汰赛 / 混合赛</p>
              </div>
            </div>
          </Link>
          <button onClick={() => setTab('my')}
            className="w-full text-left bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition border border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📋</span>
              <div>
                <p className="font-bold text-lg">我的赛事</p>
                <p className="text-sm text-gray-500">查看我参加的赛事</p>
              </div>
            </div>
          </button>
          <button onClick={() => setTab('all')}
            className="w-full text-left bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition border border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏟️</span>
              <div>
                <p className="font-bold text-lg">全部赛事</p>
                <p className="text-sm text-gray-500">浏览所有可报名和已结束的赛事</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {tab === 'my' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">📋 我的赛事</h2>
            <button onClick={() => setTab('menu')} className="text-sm text-blue-600">返回菜单</button>
          </div>
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">加载中...</p>
          ) : myTournaments.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl shadow-sm">
              <div className="text-4xl mb-3">🏓</div>
              <p className="text-gray-500 text-sm">暂无参与赛事</p>
              <p className="text-gray-400 text-xs mt-1">快去创建或报名参加赛事吧！</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myTournaments.filter(t => t.status === 'in_progress').length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1">🔥 进行中</p>
                    <button onClick={() => setShowOngoing(!showOngoing)}
                      className="text-xs text-gray-400 hover:text-gray-600 transition">
                      {showOngoing ? '▲ 收起' : '▼ 展开'}
                    </button>
                  </div>
                  {showOngoing && myTournaments.filter(t => t.status === 'in_progress').map(t => (
                    <TournamentCard key={t.id} t={t} engineNames={engineNames} />
                  ))}
                </>
              )}

              {myTournaments.filter(t => t.status === 'draft').length > 0 && (
                <>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1">📝 未举办</p>
                    <button onClick={() => setShowDraft(!showDraft)}
                      className="text-xs text-gray-400 hover:text-gray-600 transition">
                      {showDraft ? '▲ 收起' : '▼ 展开'}
                    </button>
                  </div>
                  {showDraft && myTournaments.filter(t => t.status === 'draft').map(t => (
                    <div key={t.id}
                      className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition border-l-4"
                      style={{ borderLeftColor: '#eab308' }}>
                      <div className="flex items-start justify-between">
                        <Link to={`/tournaments/${t.id}`} className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">{t.name}</h3>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {engineNames[t.format] || t.format}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">📝 筹备</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            {t.player_count || '?'}人 · {new Date(t.created_at).toLocaleDateString('zh-CN')}
                          </p>
                        </Link>
                        <div className="ml-3 shrink-0">
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium whitespace-nowrap">
                            ✓ 已报名
                          </span>
                          {showCancelButton(t) ? (
                            <button onClick={(e) => { e.preventDefault(); cancelRegistration(t.id) }}
                              className="block mt-1 text-xs text-red-500 hover:text-red-700 underline mx-auto">
                              取消报名
                            </button>
                          ) : t.start_time && (
                            <span className="block mt-1 text-[10px] text-gray-400 text-center leading-tight">
                              距开赛不足3h<br />无法取消
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {myTournaments.filter(t => t.status === 'completed' || t.status === 'cancelled').length > 0 && (
                <>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1">✅ 已结束</p>
                    <button onClick={() => setShowEnded(!showEnded)}
                      className="text-xs text-gray-400 hover:text-gray-600 transition">
                      {showEnded ? '▲ 收起' : '▼ 展开'}
                    </button>
                  </div>
                  {showEnded && myTournaments.filter(t => t.status === 'completed' || t.status === 'cancelled').map(t => (
                    <TournamentCard key={t.id} t={t} engineNames={engineNames} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'all' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">🏟️ 全部赛事</h2>
            <button onClick={() => setTab('menu')} className="text-sm text-blue-600">返回菜单</button>
          </div>

          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">加载中...</p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-700">🔥 进行中</h3>
                  <button onClick={() => setShowAllRunning(!showAllRunning)}
                    className="text-xs text-gray-400 hover:text-gray-600 transition">
                    {showAllRunning ? '▲ 收起' : '▼ 展开'}
                  </button>
                </div>
                {showAllRunning && (() => {
                  const filtered = ongoingTournaments.filter(t => t.status === 'in_progress')
                  if (filtered.length === 0) return <p className="text-gray-400 text-xs text-center py-4 bg-white rounded-xl">暂无进行中的赛事</p>
                  const sorted = [...filtered].sort((a, b) => (a.joined === b.joined) ? 0 : a.joined ? -1 : 1)
                  return <div className="space-y-2">{sorted.map(t => renderOngoingCard(t))}</div>
                })()}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-700">📝 正在筹备</h3>
                  <button onClick={() => setShowAllDraft(!showAllDraft)}
                    className="text-xs text-gray-400 hover:text-gray-600 transition">
                    {showAllDraft ? '▲ 收起' : '▼ 展开'}
                  </button>
                </div>
                {showAllDraft && (() => {
                  const filtered = ongoingTournaments.filter(t => t.status === 'draft')
                  if (filtered.length === 0) return <p className="text-gray-400 text-xs text-center py-4 bg-white rounded-xl">暂无筹备中的赛事</p>
                  const sorted = [...filtered].sort((a, b) => {
                    const aScore = a.joined ? 0 : (a.max_players && a.player_count >= a.max_players) ? 2 : 1
                    const bScore = b.joined ? 0 : (b.max_players && b.player_count >= b.max_players) ? 2 : 1
                    return aScore - bScore
                  })
                  return <div className="space-y-2">{sorted.map(t => renderDraftCard(t))}</div>
                })()}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-700">📜 历史赛事</h3>
                  <button onClick={() => setShowAllHistory(!showAllHistory)}
                    className="text-xs text-gray-400 hover:text-gray-600 transition">
                    {showAllHistory ? '▲ 收起' : '▼ 展开'}
                  </button>
                </div>
                {showAllHistory && (historyTournaments.length === 0 ? (
                  <p className="text-gray-400 text-xs text-center py-4 bg-white rounded-xl">暂无历史赛事</p>
                ) : (
                  <div className="space-y-2">
                    {historyTournaments.map(t => (
                      <TournamentCard key={t.id} t={t} engineNames={engineNames} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TournamentCard({ t, engineNames }: { t: any, engineNames: Record<string, string> }) {
  const sc = t.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
    t.status === 'in_progress' ? 'bg-green-100 text-green-700' :
    t.status === 'completed' ? 'bg-blue-100 text-blue-700' :
    'bg-gray-100 text-gray-500'
  const sl = t.status === 'draft' ? '📝 筹备' :
    t.status === 'in_progress' ? '🔥 进行' :
    t.status === 'completed' ? '✅ 结束' : '❌ 取消'

  return (
    <Link to={`/tournaments/${t.id}`}
      className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition border-l-4"
      style={{
        borderLeftColor: t.status === 'in_progress' ? '#22c55e' :
          t.status === 'completed' ? '#3b82f6' :
          t.status === 'draft' ? '#eab308' : '#9ca3af'
      }}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{t.name}</h3>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {engineNames[t.format] || t.format}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${sc}`}>{sl}</span>
          </div>
        </div>
        <div className="text-right text-xs text-gray-400 ml-3 shrink-0">
          <p>{t.player_count || '?'}人参赛</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {new Date(t.created_at).toLocaleDateString('zh-CN')}
      </p>
    </Link>
  )
}
