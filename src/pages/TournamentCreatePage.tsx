import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { listEngines } from '../lib/tournament'
import type { TournamentFormat } from '../lib/tournament'

export function TournamentCreatePage() {
  const { user: profile } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<'singles' | 'doubles' | 'team' | 'fun'>('singles')
  const [format, setFormat] = useState<TournamentFormat>('round_robin')
  const [description, setDescription] = useState('')
  const [maxPlayersStr, setMaxPlayersStr] = useState('8')
  const [setsToWin, setSetsToWin] = useState(3)
  const [startTime, setStartTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showRules, setShowRules] = useState('') // '' | 'individual' | 'team'

  const engines = listEngines()

  function hasDirtyFields() {
    return name.trim() !== '' || description.trim() !== '' || startTime !== ''
  }

  function handleBack() {
    if (hasDirtyFields()) {
      const ok = window.confirm('尚未创建完成的比赛将会消失，是否返回？')
      if (!ok) return
    }
    navigate('/tournaments')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setSubmitting(true)
    setError('')

    const config = category === 'fun'
      ? { target_score: 100 }
      : { sets_to_win: setsToWin }

    const startISO = startTime ? new Date(startTime).toISOString() : null
    const minP = category === 'singles' ? 2 : category === 'doubles' ? 4 : category === 'fun' ? (format === 'fun_100_individual' ? 2 : 10) : 6
    const finalMaxPlayers = Math.max(minP, parseInt(maxPlayersStr) || minP)

    const { data, error: err } = await supabase
      .from('tournaments')
      .insert({
        name,
        category,
        format,
        config,
        description: description || null,
        max_players: finalMaxPlayers,
        start_time: startISO,
        created_by: profile.id,
      })
      .select()
      .single()

    if (err) { setError(err.message); setSubmitting(false); return }
    navigate(`/tournaments/${data.id}/setup`)
  }

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={handleBack} className="text-sm text-blue-600 mb-4 block">&larr; 返回菜单</button>
      <h1 className="text-xl font-bold mb-6">创建赛事</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">赛事名称</label>
          <input value={name} onChange={e => setName(e.target.value)} required
            placeholder="如：社区乒乓球赛 2024"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">赛事形式</label>
          <div className="grid grid-cols-4 gap-1.5">
            <button type="button" onClick={() => { setCategory('singles'); setMaxPlayersStr('2'); setFormat('round_robin') }}
              className={`p-2.5 rounded-lg border text-left transition ${
                category === 'singles'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
              <p className="font-medium text-xs">🏓 单人</p>
              <p className="text-[10px] text-gray-400 mt-0.5">≥2人</p>
            </button>
            <button type="button" onClick={() => { setCategory('doubles'); setMaxPlayersStr('4'); setFormat('round_robin') }}
              className={`p-2.5 rounded-lg border text-left transition ${
                category === 'doubles'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
              <p className="font-medium text-xs">🎯 双打</p>
              <p className="text-[10px] text-gray-400 mt-0.5">≥4人</p>
            </button>
            <button type="button" onClick={() => { setCategory('team'); setMaxPlayersStr('6'); setFormat('round_robin') }}
              className={`p-2.5 rounded-lg border text-left transition ${
                category === 'team'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
              <p className="font-medium text-xs">👥 团体</p>
              <p className="text-[10px] text-gray-400 mt-0.5">≥6人</p>
            </button>
            <button type="button" onClick={() => { setCategory('fun'); setMaxPlayersStr('2'); setFormat('fun_100_individual') }}
              className={`p-2.5 rounded-lg border text-left transition ${
                category === 'fun'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
              <p className="font-medium text-xs">🎪 趣味</p>
              <p className="text-[10px] text-gray-400 mt-0.5">百分制</p>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">赛制</label>
          <div className="grid grid-cols-2 gap-2">
            {engines.filter(e => category === 'fun' ? e.type.startsWith('fun_') : !e.type.startsWith('fun_')).map(e => {
              const isFunFormat = e.type.startsWith('fun_')
              return (
              <button key={e.type} type="button" onClick={() => { setFormat(e.type); if (category === 'fun') setMaxPlayersStr(e.type === 'fun_100_individual' ? '2' : '10') }}
                className={`p-3 rounded-lg border text-left transition relative ${
                  format === e.type
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="font-medium text-sm pr-5">{e.name}</p>
                {isFunFormat && (
                  <span onClick={(ev) => { ev.stopPropagation(); setShowRules(e.type === 'fun_100_individual' ? 'individual' : 'team') }}
                    className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] font-bold hover:bg-blue-200 hover:text-blue-600 cursor-pointer"
                    title="查看规则">?</span>
                )}
              </button>
            )})}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">参赛人数</label>
            <input type="number" min={category === 'singles' ? 2 : category === 'doubles' ? 4 : category === 'fun' ? (format === 'fun_100_individual' ? 2 : 10) : 6} max={category === 'fun' ? (format === 'fun_100_individual' ? 2 : 10) : 128} value={maxPlayersStr}
              onChange={e => setMaxPlayersStr(e.target.value)}
              disabled={category === 'fun'}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">每场胜局数</label>
            {category === 'fun' ? (
              <div className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500 text-sm">
                百分制（先得100分胜）
              </div>
            ) : (
              <select value={setsToWin} onChange={e => setSetsToWin(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value={3}>三局两胜</option>
                <option value={5}>五局三胜</option>
                <option value={7}>七局四胜</option>
                <option value={1}>一局胜负</option>
              </select>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">比赛开始时间（可选）</label>
          <input type="datetime-local" value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mt-1">设置后，选手可在开始前3小时取消报名</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="赛事规则说明..."
            rows={3}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={submitting}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          {submitting ? '创建中...' : '创建赛事'}
        </button>
      </form>

      {/* 趣味乒乓规则弹窗 */}
      {showRules && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRules('')}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {showRules === 'individual' ? (
              <>
                <h2 className="text-lg font-bold mb-4">🏓 百分个人大战 — 规则</h2>
                <div className="space-y-3 text-sm text-gray-700">
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>参赛人数</strong>：2人</li>
                    <li><strong>比赛形式</strong>：1v1</li>
                    <li><strong>计分规则</strong>：采用正规乒乓球比赛规则，每两分换发球</li>
                    <li><strong>获胜条件</strong>：双方不设局数限制，持续比赛，<span className="text-orange-600 font-bold">先累计达到100分的一方获胜</span></li>
                    <li>比分不归零，全程累加至100分</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-4">👥 百分团体大赛 — 规则</h2>
                <div className="space-y-3 text-sm text-gray-700">
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>参赛人数</strong>：每队5人，共10人（2队）</li>
                    <li><strong>比赛形式</strong>：团队接力对抗</li>
                    <li><strong>计分规则</strong>：双方队伍分数全程累加、不归零，<span className="text-orange-600 font-bold">率先累计达到100分的队伍获胜</span></li>
                  </ul>
                  <p className="font-bold mt-2">比赛阶段（7个）：</p>
                  <div className="text-center py-2 text-xs bg-gray-50 rounded">
                    单打① → 单打② → 单打③ → 单打④ → 双打 → 单打⑤ → 单打⑥
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>强制换人节点</strong>：当任意一方累计达到 <span className="font-bold">15、30、45、60、75、90分</span> 时，双方必须更换选手进入下一阶段</li>
                    <li><strong>队长职责</strong>：每队指定一名队长，由队长决定队员在7个阶段中的出场顺序</li>
                    <li><strong>出场限制</strong>：每名队员在7个阶段中<span className="text-orange-600 font-bold">恰好出场2次</span></li>
                  </ul>
                </div>
              </>
            )}
            <div className="mt-4 pt-3 border-t">
              <button onClick={() => setShowRules('')}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
