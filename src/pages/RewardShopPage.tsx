import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { redeemReward } from '../lib/coins'
import type { RewardItem } from '../types'

export function RewardShopPage() {
  const { user, refreshUser } = useAuth()
  const [items, setItems] = useState<RewardItem[]>([])
  const [filter, setFilter] = useState<'all' | 'physical' | 'badge'>('all')
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { loadItems() }, [filter])

  async function loadItems() {
    setLoading(true)
    let query = supabase
      .from('reward_items')
      .select('*')
      .eq('is_active', true)
      .order('cost', { ascending: true })

    if (filter !== 'all') {
      query = query.eq('type', filter)
    }

    const { data } = await query
    setItems((data || []) as RewardItem[])
    setLoading(false)
  }

  async function handleRedeem(item: RewardItem) {
    if (!user) return
    if (user.coins < item.cost) { setError('金币不足'); return }
    if (item.stock === 0) { setError('库存不足'); return }

    if (!confirm(`确定用 ${item.cost} 币兑换「${item.name}」吗？`)) return

    setRedeeming(item.id)
    setError('')
    setSuccess('')
    try {
      const result = await redeemReward(user.id, item.id)
      setSuccess(`成功兑换「${(result as any).item_name || item.name}」！`)
      await refreshUser()
      loadItems()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '兑换失败')
    }
    setRedeeming(null)
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">🎁 奖励商店</h1>
        <Link to="/coins" className="text-sm text-orange-600 font-medium">
          💰 {user?.coins || 0} 币
        </Link>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {([
          { key: 'all', label: '全部' },
          { key: 'physical', label: '🎁 实物' },
          { key: 'badge', label: '🏅 徽章' },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === f.key ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-lg">{success}</div>}

      {/* Item Grid */}
      {loading ? (
        <p className="text-center text-gray-400 py-10">加载中...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-400 text-sm">暂无奖励物品</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map(item => {
            const canRedeem = (user?.coins || 0) >= item.cost && item.stock !== 0
            return (
              <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm flex flex-col">
                <div className="text-center mb-2">
                  <span className="text-3xl">{item.type === 'badge' ? '🏅' : '🎁'}</span>
                </div>
                <h3 className="font-bold text-sm text-center">{item.name}</h3>
                {item.description && (
                  <p className="text-xs text-gray-400 text-center mt-1 line-clamp-2">{item.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-orange-600">{item.cost} 币</span>
                  {item.stock > 0 && (
                    <span className="text-xs text-gray-400">余{item.stock}</span>
                  )}
                </div>
                <button
                  onClick={() => handleRedeem(item)}
                  disabled={!canRedeem || redeeming === item.id}
                  className={`mt-2 w-full py-1.5 rounded-lg text-xs font-bold transition ${
                    canRedeem
                      ? 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {redeeming === item.id ? '兑换中...' :
                   item.stock === 0 ? '已售罄' :
                   !canRedeem ? '金币不足' : '立即兑换'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
