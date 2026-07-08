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
  const [editingBio, setEditingBio] = useState(false)
  const [editingBlade, setEditingBlade] = useState(false)
  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [blade, setBlade] = useState('')
  const [forehandRubber, setForehandRubber] = useState('')
  const [backhandRubber, setBackhandRubber] = useState('')
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
    if (p) { setTargetProfile(p); setNickname(p.nickname); setBio(p.bio || ''); setBlade(p.blade || ''); setForehandRubber(p.forehand_rubber || ''); setBackhandRubber(p.backhand_rubber || '') }

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

  async function saveBio() {
    if (!me) return
    await supabase.from('profiles').update({ bio }).eq('id', me.id)
    setEditingBio(false)
    setTargetProfile(prev => prev ? { ...prev, bio } : prev)
  }

  async function saveBlade() {
    if (!me) return
    await supabase.from('profiles').update({ blade, forehand_rubber: forehandRubber, backhand_rubber: backhandRubber }).eq('id', me.id)
    setEditingBlade(false)
    setTargetProfile(prev => prev ? { ...prev, blade, forehand_rubber: forehandRubber, backhand_rubber: backhandRubber } : prev)
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

  // 最近10场（含正在进行中的比赛）
  const recentMatches = matches.slice(0, 10)
  const recentWins = recentMatches.filter(m => m.winner_name === targetProfile?.nickname).length
  const recentMatchCount = recentMatches.length

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

      {/* 个人宣言 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm">📝 个人宣言</h2>
          {isMe && !editingBio && (
            <button onClick={() => setEditingBio(true)}
              className="text-xs text-blue-600 hover:underline">
              {bio ? '编辑' : '添加'}
            </button>
          )}
        </div>
        {editingBio ? (
          <div className="space-y-2">
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              placeholder="写一句你的个人宣言..."
              rows={3} maxLength={200}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex gap-2">
              <button onClick={saveBio}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">保存</button>
              <button onClick={() => { setEditingBio(false); setBio(targetProfile.bio || '') }}
                className="px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">取消</button>
            </div>
          </div>
        ) : bio ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{bio}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">暂无宣言</p>
        )}
      </div>

      {/* 数据概览 */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <p className="text-lg font-bold text-blue-600">{targetProfile.elo_score}</p>
          <p className="text-xs text-gray-400 mt-0.5">ELO 积分</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <p className="text-lg font-bold text-green-600">{wins}</p>
          <p className="text-xs text-gray-400 mt-0.5">胜场</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <p className="text-lg font-bold text-gray-600">{total}</p>
          <p className="text-xs text-gray-400 mt-0.5">总场数</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <p className={`text-lg font-bold ${total > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
            {total > 0 ? Math.round(wins / total * 100) + '%' : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">胜率</p>
        </div>
      </div>

      {/* 最近10场胜率 */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">📊 最近10场</h2>
          <p className={`text-lg font-bold ${recentWins > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
            {recentMatchCount > 0 ? Math.round(recentWins / recentMatchCount * 100) + '%' : '—'}
          </p>
        </div>
        <div className="flex items-center gap-1 mt-2">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-green-400 to-purple-500 rounded-full transition-all"
              style={{ width: recentMatchCount > 0 ? (recentWins / recentMatchCount * 100) + '%' : '0%' }} />
          </div>
          <span className="text-xs text-gray-400 ml-2">{recentWins}胜/{recentMatchCount - recentWins}负</span>
        </div>
      </div>

      {/* 球拍配置 */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">🏓 球拍配置</h2>
          {isMe && !editingBlade && (
            <button onClick={() => setEditingBlade(true)}
              className="text-xs text-blue-600 hover:underline">
              {blade || forehandRubber || backhandRubber ? '编辑' : '添加'}
            </button>
          )}
        </div>
        {editingBlade ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">底板</label>
              <input value={blade} onChange={e => setBlade(e.target.value)}
                placeholder="如：蝴蝶 Viscaria"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">正手胶皮</label>
              <input value={forehandRubber} onChange={e => setForehandRubber(e.target.value)}
                placeholder="如：狂飙3 蓝省"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">反手胶皮</label>
              <input value={backhandRubber} onChange={e => setBackhandRubber(e.target.value)}
                placeholder="如：Tenergy 05 FX"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveBlade}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">保存</button>
              <button onClick={() => {
                setEditingBlade(false)
                setBlade(targetProfile.blade || '')
                setForehandRubber(targetProfile.forehand_rubber || '')
                setBackhandRubber(targetProfile.backhand_rubber || '')
              }}
                className="px-4 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">取消</button>
            </div>
          </div>
        ) : blade || forehandRubber || backhandRubber ? (
          <div className="space-y-2">
            {blade && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-14 shrink-0">底板</span>
                <span className="text-sm font-medium">{blade}</span>
              </div>
            )}
            {forehandRubber && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-14 shrink-0">正手</span>
                <span className="text-sm"><span className="text-red-500">●</span> {forehandRubber}</span>
              </div>
            )}
            {backhandRubber && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-14 shrink-0">反手</span>
                <span className="text-sm"><span className="text-blue-500">●</span> {backhandRubber}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">未设置球拍配置</p>
        )}
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
