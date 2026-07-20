import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getEngine } from '../lib/tournament'
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
  const [predictionEnabled, setPredictionEnabled] = useState(false)

  // 团体赛：当前选择要加入的队伍
  const [selectedTeam, setSelectedTeam] = useState('')
  const [newTeamName, setNewTeamName] = useState('')

  // 趣味团体赛：队长 + 阶段编排
  const [captain1, setCaptain1] = useState('')
  const [captain2, setCaptain2] = useState('')
  const [stageOrder, setStageOrder] = useState<{ stage: number; type: string; p1: string; p2: string }[]>([])

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

    // 最低人数验证
    const minPlayers = tournament.category === 'singles' ? 2 : tournament.category === 'doubles' ? 4 : tournament.category === 'fun' ? (tournament.format === 'fun_100_individual' ? 2 : tournament.format === 'fun_100_team' ? 10 : tournament.format === 'fun_elo_handicap' ? 2 : tournament.format === 'fun_blind_doubles' ? 4 : tournament.format === 'fun_arena' ? 3 : 2) : 6
    if (players.length < minPlayers) {
      setError(`${tournament.category === 'singles' ? '单人赛' : tournament.category === 'doubles' ? '双打' : '团体赛'}至少需要 ${minPlayers} 名选手`)
      return
    }

    // 团体赛：检查每队人数 ≥ 3
    if (tournament.category === 'team') {
      const teamCounts = new Map<string, number>()
      players.forEach(p => {
        const tn = p.team_name || p.group_name || ''
        if (tn) teamCounts.set(tn, (teamCounts.get(tn) || 0) + 1)
      })
      for (const [team, count] of teamCounts) {
        if (count < 3) { setError(`队伍「${team}」只有 ${count} 人，团体赛每队至少需要 3 人`); return }
      }
      if (teamCounts.size < 2) { setError('团体赛至少需要 2 支队伍'); return }
    }

    // 最低人数时绕过引擎，直接生成一场决胜赛
    if (players.length === minPlayers) {
      let p1Name: string, p2Name: string
      let extraConfig: Record<string, unknown> = {}

      if (tournament.category === 'singles') {
        p1Name = players[0].name
        p2Name = players[1].name
      } else if (tournament.category === 'doubles') {
        // 4人 → 2组双打 → 前2人 vs 后2人
        p1Name = `${players[0].name}/${players[1].name}`
        p2Name = `${players[2].name}/${players[3].name}`
      } else if (tournament.category === 'fun') {
        if (tournament.format === 'fun_100_individual') {
          p1Name = players[0].name
          p2Name = players[1].name
          extraConfig = { target_score: 100 }
        } else if (tournament.format === 'fun_elo_handicap') {
          p1Name = players[0].name;
          p2Name = players[1].name;
          // Calculate ELO handicap
          const { data: p1Profile } = await supabase.from('profiles').select('elo_score').eq('id', players[0].id).single();
          const { data: p2Profile } = await supabase.from('profiles').select('elo_score').eq('id', players[1].id).single();
          const elo1 = p1Profile?.elo_score || 1500;
          const elo2 = p2Profile?.elo_score || 1500;
          const diff = Math.abs(elo1 - elo2);
          const rawHandicap = Math.floor(diff / 50);
          const handicap = Math.min(rawHandicap, 15);
          const handicapPlayerId = elo1 < elo2 ? players[0].id : players[1].id;
          extraConfig = { target_score: 21, handicap_score: handicap, handicap_player_id: handicapPlayerId };
        } else if (tournament.format === 'fun_blind_doubles') {
          const shuffled = [...players].sort(() => Math.random() - 0.5);
          const team1Name = `${shuffled[0].name}/${shuffled[1].name}`;
          const team2Name = `${shuffled[2].name}/${shuffled[3].name}`;
          p1Name = team1Name;
          p2Name = team2Name;
          extraConfig = {
            sets_to_win: 3,
            teams: [
              { name: team1Name, player_ids: [shuffled[0].id, shuffled[1].id] },
              { name: team2Name, player_ids: [shuffled[2].id, shuffled[3].id] },
            ],
          };
        } else if (tournament.format === 'fun_arena') {
          const champion = players[0];
          const challengers = players.slice(1);
          p1Name = champion.name;
          p2Name = challengers[0]?.name || '(待定)';
          extraConfig = {
            sets_to_win: 3,
            arena_champion_name: champion.name,
            arena_streak: 0,
            challenge_order: challengers.map((c, i) => ({ challenger_name: c.name, order: i + 1 })),
          };
        } else {
          // fun_100_team: 2 teams of 5
          const teamNames = [...new Set(players.map(p => p.team_name || p.group_name || ''))].filter(Boolean)
          const t1 = teamNames[0] || '队伍1'
          const t2 = teamNames[1] || '队伍2'
          p1Name = t1
          p2Name = t2

          // 从 UI state 获取队长和阶段编排
          const t1Players = players.filter(p => (p.team_name || p.group_name) === t1)
          const t2Players = players.filter(p => (p.team_name || p.group_name) === t2)
          extraConfig = {
            target_score: 100,
            mode: 'team_relay',
            team1: { name: t1, captain: captain1 || t1Players[0]?.name, players: t1Players.map(p => p.name) },
            team2: { name: t2, captain: captain2 || t2Players[0]?.name, players: t2Players.map(p => p.name) },
            stages: stageOrder.length === 7 ? stageOrder : getDefaultStages(t1Players.map(p => p.name), t2Players.map(p => p.name)),
            current_stage: 0,
          }
        }
      } else {
        // 团体赛：2队对决
        const teamNames = [...new Set(players.map(p => p.team_name || p.group_name || ''))].filter(Boolean)
        p1Name = teamNames[0] || players[0].name
        p2Name = teamNames[1] || players[1].name
      }

      // 合并 extraConfig 到 tournament config
      if (Object.keys(extraConfig).length > 0) {
        await supabase.from('tournaments').update({ config: { ...tournament.config, ...extraConfig } }).eq('id', id)
      }

      // 盲盒双打：更新选手的 team_name
      if (tournament.format === 'fun_blind_doubles' && extraConfig.teams) {
        for (const team of extraConfig.teams as { name: string; player_ids: string[] }[]) {
          await supabase.from('tournament_players')
            .update({ team_name: team.name })
            .eq('tournament_id', id)
            .in('id', team.player_ids)
        }
      }

      // 获取选手名称 -> profile_id 映射
      const { data: tpData } = await supabase.from('tournament_players')
        .select('player_name, profile_id').eq('tournament_id', id)
      const nameToPid = new Map<string, string>()
      if (tpData) tpData.forEach(p => { if (p.profile_id) nameToPid.set(p.player_name, p.profile_id) })

      const { data: matchData, error: err } = await supabase.from('matches').insert({
        tournament_id: id,
        title: `${p1Name} vs ${p2Name}`,
        player1_name: p1Name,
        player2_name: p2Name,
        player1_id: nameToPid.get(p1Name.split('/')[0]) || null,
        player2_id: nameToPid.get(p2Name.split('/')[0]) || null,
        prediction_enabled: predictionEnabled,
        created_by: profile.id,
      })
      .select()
      .single()

      if (err) { setError(err.message); return }

      // 若开启竞猜，自动创建 prediction_event
      if (predictionEnabled && matchData) {
        await supabase.from('prediction_events').insert({
          title: `${p1Name} vs ${p2Name}`,
          event_type: 'platform_match',
          match_id: matchData.id,
          options: [
            { label: `${p1Name} 获胜`, value: 'player1' },
            { label: `${p2Name} 获胜`, value: 'player2' },
          ],
          deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
          created_by: profile.id,
        })
      }

      await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', id)
      navigate(`/tournaments/${id}`)
      return
    }

    const engine = getEngine(tournament.format)
    const validation = engine.validate(tournament.config as any, players.length)
    if (!validation.valid) { setError(validation.errors.join('; ')); return }

    const generated = engine.generateMatches(
      players.map(p => ({ id: p.id, name: p.name, seed: p.seed, group_name: p.group_name })),
      tournament.config as any
    )

    // 获取选手名称 -> profile_id 映射
    const { data: tpData } = await supabase.from('tournament_players')
      .select('player_name, profile_id').eq('tournament_id', id)
    const nameToPid = new Map<string, string>()
    if (tpData) tpData.forEach(p => { if (p.profile_id) nameToPid.set(p.player_name, p.profile_id) })

    // 批量插入比赛
    const inserts = generated.map(m => ({
      tournament_id: id,
      title: `${m.player1_name} vs ${m.player2_name}`,
      player1_name: m.player1_name,
      player2_name: m.player2_name,
      player1_id: nameToPid.get(m.player1_name.split('/')[0]) || null,
      player2_id: nameToPid.get(m.player2_name.split('/')[0]) || null,
      round: m.round || null,
      bracket_pos: m.bracket_pos || null,
      group_name: m.group_name || null,
      prediction_enabled: predictionEnabled,
      created_by: profile.id,
    }))

    const { data: insertedMatches, error: err2 } = await supabase.from('matches').insert(inserts).select()
    if (err2) { setError(err2.message); return }

    // 保存引擎产生的配置变更（如盲盒双打的 teams、擂台的 challenge_order）
    const engineConfig = tournament.config as any
    if (engineConfig.teams || engineConfig.challenge_order || engineConfig.arena_champion_name !== undefined) {
      await supabase.from('tournaments').update({ config: engineConfig }).eq('id', id)
    }

    // 盲盒双打：更新选手的 team_name
    if (tournament.format === 'fun_blind_doubles' && engineConfig.teams) {
      for (const team of engineConfig.teams) {
        await supabase.from('tournament_players')
          .update({ team_name: team.name })
          .eq('tournament_id', id)
          .in('id', team.player_ids)
      }
    }

    // 若开启竞猜，为所有比赛自动创建 prediction_event
    if (predictionEnabled && insertedMatches) {
      const eventInserts = insertedMatches.map((m: any) => ({
        title: `${m.player1_name} vs ${m.player2_name}`,
        event_type: 'platform_match',
        match_id: m.id,
        options: [
          { label: `${m.player1_name} 获胜`, value: 'player1' },
          { label: `${m.player2_name} 获胜`, value: 'player2' },
        ],
        deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
        created_by: profile.id,
      }))
      await supabase.from('prediction_events').insert(eventInserts)
    }

    // 更新赛事状态
    await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', id)
    navigate(`/tournaments/${id}`)
  }

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>
  if (!tournament) return <div className="text-center py-10 text-gray-400">赛事不存在</div>

  const isTeam = tournament.category === 'team'
  const isDoubles = tournament.category === 'doubles'
  const isFun = tournament.category === 'fun'
  const catLabel = isTeam ? '👥 团体赛' : isDoubles ? '🎯 双打' : isFun ? '🎪 趣味乒乓' : '🏓 单人赛'
  const minPlayers = isTeam ? 6 : isDoubles ? 4 : isFun ? (tournament.format === 'fun_100_individual' ? 2 : tournament.format === 'fun_100_team' ? 10 : tournament.format === 'fun_elo_handicap' ? 2 : tournament.format === 'fun_blind_doubles' ? 4 : tournament.format === 'fun_arena' ? 3 : 2) : 2

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link to={`/tournaments/${id}`} className="text-sm text-blue-600">&larr; 返回赛事</Link>
        <h1 className="text-xl font-bold mt-1">配置赛事</h1>
        <p className="text-sm text-gray-500">
          {tournament.name} — {catLabel} — {players.length}人
        </p>
      </div>

      {/* 添加选手 */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h2 className="font-medium">{isTeam ? '添加队员' : isDoubles ? '添加双打选手' : '添加选手'}</h2>

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
            placeholder={isTeam ? '手动输入队员名...' : isDoubles ? '手动输入双打选手名...' : '手动输入选手名...'}
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => { if (manualName.trim()) { addPlayer(manualName.trim()); setManualName('') }}}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            添加
          </button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      {/* 趣味团体赛：队长指定 + 阶段编排 */}
      {isFun && tournament.format === 'fun_100_team' && players.length >= 10 && (
        <FunTeamSetup
          players={players}
          captain1={captain1} setCaptain1={setCaptain1}
          captain2={captain2} setCaptain2={setCaptain2}
          stageOrder={stageOrder} setStageOrder={setStageOrder}
        />
      )}

      {/* 选手列表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex justify-between">
          <span className="font-medium text-sm">{isTeam ? '队员列表（按队伍）' : isDoubles ? '双打选手' : isFun ? (tournament.format === 'fun_100_team' ? '队员列表（每队5人）' : tournament.format === 'fun_elo_handicap' ? '参赛选手（2人）' : tournament.format === 'fun_blind_doubles' ? '参赛选手（4的倍数）' : tournament.format === 'fun_arena' ? '参赛选手（3~8人，第1位为初始擂主）' : '参赛选手') : '参赛选手'}</span>
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

      {/* 竞猜开关 + 生成对阵 */}
      {players.length >= minPlayers && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer bg-blue-50 rounded-xl p-3 border border-blue-100">
            <input type="checkbox" checked={predictionEnabled} onChange={e => setPredictionEnabled(e.target.checked)}
              className="rounded border-gray-300" />
            <span className="text-sm text-gray-700">🎯 为所有比赛开放竞猜（用户可投注预测胜负）</span>
          </label>
          <button onClick={generateMatches}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">
            生成赛程并开始赛事
          </button>
        </div>
      )}
    </div>
  )
}

