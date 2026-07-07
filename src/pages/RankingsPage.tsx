import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { HealthWeeklyScore } from '../types'

interface RankedProfile {
  id: string
  nickname: string
  elo_score: number
  match_count: number
  win_count: number
}

interface HealthRankItem {
  profile_id: string
  nickname: string
  score: number
  week_start: string
  week_end: string
  days_count: number
  total_minutes: number
  max_streak: number
}

export function RankingsPage() {
  const [tab, setTab] = useState<'elo' | 'health'>('elo')

  // ELO 排名
  const [rankings, setRankings] = useState<RankedProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 50

  // 健康排名
  const [healthRankings, setHealthRankings] = useState<HealthRankItem[]>([])
  const [healthLoading, setHealthLoading] = useState(false)

  useEffect(() => { if (tab === 'elo') loadRankings() }, [page, tab])
  useEffect(() => { setPage(0); setRankings([]); setHasMore(true) }, [tab])

  useEffect(() => {
    if (tab === 'health' && healthRankings.length === 0) loadHealthRankings()
  }, [tab])

  async function loadRankings() {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, elo_score')
      .order('elo_score', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (!profiles) { setLoading(false); return }

    const ranked: RankedProfile[] = await Promise.all(
      profiles.map(async (p) => {
        const { count: matchCount } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .or(`player1_id.eq.${p.id},player2_id.eq.${p.id}`)
          .eq('status', 'completed')

        const { count: winCount } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .or(`and(player1_id.eq.${p.id},winner_name.eq.${p.nickname}),and(player2_id.eq.${p.id},winner_name.eq.${p.nickname})`)

        return {
          id: p.id,
          nickname: p.nickname,
          elo_score: p.elo_score,
          match_count: matchCount || 0,
          win_count: winCount || 0,
        }
      })
    )

    if (page === 0) setRankings(ranked)
    else setRankings(prev => [...prev, ...ranked])

    if (profiles.length < PAGE_SIZE) setHasMore(false)
    setLoading(false)
  }

  async function loadHealthRankings() {
    setHealthLoading(true)

    // 查所有用户的健康评分，每人取最新一条
    const { data: all } = await supabase
      .from('health_weekly_scores')
      .select('*')
      .order('week_start', { ascending: false })

    if (!all || all.length === 0) { setHealthLoading(false); return }

    // 获取用户昵称
    const { data: profiles } = await supabase.from('profiles').select('id, nickname')
    const profilesMap = new Map<string, string>()
    profiles?.forEach((p: any) => profilesMap.set(p.id, p.nickname))

    // 每人取最新一条
    const latest = new Map<string, HealthRankItem>()
    for (const row of all as any[]) {
      if (!latest.has(row.profile_id)) {
        latest.set(row.profile_id, {
          profile_id: row.profile_id,
          nickname: profilesMap.get(row.profile_id) || row.profile_id.slice(0, 6),
          score: row.score,
          week_start: row.week_start,
          week_end: row.week_end,
          days_count: row.days_count,
          total_minutes: row.total_minutes,
          max_streak: row.max_streak,
        })
      }
    }

    const sorted = Array.from(latest.values()).sort((a, b) => b.score - a.score)
    setHealthRankings(sorted)
    setHealthLoading(false)
  }

  const getMedal = (rank: number) => {
    if (rank === 0) return '🥇'
    if (rank === 1) return '🥈'
    if (rank === 2) return '🥉'
    return null
  }

  const scoreLevel = (s: number) => {
    if (s >= 90) return { label: '🏆', color: 'text-green-600' }
    if (s >= 75) return { label: '👍', color: 'text-blue-600' }
    if (s >= 60) return { label: '📊', color: 'text-yellow-600' }
    return { label: '💪', color: 'text-red-500' }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">📊 排名</h1>

      {/* Tab 切换 */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('elo')}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium transition ' +
            (tab === 'elo' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          🏓 ELO 排名
        </button>
        <button onClick={() => setTab('health')}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium transition ' +
            (tab === 'health' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          💪 健康排名
        </button>
      </div>

      {tab === 'elo' && (
        <>
          {loading && rankings.length === 0 ? (
            <p className="text-center text-gray-400 py-10">加载中...</p>
          ) : rankings.length === 0 ? (
            <p className="text-center text-gray-400 py-10">暂无用户</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="divide-y">
                {rankings.map((p, i) => {
                  const rank = page * PAGE_SIZE + i + 1
                  const medal = getMedal(rank - 1)
                  const winRate = p.match_count > 0 ? Math.round(p.win_count / p.match_count * 100) : 0
                  return (
                    <Link key={p.id} to={`/profile/${p.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                      <div className="w-8 text-center">
                        {medal ? (
                          <span className="text-lg">{medal}</span>
                        ) : (
                          <span className="text-sm text-gray-400">#{rank}</span>
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {p.nickname[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.nickname}</p>
                        <p className="text-xs text-gray-400">
                          {p.match_count}场 · {p.win_count}胜 · {winRate}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-600">{p.elo_score}</p>
                        <p className="text-xs text-gray-400">积分</p>
                      </div>
                    </Link>
                  )
                })}
              </div>

              {hasMore && (
                <button onClick={() => setPage(p => p + 1)}
                  className="w-full py-3 text-sm text-blue-600 hover:bg-gray-50 font-medium">
                  加载更多
                </button>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'health' && (
        <>
          {healthLoading ? (
            <p className="text-center text-gray-400 py-10">加载中...</p>
          ) : healthRankings.length === 0 ? (
            <p className="text-center text-gray-400 py-10">暂无健康数据，快去打卡吧！</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="divide-y">
                {healthRankings.map((item, i) => {
                  const medal = getMedal(i)
                  const level = scoreLevel(item.score)
                  return (
                    <Link key={item.profile_id} to={`/profile/${item.profile_id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                      <div className="w-8 text-center">
                        {medal ? (
                          <span className="text-lg">{medal}</span>
                        ) : (
                          <span className="text-sm text-gray-400">#{i + 1}</span>
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {item.nickname[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.nickname}</p>
                        <p className="text-xs text-gray-400">
                          运动 {item.days_count} 天 · 共 {item.total_minutes} 分钟
                          {item.max_streak >= 2 && ` · 连${item.max_streak}天`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${level.color}`}>{item.score}</p>
                        <p className="text-xs text-gray-400">{level.label}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-300 text-center py-2">基于最新一周健康评估数据</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
