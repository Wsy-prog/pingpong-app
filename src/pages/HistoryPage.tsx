import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { listEngines } from '../lib/tournament'

interface TournamentItem {
  id: string
  name: string
  format: string
  status: string
  max_players: number | null
  created_at: string
  player_count: number
  match_count: number
}

export function HistoryPage() {
  const [tournaments, setTournaments] = useState<TournamentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const formatFilter = searchParams.get('format') || ''
  const statusFilter = searchParams.get('status') || ''

  const engines = listEngines()

  useEffect(() => { loadTournaments() }, [formatFilter, statusFilter])

  async function loadTournaments() {
    let query = supabase.from('tournaments').select('*')

    if (formatFilter) query = query.eq('format', formatFilter)
    if (statusFilter) query = query.eq('status', statusFilter)

    const { data } = await query.order('created_at', { ascending: false }).limit(50)
    if (!data) { setLoading(false); return }

    // 获取每个赛事的选手数和比赛数
    const items: TournamentItem[] = await Promise.all(
      data.map(async (t) => {
        const { count: pc } = await supabase
          .from('tournament_players').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id)
        const { count: mc } = await supabase
          .from('matches').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id)
        return {
          id: t.id, name: t.name, format: t.format, status: t.status,
          max_players: t.max_players, created_at: t.created_at,
          player_count: pc || 0, match_count: mc || 0,
        }
      })
    )

    setTournaments(items)
    setLoading(false)
  }

  const engineNames: Record<string, string> = {}
  engines.forEach(e => { engineNames[e.type] = e.name })

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold">📜 历史赛事</h1>

      {/* 筛选 */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <select value={formatFilter} onChange={e => setFilter('format', e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white">
          <option value="">全部赛制</option>
          {engines.map(e => <option key={e.type} value={e.type}>{e.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setFilter('status', e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white">
          <option value="">全部状态</option>
          <option value="draft">未开始</option>
          <option value="in_progress">进行中</option>
          <option value="completed">已结束</option>
        </select>
      </div>

      {/* 列表 */}
      {loading ? (
        <p className="text-center text-gray-400 py-10">加载中...</p>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📜</div>
          <p>暂无赛事</p>
          <Link to="/tournaments/new" className="text-blue-600 text-sm mt-2 inline-block">创建第一个赛事</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map(t => (
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
                      t.status === 'completed' ? 'bg-green-100 text-green-700' :
                      t.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {t.status === 'draft' ? '未开始' : t.status === 'in_progress' ? '进行中' : '已结束'}
                    </span>
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
  )
}
