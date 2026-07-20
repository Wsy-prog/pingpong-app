import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { FortuneItem, Announcement } from '../types'

interface UserInfo {
  id: string
  username: string
  nickname: string
  elo_score: number
  created_at: string
  match_count: number
}

export function AdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'users' | 'chat' | 'matchmaking' | 'fortune' | 'announcements' | 'prediction' | 'rewards' | 'coingrants'>('users')

  // 用户管理
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)

  // 聊天管理
  const [globalDays, setGlobalDays] = useState(2)
  const [privateDays, setPrivateDays] = useState(2)
  const [cleanType, setCleanType] = useState('global')
  const [cleanDays, setCleanDays] = useState(2)

  // 运势管理
  const [fortuneItems, setFortuneItems] = useState<FortuneItem[]>([])
  const [fortuneLoading, setFortuneLoading] = useState(false)
  const [fortuneContent, setFortuneContent] = useState('')
  const [fortuneCategory, setFortuneCategory] = useState('general')
  const [fortuneIsUnique, setFortuneIsUnique] = useState(false)
  const [editingFortuneId, setEditingFortuneId] = useState<string | null>(null)
  const [showFortuneForm, setShowFortuneForm] = useState(false)
  const [fortuneDeleteId, setFortuneDeleteId] = useState<string | null>(null)

  // 资讯管理
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [annLoading, setAnnLoading] = useState(false)
  const [annTitle, setAnnTitle] = useState('')
  const [annContent, setAnnContent] = useState('')
  const [annPriority, setAnnPriority] = useState('normal')
  const [annExpireDays, setAnnExpireDays] = useState(7)
  const [annHasExpiry, setAnnHasExpiry] = useState(false)
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null)
  const [showAnnForm, setShowAnnForm] = useState(false)
  const [annDeleteId, setAnnDeleteId] = useState<string | null>(null)

  // 快报设置
  const [maxFlashCount, setMaxFlashCount] = useState(5)

  useEffect(() => {
    loadUsers()
    loadConfig()
    loadFlashConfig()
  }, [])

  async function loadConfig() {
    const { data } = await supabase.from('chat_cleanup_config').select('*').eq('id', 1).single()
    if (data) {
      setGlobalDays(data.global_days)
      setPrivateDays(data.private_days)
    }
  }

  async function loadFlashConfig() {
    const { data } = await supabase.from('flash_config').select('max_count').eq('id', 1).maybeSingle()
    if (data) setMaxFlashCount(data.max_count)
  }

  async function saveConfig() {
    setError('')
    setSuccess('')
    const { error: err } = await supabase
      .from('chat_cleanup_config')
      .update({ global_days: globalDays, private_days: privateDays, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (err) { setError(err.message); return }
    setSuccess('自动清理配置已保存')
  }

  async function handleCleanup() {
    setError('')
    setSuccess('')
    const { data, error: err } = await supabase.rpc('cleanup_messages', {
      p_type: cleanType, p_days: cleanDays
    })
    if (err) { setError(err.message); return }
    const r = data as any
    if (r.error) { setError(r.error); return }
    setSuccess('已清理 ' + r.deleted + ' 条消息')
  }

  async function handleCleanupAll() {
    if (!confirm('确定要全部清空吗？不可恢复！')) return
    setError('')
    setSuccess('')
    const { data, error: err } = await supabase.rpc('cleanup_all_messages', {
      p_type: cleanType
    })
    if (err) { setError(err.message); return }
    const r = data as any
    if (r.error) { setError(r.error); return }
    setSuccess('已全部清理 ' + r.deleted + ' 条消息')
  }

  async function loadUsers() {
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (!profiles) { setLoading(false); return }
    const items: UserInfo[] = await Promise.all(
      profiles.map(async (p: any) => {
        const { count } = await supabase
          .from('matches').select('*', { count: 'exact', head: true })
          .or('player1_id.eq.' + p.id + ',player2_id.eq.' + p.id)
        return {
          id: p.id, username: p.username, nickname: p.nickname,
          elo_score: p.elo_score, created_at: p.created_at,
          match_count: count || 0,
        }
      })
    )
    setUsers(items)
    setLoading(false)
  }

  async function handleDeleteUser(targetId: string) {
    setError('')
    setSuccess('')
    const { data, error: err } = await supabase.rpc('admin_delete_user', {
      p_admin_id: user!.id, p_target_id: targetId,
    })
    if (err) { setError(err.message); return }
    const result = data as any
    if (result.error) { setError(result.error); return }
    setSuccess('用户已注销')
    setConfirmUserId(null)
    loadUsers()
  }

  async function handleCleanupMatchmaking() {
    setError(''); setSuccess('')
    const { data, error: err } = await supabase.rpc('cleanup_old_matchmaking')
    if (err) { setError(err.message); return }
    const r = data as any
    if (r.error) { setError(r.error); return }
    setSuccess('已清理 ' + r.deleted_posts + ' 条过期约球、' + r.deleted_responses + ' 条响应')
  }

  async function handleCleanupAllMatchmaking() {
    setError(''); setSuccess('')
    const ok = window.confirm('确定要清理所有约球吗？此操作不可撤销！')
    if (!ok) return
    const { data, error: err } = await supabase.rpc('cleanup_all_matchmaking')
    if (err) { setError(err.message); return }
    const r = data as any
    if (r.error) { setError(r.error); return }
    setSuccess('已清除所有约球：' + r.deleted_posts + ' 条帖子、' + r.deleted_responses + ' 条响应')
  }

  // ========== 运势管理 ==========
  async function loadFortuneItems() {
    setFortuneLoading(true)
    const { data } = await supabase.from('fortune_items').select('*').order('created_at', { ascending: false })
    if (data) setFortuneItems(data as FortuneItem[])
    setFortuneLoading(false)
  }

  function openFortuneForm(item?: FortuneItem) {
    if (item) {
      setFortuneContent(item.content)
      setFortuneCategory(item.category)
      setFortuneIsUnique(item.is_unique)
      setEditingFortuneId(item.id)
    } else {
      setFortuneContent('')
      setFortuneCategory('general')
      setFortuneIsUnique(false)
      setEditingFortuneId(null)
    }
    setShowFortuneForm(true)
    setError('')
    setSuccess('')
  }

  async function saveFortune() {
    setError('')
    setSuccess('')
    if (!fortuneContent.trim()) { setError('请输入运势内容'); return }

    if (editingFortuneId) {
      // 编辑：更新内容
      const { error: err } = await supabase.from('fortune_items').update({
        content: fortuneContent.trim(),
        category: fortuneCategory,
        updated_at: new Date().toISOString(),
      }).eq('id', editingFortuneId)
      if (err) { setError(err.message); return }
      setSuccess('运势内容已更新')
    } else {
      // 新增
      const { error: err } = await supabase.from('fortune_items').insert({
        content: fortuneContent.trim(),
        category: fortuneCategory,
        is_unique: fortuneIsUnique,
      })
      if (err) { setError(err.message); return }
      setSuccess('运势内容已添加')
    }
    setShowFortuneForm(false)
    loadFortuneItems()
  }

  async function toggleUnique(fortuneId: string, currentlyUnique: boolean) {
    setError(''); setSuccess('')
    if (!currentlyUnique) {
      // 设为唯一性 — 清除之前的领取记录
      const { error: err } = await supabase.from('fortune_items').update({
        is_unique: true,
        unique_claimed_by: null,
        updated_at: new Date().toISOString(),
      }).eq('id', fortuneId)
      if (err) { setError(err.message); return }
      setSuccess('已设为唯一性运势')
    } else {
      // 取消唯一性
      const { error: err } = await supabase.from('fortune_items').update({
        is_unique: false,
        unique_claimed_by: null,
        updated_at: new Date().toISOString(),
      }).eq('id', fortuneId)
      if (err) { setError(err.message); return }
      setSuccess('已取消唯一性')
    }
    loadFortuneItems()
  }

  async function deleteFortune(fortuneId: string) {
    setError(''); setSuccess('')
    const { error: err } = await supabase.from('fortune_items').delete().eq('id', fortuneId)
    if (err) { setError(err.message); return }
    setSuccess('运势内容已删除')
    setFortuneDeleteId(null)
    loadFortuneItems()
  }

  // ========== 资讯管理 ==========
  async function loadAnnouncements() {
    setAnnLoading(true)
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
    if (data) setAnnouncements(data as Announcement[])
    setAnnLoading(false)
  }

  function openAnnForm(item?: Announcement) {
    if (item) {
      setAnnTitle(item.title)
      setAnnContent(item.content)
      setAnnPriority(item.priority)
      setAnnHasExpiry(item.expires_at !== null)
      setAnnExpireDays(item.expires_at ? Math.ceil((new Date(item.expires_at).getTime() - Date.now()) / 86400000) : 7)
      setEditingAnnId(item.id)
    } else {
      setAnnTitle('')
      setAnnContent('')
      setAnnPriority('normal')
      setAnnHasExpiry(false)
      setAnnExpireDays(7)
      setEditingAnnId(null)
    }
    setShowAnnForm(true)
    setError('')
    setSuccess('')
  }

  async function saveAnnouncement() {
    setError(''); setSuccess('')
    if (!annTitle.trim()) { setError('请输入标题'); return }
    if (!annContent.trim()) { setError('请输入内容'); return }
    const expiresAt = annHasExpiry
      ? new Date(Date.now() + annExpireDays * 86400000).toISOString()
      : null

    if (editingAnnId) {
      const { error: err } = await supabase.from('announcements').update({
        title: annTitle.trim(),
        content: annContent.trim(),
        priority: annPriority,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }).eq('id', editingAnnId)
      if (err) { setError(err.message); return }
      setSuccess('资讯已更新')
    } else {
      const { error: err } = await supabase.from('announcements').insert({
        title: annTitle.trim(),
        content: annContent.trim(),
        priority: annPriority,
        created_by: user!.id,
        created_by_name: user!.nickname || user!.username,
        expires_at: expiresAt,
      })
      if (err) { setError(err.message); return }
      setSuccess('资讯已发布')
    }
    setShowAnnForm(false)
    loadAnnouncements()
  }

  async function deleteAnnouncement(id: string) {
    setError(''); setSuccess('')
    const { error: err } = await supabase.from('announcements').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setSuccess('资讯已删除')
    setAnnDeleteId(null)
    loadAnnouncements()
  }

  async function saveFlashConfig() {
    setError(''); setSuccess('')
    const { error: err } = await supabase.from('flash_config').upsert({
      id: 1, max_count: maxFlashCount,
    })
    if (err) { setError(err.message); return }
    setSuccess('快报上限已更新')
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">管理后台</h1>
          <p className="text-sm text-gray-500">管理员: {user?.nickname}</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">{success}</div>}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab('users')}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium ' + (tab === 'users' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
          用户管理
        </button>
        <button onClick={() => setTab('chat')}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium ' + (tab === 'chat' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
          聊天管理
        </button>
        <button onClick={() => setTab('matchmaking')}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium ' + (tab === 'matchmaking' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
          约球清理
        </button>
        <button onClick={() => { setTab('fortune'); loadFortuneItems() }}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium ' + (tab === 'fortune' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
          🎯 运势管理
        </button>
        <button onClick={() => { setTab('announcements'); loadAnnouncements() }}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium ' + (tab === 'announcements' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
          📢 资讯管理
        </button>
        <button onClick={() => setTab('prediction')}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium ' + (tab === 'prediction' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
          🎯 竞猜管理
        </button>
        <button onClick={() => setTab('rewards')}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium ' + (tab === 'rewards' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
          🎁 奖品管理
        </button>
        <button onClick={() => setTab('coingrants')}
          className={'px-4 py-1.5 rounded-lg text-sm font-medium ' + (tab === 'coingrants' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
          💰 金币发放
        </button>
      </div>

      {tab === 'users' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">
            用户管理 ({users.length} 人)
          </div>
          {loading ? (
            <p className="text-center text-gray-400 py-6 text-sm">加载中...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">用户名</th>
                    <th className="px-3 py-2 text-left">昵称</th>
                    <th className="px-3 py-2 text-center">积分</th>
                    <th className="px-3 py-2 text-center">比赛</th>
                    <th className="px-3 py-2 text-center">角色</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u: any) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <a href={'/profile/' + u.id} className="text-blue-600 hover:underline">{u.username}</a>
                      </td>
                      <td className="px-3 py-2">{u.nickname}</td>
                      <td className="px-3 py-2 text-center font-medium">{u.elo_score}</td>
                      <td className="px-3 py-2 text-center text-gray-500">{u.match_count}</td>
                      <td className="px-3 py-2 text-center">
                        {u.username === 'guanliyuan'
                          ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">管理员</span>
                          : <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">用户</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-center">
                        {u.username !== 'guanliyuan' && (
                          confirmUserId === u.id ? (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => handleDeleteUser(u.id)}
                                className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">确认注销</button>
                              <button onClick={() => setConfirmUserId(null)}
                                className="px-2 py-1 border rounded text-xs hover:bg-gray-50">取消</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmUserId(u.id)}
                              className="px-2 py-1 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50">注销</button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'chat' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">自动清理设置</div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">全局频道保留（天）</label>
                  <input type="number" min="1" max="365" value={globalDays}
                    onChange={e => setGlobalDays(parseInt(e.target.value) || 2)}
                    className="w-24 px-2 py-1.5 border rounded text-sm text-center" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">私聊保留（天）</label>
                  <input type="number" min="1" max="365" value={privateDays}
                    onChange={e => setPrivateDays(parseInt(e.target.value) || 2)}
                    className="w-24 px-2 py-1.5 border rounded text-sm text-center" />
                </div>
                <button onClick={saveConfig}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 self-end">保存配置</button>
              </div>
              <p className="text-xs text-gray-400">每天用户访问时自动检查并清理过期消息</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">手动清理</div>
            <div className="p-4 space-y-4">
              <div className="flex gap-4 items-end">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">清理范围</label>
                  <select value={cleanType} onChange={e => setCleanType(e.target.value)}
                    className="px-3 py-1.5 border rounded text-sm">
                    <option value="global">全局频道</option>
                    <option value="private">私聊</option>
                    <option value="all">全部</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">保留最近（天）</label>
                  <input type="number" min="0" max="365" value={cleanDays}
                    onChange={e => setCleanDays(parseInt(e.target.value) || 2)}
                    className="w-20 px-2 py-1.5 border rounded text-sm text-center" />
                </div>
                <button onClick={handleCleanup}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600">按天清理</button>
                <button onClick={handleCleanupAll}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">全部清空</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'matchmaking' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">过期约球清理</div>
            <div className="p-6 text-center space-y-4">
              <p className="text-sm text-gray-600">清理所有过期的约球帖子（结束时间已过，或开始时间超过1天）</p>
              <button onClick={handleCleanupMatchmaking}
                className="px-6 py-3 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                一键清理过期约球
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-red-50 font-medium text-sm text-red-700">⚠️ 危险操作</div>
            <div className="p-6 text-center space-y-4">
              <p className="text-sm text-gray-600">清除所有约球帖子及响应记录，<span className="text-red-500 font-medium">不可撤销！</span></p>
              <button onClick={handleCleanupAllMatchmaking}
                className="px-6 py-3 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-black">
                一键清理所有约球
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'fortune' && (
        <div className="space-y-4">
          {/* 运势内容列表 */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <span className="font-medium text-sm">运势内容管理</span>
              <button onClick={() => openFortuneForm()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                + 新增运势
              </button>
            </div>

            {fortuneLoading ? (
              <p className="text-center text-gray-400 py-6 text-sm">加载中...</p>
            ) : fortuneItems.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">暂无运势内容，点击上方按钮添加</p>
            ) : (
              <div className="divide-y">
                {fortuneItems.map(item => (
                  <div key={item.id} className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{item.content}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.category}</span>
                          {item.is_unique && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                              唯一性 {item.unique_claimed_by ? '(已领取)' : '(未领取)'}
                            </span>
                          )}
                          {!item.is_active && (
                            <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">已停用</span>
                          )}
                          {item.unique_claimed_by && (
                            <span className="text-xs text-blue-500">被领取: {item.unique_claimed_by.slice(0, 8)}...</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openFortuneForm(item)}
                          className="px-2 py-1 border rounded text-xs text-gray-600 hover:bg-gray-50">
                          编辑
                        </button>
                        <button onClick={() => toggleUnique(item.id, item.is_unique)}
                          className={'px-2 py-1 border rounded text-xs ' + (item.is_unique ? 'text-orange-600 border-orange-200 hover:bg-orange-50' : 'text-purple-600 border-purple-200 hover:bg-purple-50')}>
                          {item.is_unique ? '取消唯一' : '设唯一'}
                        </button>
                        {fortuneDeleteId === item.id ? (
                          <div className="flex gap-1">
                            <button onClick={() => deleteFortune(item.id)}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">确认</button>
                            <button onClick={() => setFortuneDeleteId(null)}
                              className="px-2 py-1 border rounded text-xs hover:bg-gray-50">取消</button>
                          </div>
                        ) : (
                          <button onClick={() => setFortuneDeleteId(item.id)}
                            className="px-2 py-1 border border-red-200 text-red-500 rounded text-xs hover:bg-red-50">
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 新增/编辑运势表单弹窗 */}
          {showFortuneForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFortuneForm(false)}>
              <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold mb-4">{editingFortuneId ? '编辑运势' : '新增运势'}</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">运势内容</label>
                    <textarea value={fortuneContent} onChange={e => setFortuneContent(e.target.value)}
                      placeholder="例如：今天运气爆棚，适合约球！"
                      className="w-full px-3 py-2 border rounded-lg text-sm min-h-[80px]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">分类</label>
                    <select value={fortuneCategory} onChange={e => setFortuneCategory(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="general">普通</option>
                      <option value="lucky">好运</option>
                      <option value="unlucky">坏运</option>
                      <option value="funny">搞笑</option>
                      <option value="sports">运动</option>
                      <option value="motivation">励志</option>
                    </select>
                  </div>
                  {!editingFortuneId && (
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="isUnique" checked={fortuneIsUnique}
                        onChange={e => setFortuneIsUnique(e.target.checked)}
                        className="rounded border-gray-300" />
                      <label htmlFor="isUnique" className="text-sm text-gray-700">
                        设为唯一性运势 <span className="text-xs text-gray-400">（有且仅有一人能抽到）</span>
                      </label>
                    </div>
                  )}
                  {!editingFortuneId && fortuneIsUnique && (
                    <p className="text-xs text-orange-500 bg-orange-50 px-3 py-2 rounded-lg">
                      ⚠️ 设为唯一性后，第一个抽到该内容的人将永久获得它，不会再被其他人抽到
                    </p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setShowFortuneForm(false)}
                      className="flex-1 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
                    <button onClick={saveFortune}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                      {editingFortuneId ? '保存修改' : '添加'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'announcements' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <span className="font-medium text-sm">📢 资讯管理</span>
              <button onClick={() => openAnnForm()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                + 发布资讯
              </button>
            </div>

            {annLoading ? (
              <p className="text-center text-gray-400 py-6 text-sm">加载中...</p>
            ) : announcements.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">暂无资讯</p>
            ) : (
              <div className="divide-y">
                {announcements.map(a => {
                  const expired = a.expires_at && new Date(a.expires_at) < new Date()
                  return (
                    <div key={a.id} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={'text-[10px] px-2 py-0.5 rounded-full font-medium ' +
                              (a.priority === 'high' ? 'bg-red-100 text-red-700' : a.priority === 'normal' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                              {a.priority === 'high' ? '重要' : a.priority === 'normal' ? '公告' : '普通'}
                            </span>
                            <p className="text-sm font-medium text-gray-800">{a.title}</p>
                            {expired && <span className="text-[10px] text-red-500">已过期</span>}
                          </div>
                          <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{a.content}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-gray-400">{a.created_by_name}</span>
                            <span className="text-[10px] text-gray-300">·</span>
                            <span className="text-[10px] text-gray-400">{new Date(a.created_at).toLocaleDateString('zh-CN')}</span>
                            {a.expires_at && (
                              <>
                                <span className="text-[10px] text-gray-300">·</span>
                                <span className="text-[10px] text-orange-400">到期 {new Date(a.expires_at).toLocaleDateString('zh-CN')}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => openAnnForm(a)}
                            className="px-2 py-1 border rounded text-xs text-gray-600 hover:bg-gray-50">编辑</button>
                          {annDeleteId === a.id ? (
                            <div className="flex gap-1">
                              <button onClick={() => deleteAnnouncement(a.id)}
                                className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">确认</button>
                              <button onClick={() => setAnnDeleteId(null)}
                                className="px-2 py-1 border rounded text-xs hover:bg-gray-50">取消</button>
                            </div>
                          ) : (
                            <button onClick={() => setAnnDeleteId(a.id)}
                              className="px-2 py-1 border border-red-200 text-red-500 rounded text-xs hover:bg-red-50">删除</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 新闻快报上限设置 */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="font-bold text-sm mb-3">📰 新闻快报设置</h2>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500">快报保留上限：</label>
              <input type="number" min={1} max={100} value={maxFlashCount}
                onChange={e => setMaxFlashCount(parseInt(e.target.value) || 5)}
                className="w-20 px-2 py-1.5 border rounded text-sm text-center" />
              <span className="text-xs text-gray-400">条</span>
              <button onClick={saveFlashConfig}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">保存</button>
            </div>
            <p className="text-xs text-gray-400 mt-2">超出上限时自动删除最旧的快报</p>
          </div>

          {showAnnForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAnnForm(false)}>
              <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold mb-4">{editingAnnId ? '编辑资讯' : '发布资讯'}</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">标题</label>
                    <input value={annTitle} onChange={e => setAnnTitle(e.target.value)}
                      placeholder="资讯标题"
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">内容</label>
                    <textarea value={annContent} onChange={e => setAnnContent(e.target.value)}
                      placeholder="输入资讯内容..."
                      className="w-full px-3 py-2 border rounded-lg text-sm min-h-[100px]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">优先级</label>
                    <select value={annPriority} onChange={e => setAnnPriority(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="normal">普通公告</option>
                      <option value="high">重要通知</option>
                      <option value="low">一般资讯</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="hasExpiry" checked={annHasExpiry}
                      onChange={e => setAnnHasExpiry(e.target.checked)}
                      className="rounded border-gray-300" />
                    <label htmlFor="hasExpiry" className="text-sm text-gray-700">设置时效</label>
                    {annHasExpiry && (
                      <div className="flex items-center gap-1">
                        <input type="number" min={1} max={365} value={annExpireDays}
                          onChange={e => setAnnExpireDays(parseInt(e.target.value) || 7)}
                          className="w-16 px-2 py-1 border rounded text-sm text-center" />
                        <span className="text-xs text-gray-500">天后自动过期</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setShowAnnForm(false)}
                      className="flex-1 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
                    <button onClick={saveAnnouncement}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                      {editingAnnId ? '保存修改' : '发布'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'prediction' && <PredictionAdmin />}
      {tab === 'rewards' && <RewardsAdmin />}
      {tab === 'coingrants' && <CoinGrantsAdmin />}
    </div>
  )
}

// ============ 竞猜管理子组件 ============

function PredictionAdmin() {
  const { user } = useAuth()
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [optionInput, setOptionInput] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [deadline, setDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setLoading(true)
    const { data } = await supabase
      .from('prediction_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setEvents(data || [])
    setLoading(false)
  }

  function addOption() {
    if (optionInput.trim() && !options.includes(optionInput.trim())) {
      setOptions([...options, optionInput.trim()])
      setOptionInput('')
    }
  }

  async function createEvent() {
    if (!title || options.length < 2 || !deadline) {
      setError('请填写标题、至少2个选项和截止时间')
      return
    }
    setSubmitting(true)
    setError('')
    const opts = options.map(o => ({ label: o, value: o }))
    if (!user) { setError('请先登录'); return }
    const { error: err } = await supabase.from('prediction_events').insert({
      title, description: description || null,
      event_type: 'external_custom',
      options: opts,
      deadline: new Date(deadline).toISOString(),
      created_by: user.id,
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    setSuccess('创建成功')
    setShowForm(false)
    setTitle(''); setDescription(''); setOptions([]); setDeadline('')
    setSubmitting(false)
    loadEvents()
  }

  async function closeEvent(id: string) {
    await supabase.from('prediction_events').update({ status: 'closed' }).eq('id', id)
    loadEvents()
  }

  async function settleEvent(id: string, winningOption: number) {
    const { error: err } = await supabase.rpc('settle_prediction_event', {
      p_event_id: id, p_winning_option: winningOption,
    })
    if (err) { setError(err.message); return }
    setSuccess('结算完成')
    loadEvents()
  }

  async function cancelEvent(id: string) {
    const { error: err } = await supabase.rpc('cancel_prediction_event', { p_event_id: id })
    if (err) { setError(err.message); return }
    setSuccess('已取消并退款')
    loadEvents()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm flex items-center justify-between">
        <span>竞猜事件管理</span>
        <button onClick={() => setShowForm(!showForm)}
          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700">
          + 创建事件
        </button>
      </div>

      {error && <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">{error}</div>}
      {success && <div className="px-4 py-2 bg-green-50 text-green-600 text-sm">{success}</div>}

      {showForm && (
        <div className="p-4 border-b space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="竞猜标题" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="描述（可选）" className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
          <div className="flex gap-2">
            <input value={optionInput} onChange={e => setOptionInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
              placeholder="添加选项" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
            <button onClick={addOption} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">添加</button>
          </div>
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {options.map((o, i) => (
                <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full flex items-center gap-1">
                  {o}
                  <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">&times;</button>
                </span>
              ))}
            </div>
          )}
          <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <button onClick={createEvent} disabled={submitting}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {submitting ? '创建中...' : '创建竞猜事件'}
          </button>
        </div>
      )}

      {loading ? <p className="text-center py-6 text-gray-400 text-sm">加载中...</p> : events.length === 0 ? (
        <p className="text-center py-6 text-gray-400 text-sm">暂无竞猜事件</p>
      ) : (
        <div className="divide-y">
          {events.map((ev: any) => (
            <div key={ev.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{ev.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  ev.status === 'open' ? 'bg-green-100 text-green-700' :
                  ev.status === 'settled' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{ev.status}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                <span>奖池 {ev.pool_total} 币</span>
                <span>·</span>
                <span>{new Date(ev.deadline).toLocaleString('zh-CN')}</span>
              </div>
              {ev.status === 'open' && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => closeEvent(ev.id)} className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">关闭投注</button>
                  <button onClick={() => cancelEvent(ev.id)} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">取消并退款</button>
                </div>
              )}
              {ev.status === 'closed' && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {(typeof ev.options === 'string' ? JSON.parse(ev.options) : ev.options || []).map((opt: any, i: number) => (
                    <button key={i} onClick={() => settleEvent(ev.id, i)}
                      className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
                      结算: {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ 奖品管理子组件 ============

function RewardsAdmin() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Create form
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [cost, setCost] = useState(100)
  const [stock, setStock] = useState(-1)
  const [itemType, setItemType] = useState<'physical' | 'badge'>('physical')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('reward_items').select('*').order('cost', { ascending: true })
    setItems(data || [])
    setLoading(false)
  }

  async function saveItem() {
    if (!name || cost < 1) { setError('请填写名称和价格'); return }
    if (editingId) {
      const { error: err } = await supabase.from('reward_items').update({
        name, description: desc || null, cost, stock, type: itemType, is_active: true,
      }).eq('id', editingId)
      if (err) { setError(err.message); return }
    } else {
      const { error: err } = await supabase.from('reward_items').insert({
        name, description: desc || null, cost, stock, type: itemType,
      })
      if (err) { setError(err.message); return }
    }
    setShowForm(false); setEditingId(null)
    setName(''); setDesc(''); setCost(100); setStock(-1)
    loadItems()
  }

  function editItem(item: any) {
    setEditingId(item.id)
    setName(item.name)
    setDesc(item.description || '')
    setCost(item.cost)
    setStock(item.stock)
    setItemType(item.type)
    setShowForm(true)
  }

  async function toggleActive(item: any) {
    await supabase.from('reward_items').update({ is_active: !item.is_active }).eq('id', item.id)
    loadItems()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm flex items-center justify-between">
        <span>奖品管理</span>
        <button onClick={() => { setEditingId(null); setName(''); setDesc(''); setCost(100); setStock(-1); setShowForm(!showForm) }}
          className="text-xs bg-purple-600 text-white px-3 py-1 rounded-lg hover:bg-purple-700">
          + 添加奖品
        </button>
      </div>
      {error && <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">{error}</div>}
      {showForm && (
        <div className="p-4 border-b space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="奖品名称" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="描述" className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500">价格（币）</label>
              <input type="number" value={cost} onChange={e => setCost(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-lg text-sm" min={1} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">库存（-1=无限）</label>
              <input type="number" value={stock} onChange={e => setStock(parseInt(e.target.value) || -1)}
                className="w-full px-3 py-2 border rounded-lg text-sm" min={-1} />
            </div>
          </div>
          <select value={itemType} onChange={e => setItemType(e.target.value as any)}
            className="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="physical">🎁 实物</option>
            <option value="badge">🏅 徽章</option>
          </select>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
            <button onClick={saveItem}
              className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
              {editingId ? '保存' : '添加'}
            </button>
          </div>
        </div>
      )}
      {loading ? <p className="text-center py-4 text-gray-400 text-sm">加载中...</p> : items.length === 0 ? (
        <p className="text-center py-4 text-gray-400 text-sm">暂无奖品</p>
      ) : (
        <div className="divide-y">
          {items.map((item: any) => (
            <div key={item.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-gray-400">{item.cost} 币 · {item.type === 'badge' ? '🏅徽章' : '🎁实物'} · 库存 {item.stock === -1 ? '∞' : item.stock}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => editItem(item)} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">编辑</button>
                <button onClick={() => toggleActive(item)}
                  className={`text-xs px-2 py-1 rounded ${item.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                  {item.is_active ? '下架' : '上架'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ 金币发放子组件 ============

function CoinGrantsAdmin() {
  const [users, setUsers] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [amount, setAmount] = useState(50)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { user: admin } = useAuth()
  const [transactions, setTransactions] = useState<any[]>([])

  useEffect(() => { loadRecent(); searchUsers() }, [searchTerm])

  async function searchUsers() {
    if (searchTerm.length < 1) { setUsers([]); return }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, nickname, coins')
      .or(`username.ilike.%${searchTerm}%,nickname.ilike.%${searchTerm}%`)
      .limit(10)
    setUsers(data || [])
  }

  async function loadRecent() {
    const { data } = await supabase
      .from('coin_transactions')
      .select('*, profiles!inner(username, nickname)')
      .eq('type', 'admin_grant')
      .order('created_at', { ascending: false })
      .limit(10)
    setTransactions(data || [])
  }

  async function grantCoins() {
    if (!admin || !selectedUser) { setError('请选择用户'); return }
    setSubmitting(true)
    setError('')
    const { error: err } = await supabase.rpc('admin_grant_coins', {
      p_admin_id: admin.id, p_target_id: selectedUser.id, p_amount: amount, p_note: note || '管理员发放',
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    setSuccess(`已向 ${selectedUser.nickname || selectedUser.username} 发放 ${amount} 币`)
    setSubmitting(false)
    setSelectedUser(null)
    setAmount(50)
    setNote('')
    loadRecent()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">金币发放</div>
      {error && <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">{error}</div>}
      {success && <div className="px-4 py-2 bg-green-50 text-green-600 text-sm">{success}</div>}
      <div className="p-4 space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">搜索用户</label>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="输入用户名或昵称搜索..."
            className="w-full px-3 py-2 border rounded-lg text-sm" />
          {users.length > 0 && (
            <div className="mt-1 border rounded-lg divide-y max-h-40 overflow-y-auto">
              {users.map((u: any) => (
                <button key={u.id} onClick={() => { setSelectedUser(u); setSearchTerm(''); setUsers([]) }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${selectedUser?.id === u.id ? 'bg-blue-50' : ''}`}>
                  {u.nickname || u.username} ({u.username}) — 💰{u.coins}币
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedUser && (
          <>
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              目标用户: <strong>{selectedUser.nickname || selectedUser.username}</strong> · 当前余额: {selectedUser.coins} 币
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">金币数量</label>
                <input type="number" value={amount} onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 border rounded-lg text-sm" min={1} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">备注</label>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="发放原因" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <button onClick={grantCoins} disabled={submitting}
              className="w-full py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              {submitting ? '发放中...' : `发放 ${amount} 币`}
            </button>
          </>
        )}
      </div>
      {transactions.length > 0 && (
        <div className="border-t">
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">最近发放记录</div>
          {transactions.map((tx: any) => (
            <div key={tx.id} className="px-4 py-2 text-xs border-t flex justify-between">
              <span>{(tx.profiles as any)?.nickname || '用户'} +{tx.amount}币</span>
              <span className="text-gray-400">{new Date(tx.created_at).toLocaleString('zh-CN')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
