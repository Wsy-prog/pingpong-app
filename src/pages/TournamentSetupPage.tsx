import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getEngine } from '../lib/tournament'
import type { TournamentFormat } from '../lib/tournament'
import type { Tournament } from '../types'

export function TournamentSetupPage() {
  const { id } = useParams()
  const { user: profile } = useAuth()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [players, setPlayers] = useState<{ id: string; name: string; seed: number; group_name?: string }[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; nickname: string }[]>([])
  const [manualName, setManualName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) loadTournament()
  }, [id])

  async function loadTournament() {
    const { data: t } = await supabase.from('tournaments').select('*').eq('id', id).single()
    if (t) setTournament(t)
    const { data: p } = await supabase.from('tournament_players').select('*').eq('tournament_id', id)
    if (p) setPlayers(p.map(p => ({ id: p.id, name: p.player_name, seed: p.seed, group_name: p.group_name || undefined })))
    setLoading(false)
  }

  async function searchUsers(q: string) {
    setSearchTerm(q)
    if (q.length < 1) { setSearchResults([]); return }
    const { data } = await supabase.from('profiles').select('id, nickname').ilike('nickname', `%${q}%`).limit(10)
    if (data) setSearchResults(data)
  }

  async function addPlayer(name: string, profileId?: string) {
    if (!id || !tournament) return
    if (players.length >= (tournament.max_players || 999)) { setError('已达最大参赛人数'); return }
    if (players.some(p => p.name === name)) { setError('该选手已在赛事中'); return }

    const { data, error: err } = await supabase
      .from('tournament_players')
      .insert({
        tournament_id: id,
        profile_id: profileId || null,
        player_name: name,
        seed: players.length + 1,
      })
      .select()
      .single()

    if (err) { setError(err.message); return }
    setPlayers([...players, { id: data.id, name, seed: data.seed }])
    setError('')
  }

  async function removePlayer(playerId: string) {
    await supabase.from('tournament_players').delete().eq('id', playerId)
    setPlayers(players.filter(p => p.id !== playerId))
  }

  async function generateMatches() {
    if (!tournament || !id) return
    if (players.length < 2) { setError('至少需要2名选手'); return }

    const engine = getEngine(tournament.format)
    const validation = engine.validate(tournament.config as any, players.length)
    if (!validation.valid) { setError(validation.errors.join('; ')); return }

    const generated = engine.generateMatches(
      players.map(p => ({ id: p.id, name: p.name, seed: p.seed, group_name: p.group_name })),
      tournament.config as any
    )

    // 批量插入比赛
    const inserts = generated.map(m => ({
      tournament_id: id,
      title: `${m.player1_name} vs ${m.player2_name}`,
      player1_name: m.player1_name,
      player2_name: m.player2_name,
      round: m.round || null,
      bracket_pos: m.bracket_pos || null,
      group_name: m.group_name || null,
      created_by: profile!.id,
    }))

    const { error: err } = await supabase.from('matches').insert(inserts)
    if (err) { setError(err.message); return }

    // 更新赛事状态
    await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', id)
    navigate(`/tournaments/${id}`)
  }

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>
  if (!tournament) return <div className="text-center py-10 text-gray-400">赛事不存在</div>

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link to={`/tournaments/${id}`} className="text-sm text-blue-600">&larr; 返回赛事</Link>
        <h1 className="text-xl font-bold mt-1">配置赛事</h1>
        <p className="text-sm text-gray-500">{tournament.name} — {players.length}名选手</p>
      </div>

      {/* 添加选手 */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h2 className="font-medium">添加选手</h2>

        {/* 搜索已注册用户 */}
        <div>
          <input value={searchTerm} onChange={e => searchUsers(e.target.value)}
            placeholder="搜索已注册用户..."
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {searchResults.length > 0 && (
            <div className="mt-1 border rounded-lg overflow-hidden">
              {searchResults.map(u => (
                <button key={u.id} type="button" onClick={() => { addPlayer(u.nickname, u.id); setSearchTerm(''); setSearchResults([]) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                  {u.nickname}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 手动输入 */}
        <div className="flex gap-2">
          <input value={manualName} onChange={e => setManualName(e.target.value)}
            placeholder="手动输入选手名..."
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => { if (manualName.trim()) { addPlayer(manualName.trim()); setManualName('') }}}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            添加
          </button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      {/* 选手列表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex justify-between">
          <span className="font-medium text-sm">参赛选手</span>
          <span className="text-sm text-gray-500">{players.length}/{tournament.max_players || '∞'}</span>
        </div>
        {players.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">还没有选手，在上方添加</p>
        ) : (
          <div className="divide-y">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5">#{i + 1}</span>
                  <span className="text-sm">{p.name}</span>
                </div>
                <button onClick={() => removePlayer(p.id)} className="text-xs text-red-500 hover:text-red-700">
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 生成对阵 */}
      {players.length >= 2 && (
        <button onClick={generateMatches}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">
          生成赛程并开始赛事
        </button>
      )}
    </div>
  )
}
