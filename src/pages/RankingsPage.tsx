import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface RankedProfile {
  id: string
  nickname: string
  elo_score: number
  match_count: number
  win_count: number
}

export function RankingsPage() {
  const [rankings, setRankings] = useState<RankedProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 50

  useEffect(() => { loadRankings() }, [page])

  async function loadRankings() {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, elo_score')
      .order('elo_score', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (!profiles) { setLoading(false); return }

    // 获取每个人的比赛统计
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

  const getMedal = (rank: number) => {
    if (rank === 0) return '🥇'
    if (rank === 1) return '🥈'
    if (rank === 2) return '🥉'
    return null
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">📊 实时排名</h1>

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
    </div>
  )
}
