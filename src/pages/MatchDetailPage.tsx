import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { settleMatchElo } from '../lib/elo'
import type { Match } from '../types'
import { StatusBadge } from '../components/common/StatusBadge'

export function MatchDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user: profile } = useAuth()
  const [match, setMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 手动输入局分
  const [inputP1, setInputP1] = useState('')
  const [inputP2, setInputP2] = useState('')
  // 从 tournament config 获取 sets_to_win
  const [tournamentConfig, setTournamentConfig] = useState<any>(null)

  useEffect(() => {
    if (!id) return
    loadMatch()
  }, [id])

  async function loadMatch() {
    if (!id) return
    const { data: m } = await supabase.from('matches').select('*').eq('id', id).single()
    if (m) {
      setMatch(m)
      if (m.tournament_id) {
        const { data: t } = await supabase.from('tournaments').select('config').eq('id', m.tournament_id).single()
        if (t) setTournamentConfig(t.config)
      }
    }
    setLoading(false)
  }

  const isPlayer1 = match?.player1_id === profile?.id
  const isPlayer2 = match?.player2_id === profile?.id
  const canEdit = isPlayer1 || isPlayer2 || match?.created_by === profile?.id

  const setsToWin: number = tournamentConfig?.sets_to_win || 2

  const p1Final = match?.player1_sets || 0
  const p2Final = match?.player2_sets || 0
  const hasResult = match?.status === 'completed' && (p1Final > 0 || p2Final > 0)

  // 自动判断输赢
  function getWinner(): 'player1' | 'player2' | null {
    const p1 = parseInt(inputP1)
    const p2 = parseInt(inputP2)
    if (isNaN(p1) || isNaN(p2)) return null
    if (p1 === setsToWin && p2 < setsToWin) return 'player1'
    if (p2 === setsToWin && p1 < setsToWin) return 'player2'
    return null
  }

  const autoWinner = getWinner()

  async function handleSubmit() {
    if (!id || !match) return
    const p1 = parseInt(inputP1)
    const p2 = parseInt(inputP2)
    if (isNaN(p1) || isNaN(p2)) { setError('请填写双方局分'); return }

    if (!autoWinner) {
      if (p1 === p2) { setError('局分不能相同'); return }
      setError(`胜者必须赢得 ${setsToWin} 局，当前为 ${Math.max(p1, p2)}:${Math.min(p1, p2)}，不合法`);
      return
    }

    const winnerName = autoWinner === 'player1' ? match.player1_name : match.player2_name
    if (!confirm(`确认 ${winnerName} ${p1}:${p2} 获胜？`)) return

    setSubmitting(true)
    const { data: current } = await supabase.from('matches').select('status').eq('id', id).single()
    if (current?.status === 'completed') { setError('比赛已结束'); setSubmitting(false); return }

    const { error: err } = await supabase
      .from('matches')
      .update({
        status: 'completed',
        winner_name: winnerName,
        player1_sets: p1,
        player2_sets: p2,
      })
      .eq('id', id)
      .eq('status', 'in_progress')
    setSubmitting(false)
    if (err) { setError(err.message); return }
    setInputP1(''); setInputP2('')
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '结算失败')
    }
  }

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>
  if (!match) return <div className="text-center py-10 text-gray-400">比赛不存在</div>

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <button onClick={() => navigate(-1)} className="text-xs text-blue-600">&larr; 返回</button>
        <h1 className="text-base font-bold mt-1">
          {match.player1_name} vs {match.player2_name}
        </h1>
        <div className="flex gap-1 mt-1 items-center">
          <StatusBadge status={match.status} />
          <span className="text-[10px] text-gray-400">{setsToWin * 2 - 1}局{setsToWin}胜</span>
          {match.rated && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">积分已结算</span>}
        </div>
      </div>

      {/* 比分展示 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-center gap-4 px-4 py-5">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600">{match.player1_name}</p>
            <p className={`text-3xl font-extrabold ${hasResult && p1Final > p2Final ? 'text-green-600' : ''}`}>
              {match.status === 'completed' ? p1Final : '-'}
            </p>
          </div>
          <span className="text-xl text-gray-300 font-bold">:</span>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600">{match.player2_name}</p>
            <p className={`text-3xl font-extrabold ${hasResult && p2Final > p1Final ? 'text-green-600' : ''}`}>
              {match.status === 'completed' ? p2Final : '-'}
            </p>
          </div>
        </div>
        {match.status === 'completed' && (
          <div className="px-4 py-2 bg-blue-50 border-t text-sm font-semibold text-center">
            🏆 {match.winner_name} 胜（{p1Final}:{p2Final}）
          </div>
        )}
      </div>

      {/* 登记结果 */}
      {match.status !== 'completed' && canEdit && (
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
          <p className="text-sm font-medium text-gray-500 text-center">
            {setsToWin * 2 - 1}局{setsToWin}胜 — 填写双方胜场
          </p>

          {match.status === 'scheduled' && (
            <button onClick={async () => {
              const { error } = await supabase.from('matches').update({ status: 'in_progress' }).eq('id', id)
              if (error) { setError(error.message); return }
              loadMatch()
            }}
              className="w-full py-3 bg-yellow-500 text-white rounded-lg text-base font-bold hover:bg-yellow-600">
              开始比赛
            </button>
          )}

          {match.status === 'in_progress' && (
            <>
              {/* 大号输入框 */}
              <div className="flex items-center justify-center gap-3">
                <div className="flex-1 text-center">
                  <p className="text-sm font-semibold text-gray-700 mb-2">{match.player1_name}</p>
                  <input
                    type="number"
                    min="0"
                    max={setsToWin}
                    value={inputP1}
                    onChange={e => setInputP1(e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-4xl font-extrabold py-5 px-2 border-2 border-gray-300 rounded-xl
                      focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100
                      transition-all"
                    style={{ fontSize: '2.5rem', height: '80px' }}
                  />
                </div>
                <span className="text-3xl font-extrabold text-gray-400 mt-6">:</span>
                <div className="flex-1 text-center">
                  <p className="text-sm font-semibold text-gray-700 mb-2">{match.player2_name}</p>
                  <input
                    type="number"
                    min="0"
                    max={setsToWin}
                    value={inputP2}
                    onChange={e => setInputP2(e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-4xl font-extrabold py-5 px-2 border-2 border-gray-300 rounded-xl
                      focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100
                      transition-all"
                    style={{ fontSize: '2.5rem', height: '80px' }}
                  />
                </div>
              </div>

              {/* 自动判定结果提示 */}
              {autoWinner && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-base font-bold text-green-700">
                    {autoWinner === 'player1' ? match.player1_name : match.player2_name}{' '}
                    {inputP1}:{inputP2} 胜
                  </p>
                </div>
              )}

              {/* 验证提示 */}
              {inputP1 && inputP2 && !autoWinner && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-sm font-medium text-red-600">
                    {parseInt(inputP1) === parseInt(inputP2) ? '局分不能相同' : `无效比分，胜者须赢得 ${setsToWin} 局`}
                  </p>
                </div>
              )}

              {/* 提交按钮 */}
              <button
                onClick={handleSubmit}
                disabled={!autoWinner || submitting}
                className="w-full py-3.5 bg-green-600 text-white rounded-xl text-lg font-bold
                  hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                确认提交
              </button>
            </>
          )}
        </div>
      )}

      {/* ELO 结算 */}
      {match.status === 'completed' && !match.rated && match.player1_id && match.player2_id && canEdit && (
        <button onClick={handleSettleElo}
          className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700">
          结算 ELO 积分
        </button>
      )}
      {match.rated && match.status === 'completed' && (
        <div className="bg-green-50 rounded-lg p-2 text-center text-xs text-green-700 font-medium">✅ 积分已结算</div>
      )}

      {error && <p className="text-red-500 text-sm font-medium text-center">{error}</p>}
    </div>
  )
}
