import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { listEngines } from '../lib/tournament'
import { StatusBadge } from '../components/common/StatusBadge'

export function TournamentHomePage() {
  const { user: profile } = useAuth()
  const navigate = useNavigate()
  const [myTournaments, setMyTournaments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const engineNames: Record<string, string> = Object.fromEntries(
    listEngines().map(e => [e.type, e.name])
  )

  useEffect(() => {
    if (profile) loadMyTournaments()
  }, [profile])

  async function loadMyTournaments() {
    if (!profile) return
    // 查找我作为选手参与的所有赛事
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

    // 附带选手数和比赛数
    const items = await Promise.all((tournaments || []).map(async (t) => {
      const { count: pc } = await supabase
        .from('tournament_players').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id)
      const { count: mc } = await supabase
        .from('matches').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id)
      return { ...t, player_count: pc || 0, match_count: mc || 0 }
    }))

    setMyTournaments(items)
    setLoading(false)
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-blue-600">&larr; 返回</button>

      {/* ===== 创建赛事 ===== */}
      <div>
        <h1 className="text-xl font-bold">🏆 赛事中心</h1>
        <Link to="/tournaments/new"
          className="mt-4 block bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl p-5 hover:from-blue-600 hover:to-indigo-700 transition shadow-md">
          <div className="flex items-center gap-3">
            <span className="text-3xl">+</span>
            <div>
              <p className="font-bold text-lg">创建赛事</p>
              <p className="text-sm text-blue-100">循环赛 / 淘汰赛 / 混合赛 / 单人 / 团体</p>
            </div>
          </div>
        </Link>
      </div>

      {/* ===== 我的赛事 ===== */}
      <div>
        <h2 className="font-bold text-lg mb-3">📋 我的赛事</h2>
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">加载中...</p>
        ) : myTournaments.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl shadow-sm">
            <div className="text-4xl mb-3">🏓</div>
            <p className="text-gray-500 text-sm">暂无参与赛事</p>
            <p className="text-gray-400 text-xs mt-1">快去创建或报名参加赛事吧！</p>
            <Link to="/tournaments/new"
              className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
              创建赛事
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myTournaments.map(t => (
              <Link key={t.id} to={`/tournaments/${t.id}`}
                className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{t.name}</h3>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {engineNames[t.format] || t.format}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        t.category === 'team' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {t.category === 'team' ? '👥 团体' : '🏓 单人'}
                      </span>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-400 ml-3">
                    <p>{t.player_count}人</p>
                    <p>{t.match_count}场</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(t.created_at).toLocaleDateString('zh-CN')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
