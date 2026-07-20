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
  const [tournamentFormat, setTournamentFormat] = useState<string>('')

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
        const { data: t } = await supabase.from('tournaments').select('config, format').eq('id', m.tournament_id).single()
        if (t) { setTournamentConfig(t.config); setTournamentFormat(t.format) }
      }
    }
    setLoading(false)
  }

  const isPlayer1 = match?.player1_id === profile?.id
  const isPlayer2 = match?.player2_id === profile?.id
  // For tournament matches (player1_id null), match by name
  const isPlayer1ByName = !match?.player1_id && match?.player1_name === profile?.nickname
  const isPlayer2ByName = !match?.player2_id && match?.player2_name === profile?.nickname
  const canEdit = isPlayer1 || isPlayer2 || isPlayer1ByName || isPlayer2ByName || match?.created_by === profile?.id

  const isFunMode = !!tournamentConfig?.target_score
  const targetScore: number = tournamentConfig?.target_score || 100
  const isTeamFun = isFunMode && tournamentConfig?.mode === 'team_relay'
  const isFunHandicap = tournamentConfig?.target_score === 21 && !!tournamentConfig?.handicap_score
  const isFunArena = !!tournamentConfig?.arena_champion_name
  const handicapScore: number = tournamentConfig?.handicap_score || 0
  const handicapPlayerId: string = tournamentConfig?.handicap_player_id || ''
  const stages: any[] = tournamentConfig?.stages || []
  const setsToWin: number = tournamentConfig?.sets_to_win || 2

  const p1Final = match?.player1_sets || 0
  const p2Final = match?.player2_sets || 0
  const hasResult = match?.status === 'completed' && (p1Final > 0 || p2Final > 0)

  // 自动判断输赢
  function getWinner(): 'player1' | 'player2' | null {
    const p1 = parseInt(inputP1)
    const p2 = parseInt(inputP2)
    if (isNaN(p1) || isNaN(p2)) return null

    if (isFunMode) {
      // 趣味模式：达到目标分且领先≥2分获胜
      if (p1 >= targetScore && p1 - p2 >= 2) return 'player1'
      if (p2 >= targetScore && p2 - p1 >= 2) return 'player2'
      return null
    }

    // 传统局分制
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
      if (p1 === p2) { setError(isFunMode ? '分数不能相同' : '局分不能相同'); return }
      if (isFunMode) {
        setError(`先达到 ${targetScore} 分且领先≥2分者胜，当前 ${Math.max(p1, p2)}:${Math.min(p1, p2)} 不满足`);
      } else {
        setError(`胜者必须赢得 ${setsToWin} 局，当前为 ${Math.max(p1, p2)}:${Math.min(p1, p2)}，不合法`);
      }
      return
    }

    const winnerName = autoWinner === 'player1' ? match.player1_name : match.player2_name
    const confirmMsg = isFunMode
      ? `确认 ${winnerName} 以 ${p1}:${p2}（先得${targetScore}分）获胜？`
      : `确认 ${winnerName} ${p1}:${p2} 获胜？`
    if (!confirm(confirmMsg)) return

    setSubmitting(true)
    const { data: current } = await supabase.from('matches').select('status').eq('id', id).single()
    if (current?.status === 'completed') { setError('比赛已结束'); setSubmitting(false); return }

    // 趣味团体赛：判断是否结束
    const gameOver = isFunMode && (p1 >= targetScore || p2 >= targetScore)
    const isGameOver = isTeamFun ? gameOver : true

    const { error: err } = await supabase
      .from('matches')
      .update({
        status: isGameOver ? 'completed' : 'in_progress',
        winner_name: isGameOver ? winnerName : null,
        player1_sets: p1,
        player2_sets: p2,
      })
      .eq('id', id)
      .eq('status', 'in_progress')

    // 团体赛未结束：推进到下一阶段
    if (isTeamFun && !isGameOver && match.tournament_id) {
      const nextStage = (tournamentConfig?.current_stage || 0) + 1
      await supabase.from('tournaments').update({
        config: { ...tournamentConfig, current_stage: nextStage }
      }).eq('id', match.tournament_id)
    }

    setSubmitting(false)
    if (err) { setError(err.message); return }
    setInputP1(''); setInputP2('')
    loadMatch()
  }

  function getEloParams(format: string | undefined, config: any): { kFactor?: number } {
    if (format === 'fun_elo_handicap') return { kFactor: 16 };  // 让分赛K折半
    if (format === 'fun_blind_doubles') return { kFactor: 20 };  // 双打冠军K
    if (format === 'fun_arena') return { kFactor: 25 };          // 擂台赛K
    return {};
  }

  async function handleSettleElo() {
    if (!match || !match.winner_name) return
    if (!confirm('确定要结算 ELO 积分吗？此操作不可撤销。')) return
    setError('')

    // Resolve profile IDs: try direct IDs first, then name lookup (for tournament matches)
    let p1Id = match.player1_id
    let p2Id = match.player2_id
    if ((!p1Id || !p2Id) && match.tournament_id) {
      const { data: tp } = await supabase.from('tournament_players')
        .select('profile_id, player_name').eq('tournament_id', match.tournament_id)
      if (tp) {
        const p1 = tp.find(p => p.player_name === match.player1_name)
        const p2 = tp.find(p => p.player_name === match.player2_name)
        if (!p1Id && p1?.profile_id) p1Id = p1.profile_id
        if (!p2Id && p2?.profile_id) p2Id = p2.profile_id
      }
    }
    if (!p1Id || !p2Id) { setError('无法确定选手身份，ELO 结算跳过'); return }

    try {
      const winner = match.winner_name === match.player1_name ? 'player1' : 'player2'
      const { kFactor } = getEloParams(tournamentFormat, tournamentConfig)
      await settleMatchElo(supabase, match.id, p1Id, p2Id, winner, kFactor)
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
          <span className="text-[10px] text-gray-400">
            {isFunMode ? `百分制（先得${targetScore}分胜）` : `${setsToWin * 2 - 1}局${setsToWin}胜`}
          </span>
          {match.rated && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">积分已结算</span>}
          {isFunArena && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">擂台挑战赛</span>
          )}
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
            🏆 {match.winner_name} 胜（{p1Final}:{p2Final}{isFunMode ? ` 先得${targetScore}分` : ''}）
          </div>
        )}
        {/* ELO让分提示 */}
        {isFunHandicap && handicapScore > 0 && (
          <div className="px-4 py-2 bg-yellow-50 border-t text-xs text-center text-yellow-700">
            ⚡ 让分：{handicapPlayerId === match?.player1_id ? match?.player1_name : match?.player2_name} 从 {handicapScore} 分开始
          </div>
        )}
        {/* 擂台赛进度 */}
        {isFunArena && tournamentConfig?.challenge_order && (
          <div className="px-4 py-2 bg-purple-50 border-t text-xs text-center">
            👑 当前擂主：<strong>{tournamentConfig.arena_champion_name}</strong>
            {' '}| 连胜：{tournamentConfig.arena_streak || 0}场
            {' '}| 挑战：{match ? ((tournamentConfig.challenge_order as any[]).filter((c: any) => c.order <= match.round!).length || match.round || '0') : '0'} / {(tournamentConfig.challenge_order as any[]).length} 场
          </div>
        )}
      </div>

      {/* 登记结果 */}
      {match.status !== 'completed' && canEdit && (
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
          <p className="text-sm font-medium text-gray-500 text-center">
            {isFunMode
              ? `百分制 — 先得${targetScore}分者胜`
              : `${setsToWin * 2 - 1}局${setsToWin}胜 — 填写双方胜场`}
          </p>

          {/* 团体赛阶段信息 */}
          {isTeamFun && stages.length > 0 && (() => {
            const currentStage = (tournamentConfig?.current_stage || 0)
            const stage = stages[currentStage]
            return stage ? (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center space-y-2">
                <p className="text-xs text-orange-500 font-medium">
                  第 {stage.stage} / 7 阶段 · {stage.type}
                </p>
                <p className="text-sm font-bold text-orange-800">
                  {stage.p1} vs {stage.p2}
                </p>
                <p className="text-xs text-orange-600">
                  累计比分：{match.player1_name} <strong>{p1Final}</strong> : <strong>{p2Final}</strong> {match.player2_name}
                </p>
                {/* 里程碑检测 */}
                {(() => {
                  const milestones = [15, 30, 45, 60, 75, 90]
                  const nextMilestone = milestones.find(m => m > Math.max(p1Final, p2Final))
                  return nextMilestone ? (
                    <p className="text-[10px] text-gray-400">下一换人节点：{nextMilestone}分</p>
                  ) : null
                })()}
              </div>
            ) : null
          })()}

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
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    {isTeamFun && stages.length > 0
                      ? stages[(tournamentConfig?.current_stage || 0)]?.p1 || match.player1_name
                      : match.player1_name}
                  </p>
                  <input
                    type="number"
                    min="0"
                    max={isFunMode ? targetScore : setsToWin}
                    value={inputP1}
                    onChange={e => setInputP1(e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-4xl font-extrabold py-5 px-2 border-2 border-gray-300 rounded-xl
                      focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100
                      transition-all"
                    style={{ fontSize: '2.5rem', height: '80px' }}
                  />
                  {isFunMode && <p className="text-[10px] text-gray-400 mt-1">当前累计：{p1Final}</p>}
                </div>
                <span className="text-3xl font-extrabold text-gray-400 mt-6">:</span>
                <div className="flex-1 text-center">
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    {isTeamFun && stages.length > 0
                      ? stages[(tournamentConfig?.current_stage || 0)]?.p2 || match.player2_name
                      : match.player2_name}
                  </p>
                  <input
                    type="number"
                    min="0"
                    max={isFunMode ? targetScore : setsToWin}
                    value={inputP2}
                    onChange={e => setInputP2(e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-4xl font-extrabold py-5 px-2 border-2 border-gray-300 rounded-xl
                      focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100
                      transition-all"
                    style={{ fontSize: '2.5rem', height: '80px' }}
                  />
                  {isFunMode && <p className="text-[10px] text-gray-400 mt-1">当前累计：{p2Final}</p>}
                </div>
              </div>

              {/* 自动判定结果提示 */}
              {autoWinner && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-base font-bold text-green-700">
                    {autoWinner === 'player1'
                      ? (isTeamFun && stages.length > 0 ? stages[(tournamentConfig?.current_stage || 0)]?.p1 : match.player1_name)
                      : (isTeamFun && stages.length > 0 ? stages[(tournamentConfig?.current_stage || 0)]?.p2 : match.player2_name)}{' '}
                    {inputP1}:{inputP2} {isFunMode ? `（先得${targetScore}分）` : ''}胜
                  </p>
                </div>
              )}

              {/* 验证提示 */}
              {inputP1 && inputP2 && !autoWinner && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-sm font-medium text-red-600">
                    {parseInt(inputP1) === parseInt(inputP2)
                      ? (isFunMode ? '分数不能相同' : '局分不能相同')
                      : isFunMode
                        ? `先达到 ${targetScore} 分且领先≥2分者胜`
                        : `无效比分，胜者须赢得 ${setsToWin} 局`}
                  </p>
                </div>
              )}

              {/* 提交按钮 */}
              <button
                onClick={handleSubmit}
                disabled={!autoWinner || submitting}
                className="w-full py-3.5 bg-green-600 text-white rounded-xl text-lg font-bold
                  hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                {isTeamFun ? '提交阶段得分' : '确认提交'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ELO 结算 */}
      {match.status === 'completed' && !match.rated && (match.player1_id || match.tournament_id) && (match.player2_id || match.tournament_id) && canEdit && (
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
