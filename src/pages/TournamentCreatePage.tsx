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
  const [category, setCategory] = useState<'singles' | 'team'>('singles')
  const [format, setFormat] = useState<TournamentFormat>('round_robin')
  const [description, setDescription] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [setsToWin, setSetsToWin] = useState(3)
  const [startTime, setStartTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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

    const config = { sets_to_win: setsToWin }

    const startISO = startTime ? new Date(startTime).toISOString() : null

    const { data, error: err } = await supabase
      .from('tournaments')
      .insert({
        name,
        category,
        format,
        config,
        description: description || null,
        max_players: maxPlayers,
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
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setCategory('singles')}
              className={`p-3 rounded-lg border text-left transition ${
                category === 'singles'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
              <p className="font-medium text-sm">🏓 单人赛</p>
              <p className="text-xs text-gray-500 mt-0.5">选手个人参赛，按个人排名</p>
            </button>
            <button type="button" onClick={() => setCategory('team')}
              className={`p-3 rounded-lg border text-left transition ${
                category === 'team'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
              <p className="font-medium text-sm">👥 团体赛</p>
              <p className="text-xs text-gray-500 mt-0.5">组队参赛，每队≥2人</p>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">赛制</label>
          <div className="grid grid-cols-2 gap-2">
            {engines.map(e => (
              <button key={e.type} type="button" onClick={() => setFormat(e.type)}
                className={`p-3 rounded-lg border text-left transition ${
                  format === e.type
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="font-medium text-sm">{e.name}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">参赛人数</label>
            <input type="number" min="2" max="128" value={maxPlayers}
              onChange={e => setMaxPlayers(parseInt(e.target.value) || 8)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">每场胜局数</label>
            <input type="number" min="1" max="9" value={setsToWin}
              onChange={e => setSetsToWin(parseInt(e.target.value) || 3)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
    </div>
  )
}
