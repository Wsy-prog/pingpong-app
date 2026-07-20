import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getCoinTransactions, dailyCheckin, getCheckinStatus } from '../lib/coins'
import type { CoinTransaction } from '../types'

const TYPE_LABELS: Record<string, string> = {
  daily_checkin: '📅 每日签到',
  tournament_reward: '🏆 赛事奖励',
  admin_grant: '🎁 管理员发放',
  bet_place: '🎯 投注',
  bet_win: '🎉 竞猜获胜',
  bet_refund: '↩️ 投注退款',
  reward_redeem: '🛒 奖励兑换',
}

export function CoinHistoryPage() {
  const { user, refreshUser } = useAuth()
  const [transactions, setTransactions] = useState<CoinTransaction[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [checkedIn, setCheckedIn] = useState(false)
  const [streak, setStreak] = useState(0)
  const [checkinMsg, setCheckinMsg] = useState('')
  const [checkinError, setCheckinError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)

  useEffect(() => {
    if (user) { loadTransactions(); loadCheckinStatus() }
  }, [user, filter])

  async function loadTransactions() {
    if (!user) return
    setLoading(true)
    const data = await getCoinTransactions(user.id, filter === 'all' ? undefined : filter)
    setTransactions(data)
    setLoading(false)
  }

  async function loadCheckinStatus() {
    if (!user) return
    const status = await getCheckinStatus(user.id)
    setCheckedIn(status.checkedIn)
    setStreak(status.streak)
  }

  async function handleCheckin() {
    if (!user) return
    setCheckingIn(true)
    setCheckinMsg('')
    setCheckinError('')
    try {
      const result = await dailyCheckin(user.id)
      setCheckinMsg(`签到成功！获得 ${result.coins_earned} 币，连续 ${result.streak_count} 天`)
      setCheckedIn(true)
      setStreak(result.streak_count)
      await refreshUser()
      loadTransactions()
    } catch (err: unknown) {
      setCheckinError(err instanceof Error ? err.message : '签到失败')
    }
    setCheckingIn(false)
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">💰 我的金币</h1>

      {/* Balance + Checkin Card */}
      <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl p-5 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-90">当前余额</p>
            <p className="text-3xl font-black">{user?.coins ?? 0} <span className="text-lg font-medium">币</span></p>
            {checkedIn && <p className="text-xs mt-1 opacity-80">🔥 连续签到 {streak} 天</p>}
          </div>
          <button
            onClick={handleCheckin}
            disabled={checkedIn || checkingIn}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition ${
              checkedIn
                ? 'bg-white/20 text-white/70 cursor-not-allowed'
                : 'bg-white text-orange-600 hover:bg-orange-50 active:scale-95'
            }`}
          >
            {checkingIn ? '签到中...' : checkedIn ? '✅ 已签到' : '📅 每日签到'}
          </button>
        </div>
        {checkinMsg && <p className="text-xs mt-2 bg-white/20 rounded-lg px-3 py-1.5">{checkinMsg}</p>}
        {checkinError && <p className="text-xs mt-2 text-red-200">{checkinError}</p>}
        <Link to="/rewards" className="inline-block mt-3 text-xs bg-white/20 rounded-full px-3 py-1 hover:bg-white/30 transition">
          🎁 去奖励商店兑换 →
        </Link>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          { key: 'all', label: '全部' },
          { key: 'daily_checkin', label: '签到' },
          { key: 'bet_place', label: '投注' },
          { key: 'bet_win', label: '中奖' },
          { key: 'reward_redeem', label: '兑换' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              filter === f.key ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b">
          <h3 className="font-bold text-sm">金币流水</h3>
        </div>
        {loading ? (
          <p className="text-center text-gray-400 py-8 text-sm">加载中...</p>
        ) : transactions.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">暂无记录</p>
        ) : (
          <div className="divide-y">
            {transactions.map(tx => (
              <div key={tx.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {TYPE_LABELS[tx.type] || tx.type}
                  </p>
                  {tx.note && <p className="text-xs text-gray-400 mt-0.5">{tx.note}</p>}
                  <p className="text-[10px] text-gray-300 mt-0.5">
                    {new Date(tx.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </p>
                  <p className="text-[10px] text-gray-400">余额 {tx.balance_after}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
