import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

interface Team {
  id: string
  tournament_id: string
  name: string
  captain_player_id: string
  require_review: boolean
  max_members: number
  created_at: string
}

interface TournamentPlayer {
  id: string
  profile_id: string | null
  player_name: string
  team_id: string | null
  role: string | null
}

interface TeamManagerProps {
  tournamentId: string
  tournamentName: string
  onUpdate: () => void
}

export function TeamManager({ tournamentId, tournamentName, onUpdate }: TeamManagerProps) {
  const { user: currentUser } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<TournamentPlayer[]>([])
  const [myPlayer, setMyPlayer] = useState<TournamentPlayer | null>(null)
  const [myTeam, setMyTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [requestedTeamId, setRequestedTeamId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const { data: t } = await supabase.from('teams').select('*').eq('tournament_id', tournamentId)
    setTeams(t || [])

    const { data: p } = await supabase.from('tournament_players')
      .select('id, profile_id, player_name, team_id, role')
      .eq('tournament_id', tournamentId)
    setPlayers(p || [])

    if (currentUser) {
      const me = (p || []).find(pl => pl.profile_id === currentUser.id)
      setMyPlayer(me || null)
      if (me?.team_id) {
        const myT = (t || []).find(team => team.id === me.team_id)
        setMyTeam(myT || null)
      } else {
        setMyTeam(null)
      }
    }
    setLoading(false)
  }, [tournamentId, currentUser])

  useEffect(() => { loadData() }, [loadData])

  // Players not in any team, exclude current user
  const availablePlayers = players.filter(p => !p.team_id)
  // Teams with room
  const joinableTeams = teams.filter(t => {
    const count = players.filter(p => p.team_id === t.id).length
    return count < t.max_members
  })

  // ── Create team ──
  const handleCreateTeam = async () => {
    if (!myPlayer || !newTeamName.trim()) return
    setCreating(true)
    setError('')

    const name = newTeamName.trim()
    // Check duplicate name
    if (teams.some(t => t.name === name)) {
      setError('队伍名已存在'); setCreating(false); return
    }

    const { data: newTeam, error: err } = await supabase.from('teams').insert({
      tournament_id: tournamentId,
      name,
      captain_player_id: myPlayer.id,
      max_members: 5,
      require_review: true,
    }).select().single()

    if (err) { setError(err.message); setCreating(false); return }

    // Auto-join creator as captain — set both team_id (for TeamManager) and team_name (for SetupPage)
    await supabase.from('tournament_players')
      .update({ team_id: newTeam.id, role: 'captain', team_name: name })
      .eq('id', myPlayer.id)

    setNewTeamName('')
    setCreating(false)
    await loadData()
    onUpdate()
  }

  // ── Join team ──
  const handleJoin = async (teamId: string) => {
    if (!myPlayer) return
    setRequestedTeamId(teamId)
    setError('')

    const team = teams.find(t => t.id === teamId)
    if (!team) return

    const memberCount = players.filter(p => p.team_id === teamId).length
    if (memberCount >= team.max_members) {
      setError('该队伍已满'); setRequestedTeamId(null); return
    }

    if (team.require_review) {
      // Request to join — send notification to captain
      await supabase.from('tournament_players')
        .update({ team_id: teamId, role: 'applicant', team_name: team.name })
        .eq('id', myPlayer.id)

      // Look up captain's profile_id (captain_player_id is tournament_players.id, need profiles.id for notification)
      const { data: captainPlayer } = await supabase
        .from('tournament_players').select('profile_id').eq('id', team.captain_player_id).single()

      await supabase.from('notifications').insert({
        user_id: captainPlayer?.profile_id || team.captain_player_id,
        user_name: myPlayer.player_name,
        type: 'team_join_request',
        title: '入队申请',
        content: `${myPlayer.player_name} 申请加入您的队伍「${team.name}」(${tournamentName})`,
        related_id: tournamentId,
      })
    } else {
      // Auto join
      await supabase.from('tournament_players')
        .update({ team_id: teamId, role: 'member', team_name: team.name })
        .eq('id', myPlayer.id)
    }

    setRequestedTeamId(null)
    await loadData()
    onUpdate()
  }

  // ── Leave team ──
  const handleLeave = async () => {
    if (!myPlayer || !myTeam) return
    if (!confirm(`确定退出「${myTeam.name}」吗？`)) return

    await supabase.from('tournament_players')
      .update({ team_id: null, role: 'member' })
      .eq('id', myPlayer.id)

    // Delete team if captain leaves and team has no members
    const members = players.filter(p => p.team_id === myTeam.id && p.id !== myPlayer.id)
    if (myTeam.captain_player_id === myPlayer.id) {
      if (members.length === 0) {
        await supabase.from('teams').delete().eq('id', myTeam.id)
      } else {
        // Transfer captain to next member
        await supabase.from('teams').delete().eq('id', myTeam.id)
        await supabase.from('tournament_players')
          .update({ team_id: null, role: 'member' })
          .eq('team_id', myTeam.id)
      }
    }

    await loadData()
    onUpdate()
  }

  // ── Captain: remove member ──
  const handleRemoveMember = async (playerId: string) => {
    if (!confirm('确定移除该成员？')) return
    await supabase.from('tournament_players')
      .update({ team_id: null, role: 'member' })
      .eq('id', playerId)
    await loadData()
    onUpdate()
  }

  // ── Captain: approve applicant ──
  const handleApprove = async (playerId: string) => {
    await supabase.from('tournament_players')
      .update({ role: 'member' })
      .eq('id', playerId)
    await loadData()
  }

  // ── Captain: reject applicant ──
  const handleReject = async (playerId: string) => {
    await supabase.from('tournament_players')
      .update({ team_id: null, role: 'member' })
      .eq('id', playerId)
    await loadData()
  }

  // ── Captain: toggle require_review ──
  const handleToggleReview = async () => {
    if (!myTeam) return
    await supabase.from('teams')
      .update({ require_review: !myTeam.require_review })
      .eq('id', myTeam.id)
    await loadData()
  }

  // ── Captain: rename team ──
  const handleRename = async () => {
    if (!myTeam || !newTeamName.trim()) return
    if (teams.some(t => t.name === newTeamName.trim() && t.id !== myTeam.id)) {
      setError('队伍名已存在'); return
    }
    await supabase.from('teams')
      .update({ name: newTeamName.trim() })
      .eq('id', myTeam.id)
    setNewTeamName('')
    await loadData()
  }

  if (loading) return <div className="text-center py-4 text-gray-400 text-sm">加载队伍信息...</div>

  const isCaptain = myTeam && myPlayer && myTeam.captain_player_id === myPlayer.id
  const isApplicant = myPlayer?.role === 'applicant'

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm flex items-center gap-2">
        <span>👥</span> 队伍管理
      </div>

      <div className="p-4 space-y-4">
        {error && <p className="text-red-500 text-xs">{error}</p>}

        {/* ── My Team ── */}
        {myTeam && (
          <div className="border border-purple-200 rounded-lg overflow-hidden">
            <div className="bg-purple-50 px-3 py-2 border-b border-purple-100 flex items-center justify-between">
              <span className="font-bold text-sm text-purple-800">
                🏠 {myTeam.name}
                {isCaptain && <span className="text-xs text-purple-500 ml-2">(队长)</span>}
              </span>
              {!isCaptain && (
                <button onClick={handleLeave} className="text-xs text-red-400 hover:text-red-600">退出队伍</button>
              )}
            </div>

            {/* Captain controls */}
            {isCaptain && (
              <div className="px-3 py-2 bg-purple-50/50 border-b border-purple-100 space-y-2">
                {/* Rename */}
                <div className="flex gap-2">
                  <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                    placeholder="修改队伍名" maxLength={20}
                    className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-purple-400" />
                  <button onClick={handleRename} disabled={!newTeamName.trim()}
                    className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-40">
                    改名
                  </button>
                </div>

                {/* Toggle review + leave */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={myTeam.require_review} onChange={handleToggleReview} className="accent-purple-600" />
                    需要审核方可加入
                  </label>
                  <button onClick={handleLeave} className="text-xs text-red-400 hover:text-red-600">解散队伍</button>
                </div>
              </div>
            )}

            {/* Members */}
            {(() => {
              const members = players.filter(p => p.team_id === myTeam.id)
              const mCount = members.filter(m => m.role !== 'applicant').length
              const applicants = members.filter(m => m.role === 'applicant')

              return (
                <div className="divide-y">
                  {/* Regular members */}
                  {members.filter(m => m.role !== 'applicant').map(m => {
                    const isMe = m.id === myPlayer?.id
                    const isCap = m.id === myTeam!.captain_player_id
                    return (
                      <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>
                          {isCap && '👑 '}{m.player_name}
                          {isMe && <span className="text-gray-400 text-xs ml-1">(我)</span>}
                        </span>
                        {isCaptain && !isCap && (
                          <button onClick={() => handleRemoveMember(m.id)} className="text-xs text-red-400 hover:text-red-600">移除</button>
                        )}
                      </div>
                    )
                  })}

                  {/* Applicants (captain only) */}
                  {isCaptain && applicants.length > 0 && (
                    <div className="bg-yellow-50 px-3 py-2">
                      <p className="text-xs text-yellow-600 font-medium mb-1">⏳ 待审核 ({applicants.length})</p>
                      {applicants.map(a => (
                        <div key={a.id} className="flex items-center justify-between py-1 text-sm">
                          <span>{a.player_name}</span>
                          <div className="flex gap-2">
                            <button onClick={() => handleApprove(a.id)}
                              className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded hover:bg-green-200">同意</button>
                            <button onClick={() => handleReject(a.id)}
                              className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded hover:bg-red-200">拒绝</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Capacity */}
                  <div className="px-3 py-1.5 text-[10px] text-gray-400">
                    成员 {mCount}/{myTeam.max_members}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Applicant status ── */}
        {isApplicant && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
            <p className="text-sm text-yellow-700">⏳ 已提交入队申请，等待队长审核</p>
            <button onClick={handleLeave} className="text-xs text-red-400 hover:text-red-600 mt-1">撤销申请</button>
          </div>
        )}

        {/* ── Create team ── */}
        {!myTeam && !isApplicant && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-2">创建一个新队伍，你就是队长</p>
            <div className="flex gap-2">
              <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                placeholder="输入队伍名" maxLength={20}
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400" />
              <button onClick={handleCreateTeam} disabled={creating || !newTeamName.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40">
                {creating ? '...' : '创建'}
              </button>
            </div>
          </div>
        )}

        {/* ── Available teams to join ── */}
        {!myTeam && !isApplicant && joinableTeams.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">可加入的队伍</p>
            <div className="space-y-2">
              {joinableTeams.filter(t => t.captain_player_id !== myPlayer?.id).map(team => {
                const count = players.filter(p => p.team_id === team.id && p.role !== 'applicant').length
                return (
                  <div key={team.id} className="flex items-center justify-between px-3 py-2 border rounded-lg">
                    <div>
                      <span className="text-sm font-medium">{team.name}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {count}/{team.max_members}人
                        {team.require_review ? ' · 需审核' : ' · 直接加入'}
                      </span>
                    </div>
                    <button onClick={() => handleJoin(team.id)} disabled={requestedTeamId === team.id}
                      className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-40">
                      {requestedTeamId === team.id ? '...' : team.require_review ? '申请加入' : '加入'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── No teams yet ── */}
        {!myTeam && !isApplicant && teams.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-2">还没有队伍，快来创建第一个吧！</p>
        )}
      </div>
    </div>
  )
}