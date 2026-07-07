import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getEngine } from '../lib/tournament'
import type { TournamentFormat } from '../lib/tournament'
import type { Tournament } from '../types'

interface PlayerEntry {
  id: string
  name: string
  seed: number
  group_name?: string
  team_name?: string
}

export function TournamentSetupPage() {
  const { id } = useParams()
  const { user: profile } = useAuth()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [players, setPlayers] = useState<PlayerEntry[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; nickname: string }[]>([])
  const [manualName, setManualName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 团体赛：当前选择要加入的队伍
  const [selectedTeam, setSelectedTeam] = useState('')
  const [newTeamName, setNewTeamName] = useState('')

  useEffect(() => {
    if (id) loadTournament()
  }, [id])

  async function loadTournament() {
    const { data: t } = await supabase.from('tournaments').select('*').eq('id', id).single()
    if (t) setTournament(t)
    const { data: p } = await supabase.from('tournament_players').select('*').eq('tournament_id', id)
    if (p) setPlayers(p.map(p => ({
      id: p.id, name: p.player_name, seed: p.seed,
      group_name: p.group_name || undefined,
      team_name: p.team_name || undefined,
    })))
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

    // 团体赛必须有队伍
    const teamName = tournament.category === 'team' ? selectedTeam : undefined
    if (tournament.category === 'team' && !teamName) { setError('请先选择或创建一个队伍'); return }

    const { data, error: err } = await supabase
      .from('tournament_players')
      .insert({
        tournament_id: id,
        profile_id: profileId || null,
        player_name: name,
        seed: players.length + 1,
        team_name: teamName || null,
        group_name: teamName || null, // 团体赛用 team_name 同时做 group_name
      })
      .select()
      .single()

    if (err) { setError(err.message); return }
    setPlayers([...players, { id: data.id, name, seed: data.seed, team_name: teamName, group_name: teamName }])
    setError('')
  }

  async function removePlayer(playerId: string) {
    await supabase.from('tournament_players').delete().eq('id', playerId)
    setPlayers(players.filter(p => p.id !== playerId))
  }

  // 获取已有队伍列表
  const teamList = tournament?.category === 'team'
    ? [...new Set(players.map(p => p.team_name || '').filter(Boolean))]
    : []

  function getTeamPlayers(team: string) {
    return players.filter(p => (p.team_name || p.group_name) === team)
  }

  async function generateMatches() {
    if (!tournament || !id || !profile) { setError('请先登录'); return }
    if (players.length < 2) { setError('至少需要2名选手'); return }

    // 团体赛：检查每队人数 ≥ 2
    if (tournament.category === 'team') {
      const teamCounts = new Map<string, number>()
      players.forEach(p => {
        const tn = p.team_name || p.group_name || ''
        if (tn) teamCounts.set(tn, (teamCounts.get(tn) || 0) + 1)
      })
      for (const [team, count] of teamCounts) {
        if (count < 2) { setError(`队伍「${team}」只有 ${count} 人，团体赛每队至少需要 2 人`); return }
      }
      if (teamCounts.size < 2) { setError('团体赛至少需要 2 支队伍'); return }
    }

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
      created_by: profile.id,
    }))

    const { error: err } = await supabase.from('matches').insert(inserts)
    if (err) { setError(err.message); return }

    // 更新赛事状态
    await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', id)
    navigate(`/tournaments/${id}`)
  }

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>
  if (!tournament) return <div className="text-center py-10 text-gray-400">赛事不存在</div>

  const isTeam = tournament.category === 'team'

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link to={`/tournaments/${id}`} className="text-sm text-blue-600">&larr; 返回赛事</Link>
        <h1 className="text-xl font-bold mt-1">配置赛事</h1>
        <p className="text-sm text-gray-500">
          {tournament.name} — {isTeam ? '👥 团体赛' : '🏓 单人赛'} — {players.length}人
        </p>
      </div>

      {/* 添加选手 */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h2 className="font-medium">{isTeam ? '添加队员' : '添加选手'}</h2>

        {/* 团体赛：队伍选择 */}
        {isTeam && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">选择队伍</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {teamList.map(team => (
                <button key={team} type="button" onClick={() => setSelectedTeam(team)}
                  className={`px-3 py-1 text-sm rounded-full border transition ${
                    selectedTeam === team
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}>
                  {team} ({getTeamPlayers(team).length}人)
                </button>
              ))}
              {teamList.length > 0 && (
                <button type="button" onClick={() => setSelectedTeam('')}
                  className="px-3 py-1 text-sm rounded-full border border-gray-200 text-gray-400 hover:border-red-300">
                  取消选择
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                placeholder="输入新队伍名..."
                className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => {
                const name = newTeamName.trim()
                if (!name) return
                if (teamList.includes(name)) { setError('队伍名已存在'); return }
                setSelectedTeam(name)
                setNewTeamName('')
                setError('')
              }}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                创建队伍
              </button>
            </div>
            {selectedTeam && (
              <p className="text-xs text-blue-600 mt-1">
                当前选中队伍：<strong>{selectedTeam}</strong>（{getTeamPlayers(selectedTeam).length}人），添加的选手将加入此队
              </p>
            )}
            {!selectedTeam && teamList.length === 0 && (
              <p className="text-xs text-orange-500 mt-1">请先创建队伍，再添加队员</p>
            )}
          </div>
        )}

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
            placeholder={isTeam ? '手动输入队员名...' : '手动输入选手名...'}
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
          <span className="font-medium text-sm">{isTeam ? '队员列表（按队伍）' : '参赛选手'}</span>
          <span className="text-sm text-gray-500">{players.length}/{tournament.max_players || '∞'}</span>
        </div>
        {players.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">还没有选手，在上方添加</p>
        ) : isTeam ? (
          <div className="divide-y">
            {/* 按队伍分组显示 */}
            {teamList.map(team => (
              <div key={team}>
                <div className="px-4 py-2 bg-blue-50 text-sm font-medium text-blue-700 flex justify-between">
                  <span>👥 {team}</span>
                  <span className={`text-xs ${getTeamPlayers(team).length >= 2 ? 'text-green-600' : 'text-red-500'}`}>
                    {getTeamPlayers(team).length}人
                    {getTeamPlayers(team).length < 2 && ' ⚠️需≥2人'}
                  </span>
                </div>
                {getTeamPlayers(team).map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5 pl-8">
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
            ))}
            {/* 未分配队伍的选手 */}
            {players.filter(p => !(p.team_name || p.group_name)).length > 0 && (
              <div>
                <div className="px-4 py-2 bg-red-50 text-sm font-medium text-red-600">未分配队伍</div>
                {players.filter(p => !(p.team_name || p.group_name)).map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5 pl-8">
                    <span className="text-sm">{p.name}</span>
                    <button onClick={() => removePlayer(p.id)} className="text-xs text-red-500 hover:text-red-700">
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
