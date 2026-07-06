import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Profile, Match, EloHistory } from '../types'

export function ProfilePage() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const targetId = id || me?.id

  const [targetProfile, setTargetProfile] = useState<Profile | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [eloHistory, setEloHistory] = useState<EloHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState('')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSubmitting, setPwSubmitting] = useState(false)

  const isMe = me?.id === targetId

  useEffect(() => {
    if (targetId) loadProfile(targetId)
  }, [targetId])

  async function loadProfile(userId: string) {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (p) { setTargetProfile(p); setNickname(p.nickname) }

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
    await supabase.from('profiles').update({ nickname }).eq('id', me.id)
    setEditing(false)
    const updated = { ...me, nickname }
    localStorage.setItem('pingpong_user', JSON.stringify(updated))
    loadProfile(me.id)
    window.location.reload()
  }

  async function handleChangePassword() {
    setPwError('')
    if (!newPw || newPw.length < 4) { setPwError('新密码至少4位'); return }
    if (newPw !== confirmPw) { setPwError('两次新密码不一致'); return }
    setPwSubmitting(true)
    const { data, error } = await supabase.rpc('change_password', {
      p_user_id: me!.id, p_old_password: oldPw, p_new_password: newPw,
    })
    if (error) { setPwError(error.message); setPwSubmitting(false); return }
    const result = data as any
    if (result.error) { setPwError(result.error); setPwSubmitting(false); return }
    // 成功：清空登录态，跳转到登录页
    localStorage.removeItem('pingpong_user')
    window.location.href = '/login'
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
                <div className="flex gap-2">
                  <button onClick={saveProfile} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">保存</button>
                  <button onClick={() => setEditing(false)} className="px-3 py-1 border rounded text-xs">取消</button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-lg font-bold">{targetProfile.nickname}</h1>
                <p className="text-xs text-gray-400">@{targetProfile.username}</p>
                {isMe && <button onClick={() => setEditing(true)} className="text-xs text-blue-600 mt-1">编辑昵称</button>}
                {isMe && <button onClick={() => setShowPasswordModal(true)} className="text-xs text-orange-600 mt-1 ml-2 hover:underline">修改密码</button>}
                {!isMe && (
                  <Link to={`/chat?user=${targetProfile.id}`}
                    className="inline-block mt-2 px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                    💬 私聊
                  </Link>
                )}
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
              const isWinner = m.winner_name === targetProfile.nickname
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

      {/* 修改密码弹窗 */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">修改密码</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">原密码</label>
                <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">新密码</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">确认新密码</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              {pwError && <p className="text-red-500 text-sm">{pwError}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
                <button onClick={handleChangePassword} disabled={pwSubmitting}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  {pwSubmitting ? '处理中...' : '确认修改'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
