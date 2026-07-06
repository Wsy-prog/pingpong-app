import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Profile, Match, EloHistory } from '../types'

export function ProfilePage() {
  const { id } = useParams()
  const { profile: me, refreshProfile } = useAuth()
  const targetId = id || me?.id

  const [targetProfile, setTargetProfile] = useState<Profile | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [eloHistory, setEloHistory] = useState<EloHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')

  const isMe = me?.id === targetId

  useEffect(() => {
    if (targetId) loadProfile(targetId)
  }, [targetId])

  async function loadProfile(userId: string) {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (p) { setTargetProfile(p); setNickname(p.nickname); setBio(p.bio || '') }

    const { data: m } = await supabase
      .from('matches')
      .select('*')
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(20)
    if (m) setMatches(m)

    const { data: eh } = await supabase
      .from('elo_history')
      .select('*')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (eh) setEloHistory(eh)

    setLoading(false)
  }

  async function saveProfile() {
    if (!me) return
    await supabase.from('profiles').update({ nickname, bio }).eq('id', me.id)
    setEditing(false)
    refreshProfile()
  }

  const wins = matches.filter(m => m.winner_name === targetProfile?.nickname).length
  const total = matches.filter(m => m.status === 'completed').length

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>
  if (!targetProfile) return <div className="text-center py-10 text-gray-400">用户不存在</div>

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* 用户信息 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
            {targetProfile.nickname[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1">
            {editing ? (
              <div className="space-y-2">
                <input value={nickname} onChange={e => setNickname(e.target.value)}
                  className="w-full px-2 py-1 border rounded text-sm" />
                <textarea value={bio} onChange={e => setBio(e.target.value)}
                  className="w-full px-2 py-1 border rounded text-sm" rows={2} />
                <div className="flex gap-2">
                  <button onClick={saveProfile} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">保存</button>
                  <button onClick={() => setEditing(false)} className="px-3 py-1 border rounded text-xs">取消</button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-lg font-bold">{targetProfile.nickname}</h1>
                {targetProfile.bio && <p className="text-sm text-gray-500">{targetProfile.bio}</p>}
                {isMe && <button onClick={() => setEditing(true)} className="text-xs text-blue-600 mt-1">编辑资料</button>}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 数据概览 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-blue-600">{targetProfile.elo_score}</p>
          <p className="text-xs text-gray-400 mt-1">ELO 积分</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-green-600">{wins}</p>
          <p className="text-xs text-gray-400 mt-1">胜场</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-600">{total}</p>
          <p className="text-xs text-gray-400 mt-1">总场数</p>
        </div>
      </div>

      {/* 积分变动历史 */}
      {eloHistory.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">积分变动</div>
          <div className="divide-y">
            {eloHistory.slice(0, 10).map(h => (
              <div key={h.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {h.delta > 0 ? `击败 #${h.opponent_id?.slice(0, 6)}` : `负于 #${h.opponent_id?.slice(0, 6)}`}
                </span>
                <span className={`font-bold ${h.delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {h.delta >= 0 ? '+' : ''}{h.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 比赛记录 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">比赛记录</div>
        {matches.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">暂无比赛记录</p>
        ) : (
          <div className="divide-y">
            {matches.map(m => {
              const isWinner = m.winner_name === (m.player1_id === targetId ? m.player1_name : m.player2_name)
              return (
                <Link key={m.id} to={`/matches/${m.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{m.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(m.created_at).toLocaleDateString('zh-CN')}
                      {m.rated && ' · 积分赛'}
                    </p>
                  </div>
                  <div className="text-right">
                    {m.status === 'completed' ? (
                      <span className={`text-xs font-medium ${isWinner ? 'text-green-600' : 'text-red-400'}`}>
                        {isWinner ? '胜' : '负'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">{m.status === 'in_progress' ? '进行中' : '未开始'}</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