// 7个阶段的类型定义
const STAGE_TYPES = ['单打', '单打', '单打', '单打', '双打', '单打', '单打']

function getDefaultStages(team1Players: string[], team2Players: string[]): { stage: number; type: string; p1: string; p2: string }[] {
  // 默认编排：每人出场2次，轮流上场
  const t1 = [...team1Players]
  const t2 = [...team2Players]
  const stages: { stage: number; type: string; p1: string; p2: string }[] = []

  // 简单默认：依次循环使用队员
  for (let i = 0; i < 7; i++) {
    stages.push({
      stage: i + 1,
      type: STAGE_TYPES[i],
      p1: t1[i % 5],
      p2: t2[i % 5],
    })
  }
  return stages
}

function FunTeamSetup({
  players, captain1, setCaptain1, captain2, setCaptain2,
  stageOrder, setStageOrder,
}: {
  players: { id: string; name: string; team_name?: string; group_name?: string }[]
  captain1: string; setCaptain1: (v: string) => void
  captain2: string; setCaptain2: (v: string) => void
  stageOrder: { stage: number; type: string; p1: string; p2: string }[]
  setStageOrder: (v: { stage: number; type: string; p1: string; p2: string }[]) => void
}) {
  const teamNames = [...new Set(players.map(p => p.team_name || p.group_name || ''))].filter(Boolean)
  const t1 = teamNames[0] || '队伍1'
  const t2 = teamNames[1] || '队伍2'
  const t1Players = players.filter(p => (p.team_name || p.group_name) === t1).map(p => p.name)
  const t2Players = players.filter(p => (p.team_name || p.group_name) === t2).map(p => p.name)

  // Auto-init stage order
  if (stageOrder.length !== 7 && t1Players.length === 5 && t2Players.length === 5) {
    setStageOrder(getDefaultStages(t1Players, t2Players))
  }

  // Count appearances per player
  function countAppearances(name: string): number {
    return stageOrder.filter(s => s.p1 === name || s.p2 === name).length
  }

  function updateStage(index: number, side: 'p1' | 'p2', value: string) {
    const updated = stageOrder.map((s, i) => i === index ? { ...s, [side]: value } : s)
    setStageOrder(updated)
  }

  const isValid = stageOrder.length === 7 && [...t1Players, ...t2Players].every(p => countAppearances(p) === 2)

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm space-y-4 border-2 border-orange-200">
      <h2 className="font-medium text-orange-700">⚙️ 百分团体大赛 — 队伍配置</h2>

      {/* 队长选择 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-sm font-bold text-blue-700 mb-2">{t1} 👑 队长</p>
          <div className="space-y-1">
            {t1Players.map(name => (
              <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="captain1" checked={captain1 === name} onChange={() => setCaptain1(name)}
                  className="text-blue-600" />
                {name}
              </label>
            ))}
          </div>
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-sm font-bold text-red-700 mb-2">{t2} 👑 队长</p>
          <div className="space-y-1">
            {t2Players.map(name => (
              <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="captain2" checked={captain2 === name} onChange={() => setCaptain2(name)}
                  className="text-red-600" />
                {name}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 阶段编排 */}
      <div>
        <p className="text-sm font-bold text-gray-700 mb-2">📋 7阶段出场编排（每人恰好出场2次）</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left">阶段</th>
                <th className="px-2 py-1.5 text-left">类型</th>
                <th className="px-2 py-1.5 text-left text-blue-600">{t1}</th>
                <th className="px-2 py-1.5 text-left text-red-600">{t2}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stageOrder.map((s, i) => (
                <tr key={i} className={i === 4 ? 'bg-yellow-50' : ''}>
                  <td className="px-2 py-1.5 font-medium">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${s.type === '双打' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {s.type}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={s.p1} onChange={e => updateStage(i, 'p1', e.target.value)}
                      className="w-full text-xs border rounded px-1 py-0.5">
                      {t1Players.map(p => (
                        <option key={p} value={p}>{p} ({countAppearances(p)}次)</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={s.p2} onChange={e => updateStage(i, 'p2', e.target.value)}
                      className="w-full text-xs border rounded px-1 py-0.5">
                      {t2Players.map(p => (
                        <option key={p} value={p}>{p} ({countAppearances(p)}次)</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={`text-xs mt-2 ${isValid ? 'text-green-600 font-medium' : 'text-red-500'}`}>
          {isValid ? '✅ 编排有效，每人恰好出场2次' : '⚠️ 请确保每名队员恰好出场2次'}
        </p>
      </div>
    </div>
  )
}
