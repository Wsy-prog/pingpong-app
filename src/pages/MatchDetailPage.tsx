import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { settleMatchElo } from '../lib/elo'
import type { Match, Set } from '../types'

export function MatchDetailPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [match, setMatch] = useState<Match | null>(null)
  const [sets, setSets] = useState<Set[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newScore1, setNewScore1] = useState('')
  const [newScore2, setNewScore2] = useState('')

  useEffect(() => {
    if (!id) return
    loadMatch()
  }, [id])

  async function loadMatch() {
    if (!id) return
    const { data: m } = await supabase.from('matches').select('*').eq('id', id).single()
    const { data: s } = await supabase.from('sets').select('*').eq('match_id', id).order('set_number')
    if (m) setMatch(m)
    if (s) setSets(s)
    setLoading(false)
  }

  const isPlayer1 = match?.player1_id === profile?.id
  const isPlayer2 = match?.player2_id === profile?.id
  const canEdit = isPlayer1 || isPlayer2 || match?.created_by === profile?.id

  const player1Sets = sets.filter(s => s.player1_score > s.player2_score).length
  const player2Sets = sets.filter(s => s.player2_score > s.player1_score).length
  const isBestOf = player1Sets >= Math.ceil(sets.length / 2) || player2Sets >= Math.ceil(sets.length / 2)

  async function handleAddSet() {
    if (!id || !newScore1 || !newScore2 || !canEdit) return
    const s1 = parseInt(newScore1)
    const s2 = parseInt(newScore2)
    if (isNaN(s1) || isNaN(s2)) return

    const nextNumber = sets.length + 1
    const { error: err } = await supabase.from('sets').insert({
      match_id: id,
      set_number: nextNumber,
      player1_score: s1,
      player2_score: s2,
    })
    if (err) { setError(err.message); return }
    setNewScore1('')
    setNewScore2('')
    loadMatch()
  }

  async function handleFinishMatch(winner: 'player1' | 'player2') {
    if (!id || !match) return
    const winnerName = winner === 'player1' ? match.player1_name : match.player2_name
    const { error: err } = await supabase
      .from('matches')
      .update({
        status: 'completed',
        winner_name: winnerName,
        player1_sets: player1Sets,
        player2_sets: player2Sets,
      })
      .eq('id', id)
    if (err) { setError(err.message); return }
    loadMatch()
  }

  async function handleSettleElo() {
    if (!match || !match.player1_id || !match.player2_id || !match.winner_name) return
    if (!confirm('确定要结算 ELO 积分吗？此操作不可撤销。')) return
    setError('')
    try {
      const winner = match.winner_name === match.player1_name ? 'player1' : 'player2'
      await settleMatchElo(supabase, match.id, match.player1_id, match.player2_id, winner)
      loadMatch()
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>
  if (!match) return <div className="text-center py-10 text-gray-400">比赛不存在</div>

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* 头部信息 */}
      <div>
        <Link to="/" className="text-sm text-blue-600">&larr; 返回</Link>
        <h1 className="text-xl font-bold mt-2">{match.player1_name} vs {match.player2_name}</h1>
        <div className="flex gap-2 mt-1">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            match.status === 'completed' ? 'bg-green-100 text-green-700' :
            match.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {match.status === 'scheduled' && '已创建'}
            {match.status === 'in_progress' && '进行中'}
            {match.status === 'completed' && '已结束'}
          </span>
          {match.rated && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">积分赛</span>}
        </div>
        {match.location && <p className="text-sm text-gray-500 mt-1">📍 {match.location}</p>}
        {match.match_date && <p className="text-sm text-gray-500">🕐 {new Date(match.match_date).toLocaleString('zh-CN')}</p>}
      </div>

      {/* 比分板 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_40px_40px] gap-2 px-4 py-2 bg-gray-50 text-sm font-medium text-gray-500">
          <div></div>
          <div className="text-center">{match.player1_name}</div>
          <div className="text-center">{match.player2_name}</div>
        </div>
        {sets.map(s => (
          <div key={s.id} className="grid grid-cols-[1fr_40px_40px] gap-2 px-4 py-2 border-t text-sm">
            <span className="text-gray-400">第{s.set_number}局</span>
            <span className={`text-center font-bold ${s.player1_score > s.player2_score ? 'text-green-600' : ''}`}>
              {s.player1_score}
            </span>
            <span className={`text-center font-bold ${s.player2_score > s.player1_score ? 'text-green-600' : ''}`}>
              {s.player2_score}
            </span>
          </div>
        ))}
        {sets.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-sm">暂无局分记录</p>
        )}
        {match.status === 'completed' && (
          <div className="px-4 py-3 bg-blue-50 border-t">
            <span className="text-sm font-medium">
              胜者：<span className="text-blue-700">{match.winner_name}</span>
              &nbsp;（{match.player1_sets}:{match.player2_sets}）
            </span>
          </div>
        )}
      </div>

      {/* 操作区域 */}
      {match.status !== 'completed' && canEdit && (
        <div className="space-y-3">
          {/* 添加局分 */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-medium text-sm mb-3">添加局分</h3>
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs text-gray-500">{match.player1_name}</label>
                <input type="number" min="0" value={newScore1} onChange={e => setNewScore1(e.target.value)}
                  className="w-16 px-2 py-1.5 border rounded text-center" />
              </div>
              <span className="pb-1.5">:</span>
              <div>
                <label className="text-xs text-gray-500">{match.player2_name}</label>
                <input type="number" min="0" value={newScore2} onChange={e => setNewScore2(e.target.value)}
                  className="w-16 px-2 py-1.5 border rounded text-center" />
              </div>
              <button onClick={handleAddSet}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                添加
              </button>
            </div>
          </div>

          {/* 比赛状态操作 */}
          <div className="flex gap-2">
            {match.status === 'scheduled' && (
              <button onClick={() => supabase.from('matches').update({ status: 'in_progress' }).eq('id', id).then(() => loadMatch())}
                className="flex-1 py-2 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600">
                开始比赛
              </button>
            )}
            {match.status === 'in_progress' && (
              <div className="flex-1 space-y-2">
                <p className="text-xs text-gray-500 text-center">谁赢了？</p>
                <div className="flex gap-2">
                  <button onClick={() => handleFinishMatch('player1')}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                    {match.player1_name} 胜
                  </button>
                  <button onClick={() => handleFinishMatch('player2')}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                    {match.player2_name} 胜
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 积分结算 */}
      {match.status === 'completed' && match.rated === false && match.player1_id && match.player2_id && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-600 mb-2">本场比赛尚未结算 ELO 积分</p>
          <button onClick={handleSettleElo}
            className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
            结算积分
          </button>
        </div>
      )}
      {match.rated && match.status === 'completed' && (
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-sm text-green-700 text-center">✅ 积分已结算</p>
        </div>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  )
}
