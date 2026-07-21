import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { placeBet as placeBetRpc } from '../lib/coins'
import type { PredictionEvent, PredictionBet } from '../types'

export function PredictionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()

  const [event, setEvent] = useState<PredictionEvent | null>(null)
  const [bets, setBets] = useState<PredictionBet[]>([])
  const [myBet, setMyBet] = useState<PredictionBet | null>(null)
  const [loading, setLoading] = useState(true)
  const [betAmount, setBetAmount] = useState(10)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { if (id) { loadEvent(); loadBets() } }, [id])

  async function loadEvent() {
    const { data } = await supabase.from('prediction_events').select('*').eq('id', id).single()
    setEvent(data as PredictionEvent)
    setLoading(false)
  }

  async function loadBets() {
    if (!id) return
    const { data } = await supabase
      .from('prediction_bets')
      .select('*')
      .eq('event_id', id)
      .order('amount', { ascending: false })
    const allBets = (data || []) as PredictionBet[]
    setBets(allBets)
    if (user) {
      const mine = allBets.find(b => b.user_id === user.id) || null
      setMyBet(mine)
      if (mine) setSelectedOption(mine.option_index)
    }
  }

  async function handlePlaceBet() {
    if (!user || !id || selectedOption === null) return
    if (betAmount < 1) { setError('最低投注 1 币'); return }
    if (betAmount > (user.coins || 0)) { setError('金币不足'); return }

    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      await placeBetRpc(user.id, id, selectedOption, betAmount)
      setSuccess('投注成功！')
      await refreshUser()
      await Promise.all([loadEvent(), loadBets()])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '投注失败')
    }
    setSubmitting(false)
  }

  function getOptions(): { label: string; value: string }[] {
    if (!event) return []
    try {
      return typeof event.options === 'string' ? JSON.parse(event.options) : event.options
    } catch { return [] }
  }

  function getTotalOnOption(optionIndex: number): number {
    return bets.filter(b => b.option_index === optionIndex).reduce((sum, b) => sum + b.amount, 0)
  }

  function timeLeft(deadline: string) {
    const diff = new Date(deadline).getTime() - Date.now()
    if (diff <= 0) return '已截止'
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    if (h > 24) return `${Math.floor(h / 24)}天${h % 24}小时`
    return `${h}小时${m}分钟`
  }

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>
  if (!event) return <div className="text-center py-10 text-gray-400">事件不存在</div>

  const options = getOptions()
  const totalPool = event.pool_total
  const canBet = event.status === 'open' && user && new Date(event.deadline) > new Date()

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <button onClick={() => navigate(-1)} className="text-xs text-blue-600">&larr; 返回竞猜列表</button>

      {/* Header */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            event.status === 'open' ? 'bg-green-100 text-green-700' :
            event.status === 'settled' ? 'bg-blue-100 text-blue-700' :
            event.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {event.status === 'open' ? '进行中' :
             event.status === 'settled' ? '已结算' :
             event.status === 'cancelled' ? '已取消' : '已关闭'}
          </span>
          <span className="text-xs text-gray-400">
            {event.event_type === 'platform_match' ? '🏓 平台比赛' : '📋 自定义事件'}
          </span>
        </div>
        <h1 className="text-lg font-bold">{event.title}</h1>
        {event.description && <p className="text-sm text-gray-500 mt-1">{event.description}</p>}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <span>🏆 奖池 <strong>{totalPool}</strong> 币</span>
          <span>👥 <strong>{bets.length}</strong> 人参与</span>
          {event.status === 'open' && (
            <span className="text-orange-500 text-xs">
              ⏰ 剩余 {timeLeft(event.deadline)}
            </span>
          )}
        </div>
      </div>

      {/* Success/Error */}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-lg">{success}</div>}

      {/* Options */}
      <div className="space-y-3">
        {options.map((opt, i) => {
          const optTotal = getTotalOnOption(i)
          const pct = totalPool > 0 ? Math.round((optTotal / totalPool) * 100) : 0
          const isWinner = event.status === 'settled' && event.winning_option === i
          const isSelected = selectedOption === i

          return (
            <div
              key={i}
              onClick={() => canBet && setSelectedOption(i)}
              className={`bg-white rounded-xl p-4 shadow-sm border-2 transition cursor-pointer ${
                isWinner ? 'border-yellow-400 bg-yellow-50' :
                isSelected && canBet ? 'border-blue-400 bg-blue-50' :
                canBet ? 'border-transparent hover:border-gray-300' :
                'border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {canBet && (
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {isSelected && <span className="text-white text-xs">✓</span>}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-sm">{opt.label}</p>
                    <p className="text-xs text-gray-400">
                      {optTotal} 币 · {pct}%
                    </p>
                  </div>
                </div>
                {isWinner && (
                  <span className="text-lg">🏆</span>
                )}
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isWinner ? 'bg-yellow-400' : 'bg-blue-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Bet Input */}
      {canBet && (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="font-bold text-sm">下注</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBetAmount(Math.max(1, betAmount - 5))}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold"
            >−</button>
            <input
              type="number"
              value={betAmount}
              onChange={e => setBetAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 text-center border rounded-lg py-1.5 text-sm font-bold"
              min={1}
              max={user?.coins || 0}
            />
            <button
              onClick={() => setBetAmount(Math.min(user?.coins || 999, betAmount + 5))}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold"
            >+</button>
            <div className="flex gap-1 ml-2">
              {[10, 50, 100].map(n => (
                <button
                  key={n}
                  onClick={() => setBetAmount(Math.min(n, user?.coins || n))}
                  className={`px-2 py-1 text-xs rounded-lg ${
                    betAmount === n ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600'
                  }`}
                >{n}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400">余额: {user?.coins || 0} 币</p>
          <button
            onClick={handlePlaceBet}
            disabled={submitting || selectedOption === null || !!myBet}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '投注中...' : myBet ? '已投注' : `投注 ${betAmount} 币`}
          </button>
        </div>
      )}

      {/* My Bet Info */}
      {myBet && (
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <h3 className="font-bold text-sm text-blue-800">我的投注</h3>
          <p className="text-sm text-blue-700 mt-1">
            投注 {myBet.amount} 币 → {options[myBet.option_index]?.label || `选项${myBet.option_index + 1}`}
          </p>
          {myBet.settled && (
            <p className={`text-sm font-bold mt-1 ${myBet.won_amount && myBet.won_amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
              {myBet.won_amount && myBet.won_amount > 0 ? `🎉 赢得 ${myBet.won_amount} 币` : '😞 未中奖'}
            </p>
          )}
        </div>
      )}

      {/* Bettors list */}
      {bets.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold text-sm mb-3">参与用户</h3>
          <div className="space-y-2">
            {bets.map(bet => (
              <div key={bet.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <span className="text-gray-600">
                    {options[bet.option_index]?.label || `选项${bet.option_index + 1}`}
                  </span>
                </div>
                <span className="font-medium">{bet.amount} 币</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
