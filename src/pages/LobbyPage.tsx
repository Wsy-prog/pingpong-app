import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Match } from '../types'

const features = [
  { title: '自由约球', path: '/matchmaking', icon: '🏓', color: 'bg-green-100 text-green-600' },
  { title: '创建比赛', path: '/matches/new', icon: '⚔️', color: 'bg-orange-100 text-orange-600' },
  { title: '创建赛事', path: '/tournaments/new', icon: '🏆', color: 'bg-yellow-100 text-yellow-600' },
  { title: '实时排名', path: '/rankings', icon: '📊', color: 'bg-blue-100 text-blue-600' },
  { title: '聊天大厅', path: '/chat', icon: '💬', color: 'bg-indigo-100 text-indigo-600' },
]

export function LobbyPage() {
  const { profile } = useAuth()
  const [recentMatches, setRecentMatches] = useState<Match[]>([])
  const [loadingMatches, setLoadingMatches] = useState(true)
  const [myRank, setMyRank] = useState<number | null>(null)

  useEffect(() => {
    loadRecentMatches()
    if (profile) loadMyRank()
  }, [profile])

  async function loadMyRank() {
    if (!profile) return
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gt('elo_score', profile.elo_score)
    setMyRank((count || 0) + 1)
  }

  async function loadRecentMatches() {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setRecentMatches(data)
    setLoadingMatches(false)
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700'
      case 'in_progress': return 'bg-yellow-100 text-yellow-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }
  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed': return '已结束'
      case 'in_progress': return '进行中'
      default: return '已创建'
    }
  }

  return (
    <div className="space-y-6">
      {/* 快速概览 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-bold mb-1">
          欢迎回来，{profile?.nickname || '球友'}！
        </h1>
        <div className="flex gap-6 mt-4 text-sm">
          <div>
            <span className="text-gray-400">积分</span>
            <p className="text-lg font-bold">{profile?.elo_score ?? 1500}</p>
          </div>
          <div>
            <span className="text-gray-400">排名</span>
            <p className="text-lg font-bold">#{myRank || '—'}</p>
          </div>
          <div>
            <span className="text-gray-400">活跃赛事</span>
            <p className="text-lg font-bold">{recentMatches.filter(m => m.status !== 'completed').length}</p>
          </div>
        </div>
      </div>

      {/* 功能入口 */}
      <div className="grid grid-cols-2 gap-3">
        {[...features, { title: '个人中心', path: `/profile/${profile?.id}`, icon: '👤', color: 'bg-pink-100 text-pink-600' }].map(f => (
          <Link
            key={f.path}
            to={f.path}
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition"
          >
            <div className={`inline-block p-2 rounded-lg ${f.color} mb-2`}>
              <span className="text-xl">{f.icon}</span>
            </div>
            <p className="font-medium text-sm">{f.title}</p>
          </Link>
        ))}
      </div>

      {/* 最近比赛 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold">最近比赛</h2>
          <Link to="/history" className="text-sm text-blue-600">查看全部</Link>
        </div>

        {loadingMatches ? (
          <p className="text-gray-400 text-sm text-center py-4">加载中...</p>
        ) : recentMatches.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            暂无比赛记录，去约一局吧！
          </p>
        ) : (
          <div className="divide-y">
            {recentMatches.map(m => (
              <Link key={m.id} to={`/matches/${m.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{m.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {m.winner_name && `胜者: ${m.winner_name}`}
                    {m.rated && ' · 积分赛'}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(m.status)}`}>
                  {statusLabel(m.status)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
