import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { PredictionEvent, Match } from '../types'

const STATUS_LABELS: Record<string, string> = {
  open: '进行中', closed: '已关闭', settled: '已结算', cancelled: '已取消',
}
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-700', closed: 'bg-yellow-100 text-yellow-700',
  settled: 'bg-blue-100 text-blue-700', cancelled: 'bg-gray-100 text-gray-500',
}

interface DisplayItem {
  id: string
  type: 'event' | 'match'
  title: string
  description: string | null
  optionsLabel: string
  status: string
  poolTotal: number
  deadline: string | null
  winningLabel: string | null
  // for matches without events
  matchId?: string
  createdBy?: string
  player1Name?: string
  player2Name?: string
  matchDate?: string | null
}

export function PredictionPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<DisplayItem[]>([])
  const [filter, setFilter] = useState<'all' | 'open' | 'closed' | 'settled'>('all')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null) // matchId being auto-created

  useEffect(() => { loadAll() }, [filter])

  async function loadAll() {
    setLoading(true)

    // 1. 加载 prediction_events
    let evQuery = supabase.from('prediction_events').select('*').order('created_at', { ascending: false }).limit(30)
    if (filter === 'open') evQuery = evQuery.eq('status', 'open')
    else if (filter === 'closed') evQuery = evQuery.eq('status', 'closed')
    else if (filter === 'settled') evQuery = evQuery.eq('status', 'settled')
    const { data: events } = await evQuery
    const eventList = (events || []) as PredictionEvent[]

    // 收集已有 event 的 match_id
    const eventMatchIds = new Set(eventList.filter(e => e.match_id).map(e => e.match_id!))

    // 2. 加载 prediction_enabled=true 的比赛（排除已完成/已取消 + 已有 event 的）
    let mQuery = supabase
      .from('matches')
      .select('id, title, player1_name, player2_name, match_date, status, created_by')
      .eq('prediction_enabled', true)
      .not('status', 'in', '("completed","cancelled")')
      .order('match_date', { ascending: true })
      .limit(30)
    const { data: matches } = await mQuery
    const matchList = (matches || []) as Match[]

    // 合并为统一列表
    const merged: DisplayItem[] = []

    // 先加 events
    for (const ev of eventList) {
      merged.push({
        id: ev.id,
        type: 'event',
        title: ev.title,
        description: ev.description,
        optionsLabel: getOptionLabels(ev.options),
        status: ev.status,
        poolTotal: ev.pool_total,
        deadline: ev.deadline,
        winningLabel: ev.winning_option != null ? getWinningLabel(ev.options, ev.winning_option) : null,
      })
    }

    // 再加没有 event 的比赛
    for (const m of matchList) {
      if (!eventMatchIds.has(m.id)) {
        merged.push({
          id: m.id,
          type: 'match',
          title: `${m.player1_name} vs ${m.player2_name}`,
          description: null,
          optionsLabel: `${m.player1_name} 获胜 vs ${m.player2_name} 获胜`,
          status: 'scheduled',
          poolTotal: 0,
          deadline: m.match_date,
          winningLabel: null,
          matchId: m.id,
          createdBy: m.created_by,
          player1Name: m.player1_name,
          player2Name: m.player2_name,
          matchDate: m.match_date,
        })
      }
    }

    setItems(merged)
    setLoading(false)
  }

  async function handleItemClick(item: DisplayItem) {
    if (item.type === 'event') {
      navigate(`/prediction/${item.id}`)
      return
    }
    // match → 仅管理员或比赛创建者可自动创建 prediction_event
    if (!user || creating) return
    const isAdmin = user.username === 'guanliyuan'
    const isCreator = item.createdBy === user.id
    if (!isAdmin && !isCreator) {
      alert('仅比赛创建者或管理员可为此比赛创建竞猜')
      return
    }
    setCreating(item.id)

    const { data, error } = await supabase.from('prediction_events').insert({
      title: `${item.player1Name} vs ${item.player2Name}`,
      event_type: 'platform_match',
      match_id: item.matchId,
      options: [
        { label: `${item.player1Name} 获胜`, value: 'player1' },
        { label: `${item.player2Name} 获胜`, value: 'player2' },
      ],
      deadline: item.matchDate || new Date(Date.now() + 7 * 86400000).toISOString(),
      created_by: user.id,
    }).select().single()

    setCreating(null)

    if (error) {
      alert('创建竞猜失败: ' + error.message)
      return
    }
    navigate(`/prediction/${data.id}`)
  }

  function timeLeft(dl: string) {
    const diff = new Date(dl).getTime() - Date.now()
    if (diff <= 0) return '已截止'
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    if (h > 24) return `${Math.floor(h / 24)}天后截止`
    if (h > 0) return `${h}小时${m}分钟后截止`
    return `${m}分钟后截止`
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">🎯 有奖竞猜</h1>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'open', 'closed', 'settled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}>
            {f === 'all' ? '全部' : f === 'open' ? '进行中' : f === 'closed' ? '已关闭' : '已结算'}
          </button>
        ))}
        <div className="flex-1" />
        <Link to="/coins" className="px-3 py-1.5 text-sm text-orange-600 bg-orange-50 rounded-full font-medium hover:bg-orange-100 transition">
          💰 我的金币
        </Link>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center text-gray-400 py-10">加载中...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-400 text-sm">暂无竞猜事件</p>
          <p className="text-xs text-gray-300 mt-1">请在创建比赛时开启「开放竞猜」选项</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <button
              key={`${item.type}-${item.id}`}
              onClick={() => handleItemClick(item)}
              disabled={creating === item.id}
              className="block w-full text-left bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition disabled:opacity-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{item.title}</h3>
                    {item.type === 'match' && (
                      <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full font-medium">
                        待投注
                      </span>
                    )}
                  </div>
                  {item.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">{item.optionsLabel}</p>
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${item.type === 'match' ? 'bg-orange-100 text-orange-600' : STATUS_COLORS[item.status]}`}>
                  {item.type === 'match' ? '未开始' : STATUS_LABELS[item.status]}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                {item.type === 'event' ? (
                  <>
                    <span>🏆 奖池 {item.poolTotal} 币</span>
                    {item.status === 'open' && item.deadline && <span className="text-orange-500">{timeLeft(item.deadline)}</span>}
                    {item.status === 'settled' && item.winningLabel && (
                      <span className="text-blue-500">获胜: {item.winningLabel}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span>🏆 奖池 0 币</span>
                    {item.deadline && <span className="text-orange-500">{timeLeft(item.deadline)}</span>}
                    <span className="text-orange-500">点击参与竞猜 →</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function getOptionLabels(opts: any): string {
  if (!opts) return ''
  try {
    const arr = typeof opts === 'string' ? JSON.parse(opts) : opts
    return arr.map((o: any) => o.label || o).join(' vs ')
  } catch { return '' }
}

function getWinningLabel(opts: any, idx: number): string {
  try {
    const arr = typeof opts === 'string' ? JSON.parse(opts) : opts
    return arr[idx]?.label || `选项${idx + 1}`
  } catch { return `选项${idx + 1}` }
}