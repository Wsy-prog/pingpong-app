import { FormEvent, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export function MatchCreatePage() {
  const { user: profile } = useAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState<{ id: string; nickname: string }[]>([])
  const [search1, setSearch1] = useState('')
  const [search2, setSearch2] = useState('')
  const [selected1, setSelected1] = useState<{ id: string; name: string } | null>(null)
  const [selected2, setSelected2] = useState<{ id: string; name: string } | null>(null)
  const [player1Name, setPlayer1Name] = useState('')
  const [player2Name, setPlayer2Name] = useState('')
  const [matchDate, setMatchDate] = useState('')
  const [location, setLocation] = useState('')
  const [rated, setRated] = useState(true)
  const [predictionEnabled, setPredictionEnabled] = useState(false)

  // 搜索用户
  useEffect(() => {
    const q = search1 || search2
    if (!q) { setUsers([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname')
        .ilike('nickname', `%${q}%`)
        .limit(10)
      if (data) setUsers(data)
    }, 300)
    return () => clearTimeout(timer)
  }, [search1, search2])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setSubmitting(true)
    setError('')

    const name1 = selected1?.name || player1Name
    const name2 = selected2?.name || player2Name
    if (!name1 || !name2) {
      setError('请填写两位选手')
      setSubmitting(false)
      return
    }

    const { data, error: err } = await supabase
      .from('matches')
      .insert({
        title: `${name1} vs ${name2}`,
        player1_id: selected1?.id || null,
        player2_id: selected2?.id || null,
        player1_name: name1,
        player2_name: name2,
        match_date: matchDate || null,
        location: location || null,
        rated,
        prediction_enabled: predictionEnabled,
        created_by: profile.id,
      })
      .select()
      .single()

    if (err) {
      setError(err.message)
      setSubmitting(false)
      return
    }

    // 若开启竞猜，自动创建 prediction_event
    if (predictionEnabled) {
      await supabase.from('prediction_events').insert({
        title: `${name1} vs ${name2}`,
        event_type: 'platform_match',
        match_id: data.id,
        options: [
          { label: `${name1} 获胜`, value: 'player1' },
          { label: `${name2} 获胜`, value: 'player2' },
        ],
        deadline: matchDate || new Date(Date.now() + 7 * 86400000).toISOString(),
        created_by: profile.id,
      })
    }

    navigate(`/matches/${data.id}`)
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-6">创建比赛</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 选手1 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">选手 1</label>
          {selected1 ? (
            <div className="flex items-center gap-2 p-2 border rounded-lg bg-green-50">
              <span className="flex-1">{selected1.name}</span>
              <button type="button" onClick={() => { setSelected1(null); setSearch1('') }}
                className="text-sm text-red-500">取消</button>
            </div>
          ) : (
            <input value={search1} onChange={e => setSearch1(e.target.value)}
              placeholder="搜索用户名，或手动输入..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
          {search1 && !selected1 && (
            <div className="mt-1 border rounded-lg overflow-hidden">
              {users.filter(u => u.id !== selected2?.id).map(u => (
                <button type="button" key={u.id}
                  onClick={() => { setSelected1({ id: u.id, name: u.nickname }); setSearch1('') }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                  {u.nickname}
                </button>
              ))}
              <button type="button"
                onClick={() => { setPlayer1Name(search1); setSelected1({ id: '', name: search1 }); setSearch1('') }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-blue-600 border-t">
                使用 "{search1}" 作为选手名
              </button>
            </div>
          )}
        </div>

        {/* 选手2 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">选手 2</label>
          {selected2 ? (
            <div className="flex items-center gap-2 p-2 border rounded-lg bg-green-50">
              <span className="flex-1">{selected2.name}</span>
              <button type="button" onClick={() => { setSelected2(null); setSearch2('') }}
                className="text-sm text-red-500">取消</button>
            </div>
          ) : (
            <input value={search2} onChange={e => setSearch2(e.target.value)}
              placeholder="搜索用户名，或手动输入..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
          {search2 && !selected2 && (
            <div className="mt-1 border rounded-lg overflow-hidden">
              {users.filter(u => u.id !== selected1?.id).map(u => (
                <button type="button" key={u.id}
                  onClick={() => { setSelected2({ id: u.id, name: u.nickname }); setSearch2('') }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                  {u.nickname}
                </button>
              ))}
              <button type="button"
                onClick={() => { setPlayer2Name(search2); setSelected2({ id: '', name: search2 }); setSearch2('') }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-blue-600 border-t">
                使用 "{search2}" 作为选手名
              </button>
            </div>
          )}
        </div>

        {/* 时间 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">比赛时间（可选）</label>
          <input type="datetime-local" value={matchDate} onChange={e => setMatchDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* 地点 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">地点（可选）</label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="如：社区乒乓球室"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* 积分开关 */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={rated} onChange={e => setRated(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded" />
          <span className="text-sm text-gray-700">结算 ELO 积分</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={predictionEnabled} onChange={e => setPredictionEnabled(e.target.checked)}
            className="rounded border-gray-300" />
          <span className="text-sm text-gray-700">开放竞猜 🎯</span>
        </label>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={submitting}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          {submitting ? '创建中...' : '创建比赛'}
        </button>
      </form>
    </div>
  )
}
