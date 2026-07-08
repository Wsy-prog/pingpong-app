import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Announcement } from '../types'

function localDateStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface FortuneResult {
  id: string
  content: string
  category: string
  is_unique: boolean
  unique_claimed: boolean
  already_drawn: boolean
}

interface NewsFlash {
  id: string
  profile_id: string
  nickname: string
  content: string
  liked_by: string[]
  created_at: string
}

const features = [
  { title: '自由约球', path: '/matchmaking', icon: '🏓', color: 'bg-green-100 text-green-600' },
  { title: '赛事中心', path: '/tournaments', icon: '🏆', color: 'bg-yellow-100 text-yellow-600' },
  { title: '实时排名', path: '/rankings', icon: '📊', color: 'bg-blue-100 text-blue-600' },
  { title: '聊天大厅', path: '/chat', icon: '💬', color: 'bg-indigo-100 text-indigo-600' },
]

export function LobbyPage() {
  const { user: profile } = useAuth()
  const [myRank, setMyRank] = useState<number | null>(null)

  // 今日运势
  const [fortune, setFortune] = useState<FortuneResult | null>(null)
  const [fortuneLoading, setFortuneLoading] = useState(false)
  const [fortuneError, setFortuneError] = useState('')

  // 乒协资讯
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  // 新闻快报
  const [newsFlashes, setNewsFlashes] = useState<NewsFlash[]>([])
  const [maxNews, setMaxNews] = useState(5)
  const [flashText, setFlashText] = useState('')
  const [flashSending, setFlashSending] = useState(false)
  const [flashError, setFlashError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (profile) { loadMyRank(); loadFortune(); setIsAdmin(profile.username === 'guanliyuan') }
    loadAnnouncements()
    loadNewsFlashes()
    loadMaxNews()
  }, [profile])

  async function loadMyRank() {
    if (!profile) return
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gt('elo_score', profile.elo_score)
    setMyRank((count || 0) + 1)
  }

  async function loadFortune() {
    if (!profile) return
    const today = localDateStr()
    const { data: existing } = await supabase
      .from('user_fortunes').select('fortune_id').eq('profile_id', profile.id).eq('drawn_date', today).maybeSingle()
    if (existing) {
      const { data: f } = await supabase.from('fortune_items').select('*').eq('id', existing.fortune_id).single()
      if (f) {
        setFortune({
          id: f.id, content: f.content, category: f.category,
          is_unique: f.is_unique, unique_claimed: f.unique_claimed_by !== null, already_drawn: true,
        })
      }
    }
  }

  async function drawFortune() {
    if (!profile) return
    setFortuneLoading(true)
    setFortuneError('')
    const { data, error } = await supabase.rpc('draw_daily_fortune', { p_user_id: profile.id })
    if (error) { setFortuneError(error.message); setFortuneLoading(false); return }
    const result = data as any
    if (result.error) { setFortuneError(result.error); setFortuneLoading(false); return }
    setFortune(result as FortuneResult)
    setFortuneLoading(false)
  }

  async function loadAnnouncements() {
    const now = new Date().toISOString()
    await supabase.from('announcements').delete().lt('expires_at', now)
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setAnnouncements(data as Announcement[])
  }

  async function loadNewsFlashes() {
    const { data } = await supabase
      .from('news_flashes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) {
      const items = (data as any[]).map(f => ({
        ...f,
        liked_by: typeof f.liked_by === 'string' ? JSON.parse(f.liked_by || '[]') : (f.liked_by || []),
      })) as NewsFlash[]
      setNewsFlashes(items)
    }
  }

  async function loadMaxNews() {
    const { data } = await supabase
      .from('flash_config')
      .select('max_count')
      .eq('id', 1)
      .maybeSingle()
    if (data) setMaxNews(data.max_count)
  }

  async function sendFlash() {
    if (!profile || !flashText.trim()) return
    setFlashSending(true)
    setFlashError('')
    const { error } = await supabase.from('news_flashes').insert({
      profile_id: profile.id,
      nickname: profile.nickname || profile.username,
      content: flashText.trim(),
    })
    if (error) { setFlashError(error.message); setFlashSending(false); return }
    const { count } = await supabase
      .from('news_flashes')
      .select('*', { count: 'exact', head: true })
    if (count !== null && count > maxNews) {
      const { data: toDelete } = await supabase
        .from('news_flashes')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(count - maxNews)
      if (toDelete && toDelete.length > 0) {
        const ids = toDelete.map((r: any) => r.id)
        await supabase.from('news_flashes').delete().in('id', ids)
      }
    }
    setFlashText('')
    setFlashSending(false)
    loadNewsFlashes()
  }

  async function deleteFlash(id: string) {
    await supabase.from('news_flashes').delete().eq('id', id)
    loadNewsFlashes()
  }

  async function toggleLike(flashId: string) {
    if (!profile) return
    const f = newsFlashes.find(n => n.id === flashId)
    if (!f) return
    const liked = f.liked_by || []
    const already = liked.includes(profile.id)
    let newLiked: string[]
    if (already) {
      newLiked = liked.filter(id => id !== profile.id)
    } else {
      newLiked = [...liked, profile.id]
    }
    // 乐观更新
    setNewsFlashes(prev => prev.map(n => n.id === flashId ? { ...n, liked_by: newLiked } : n))
    const { error } = await supabase
      .from('news_flashes')
      .update({ liked_by: JSON.stringify(newLiked) })
      .eq('id', flashId)
    if (error) {
      setFlashError('点赞失败: ' + error.message)
      loadNewsFlashes() // 回滚
    }
  }

  const priorityStyle = (p: string) => {
    switch (p) {
      case 'high': return { bg: 'bg-red-50 border-red-200', badge: 'bg-red-500 text-white', text: '重要' }
      case 'normal': return { bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-500 text-white', text: '公告' }
      default: return { bg: 'bg-gray-50 border-gray-200', badge: 'bg-gray-400 text-white', text: '资讯' }
    }
  }

  return (
    <div className="space-y-6">
      {/* 快速概览 + 今日运势 */}
      <div className="flex gap-4">
        <div className="flex-1 bg-white rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-bold mb-1">
            欢迎回来，{profile?.nickname || '球友'}！
          </h1>
          <div className="flex gap-6 mt-4 text-sm">
            <div>
              <span className="text-gray-400">积分</span>
              <p className="text-lg font-bold">{profile?.elo_score ?? 1500}</p>
            </div>
            <div>
              <span className="text-gray-400">排名</span>
              <p className="text-lg font-bold">#{myRank || '—'}</p>
            </div>
            <div>
              <span className="text-gray-400">活跃赛事</span>
              <p className="text-lg font-bold">0</p>
            </div>
          </div>
        </div>

        <div className="w-72 bg-white rounded-xl p-5 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">🎯 今日运势</h3>
            {!fortune && (
              <button onClick={drawFortune} disabled={fortuneLoading}
                className="px-2.5 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg text-xs font-bold hover:from-yellow-500 hover:to-orange-600 transition disabled:opacity-50 shadow-sm">
                {fortuneLoading ? '...' : '🎲 抽签'}
              </button>
            )}
          </div>
          {fortuneError && <p className="text-red-500 text-xs">{fortuneError}</p>}
          {fortune ? (
            <div className="bg-gradient-to-br from-yellow-50 via-orange-50 to-amber-50 rounded-xl p-3 border border-yellow-200">
              <div className="flex items-start gap-2">
                <span className="text-xl">✨</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 leading-relaxed">{fortune.content}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {fortune.is_unique && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">🏆 专属</span>}
                    <div className="flex-1" />
                    <button onClick={drawFortune} disabled={fortuneLoading}
                      className="text-xs text-yellow-600 hover:text-yellow-700 font-medium">
                      {fortuneLoading ? '...' : '🔄 刷新'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : !fortuneError && (
            <p className="text-xs text-gray-400">点击抽签获取今日运势</p>
          )}
        </div>
      </div>

      {/* 功能入口 */}
      <div className="grid grid-cols-2 gap-3">
        {features.map(f => (
          <Link
            key={f.path}
            to={f.path}
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition"
          >
            <div className={`inline-block p-2 rounded-lg ${f.color} mb-2`}>
              <span className="text-xl">{f.icon}</span>
            </div>
            <p className="font-medium text-sm">{f.title}</p>
          </Link>
        ))}
        <Link to="/health"
          className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition">
          <div className="inline-block p-2 rounded-lg bg-rose-100 text-rose-600 mb-2">
            <span className="text-xl">💪</span>
          </div>
          <p className="font-medium text-sm">健康打卡</p>
        </Link>
        <Link to={`/profile/${profile?.id}`}
          className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition">
          <div className="inline-block p-2 rounded-lg bg-pink-100 text-pink-600 mb-2">
            <span className="text-xl">👤</span>
          </div>
          <p className="font-medium text-sm">个人中心</p>
        </Link>
      </div>

      {/* 乒协资讯 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-bold">📢 乒协资讯</h2>
        </div>

        {announcements.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            暂无最新资讯
          </p>
        ) : (
          <div className="space-y-3">
            {announcements.map(a => {
              const ps = priorityStyle(a.priority)
              return (
                <div key={a.id} className={`rounded-xl p-4 border ${ps.bg}`}>
                  <div className="flex items-start gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${ps.badge}`}>
                      {ps.text}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{a.title}</p>
                      <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{a.content}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-gray-400">{a.created_by_name}</span>
                        <span className="text-[10px] text-gray-300">·</span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(a.created_at).toLocaleDateString('zh-CN')}
                        </span>
                        {a.expires_at && (
                          <>
                            <span className="text-[10px] text-gray-300">·</span>
                            <span className="text-[10px] text-orange-400">
                              有效期至 {new Date(a.expires_at).toLocaleDateString('zh-CN')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 新闻快报 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">📰 新闻快报</h2>
          <span className="text-xs text-gray-400">最多 {maxNews} 条，超出自动覆盖</span>
        </div>

        {/* 发布输入框 */}
        {profile && (
          <div className="flex gap-2 mb-4">
            <input value={flashText} onChange={e => setFlashText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFlash() } }}
              placeholder="说点什么..."
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={sendFlash} disabled={flashSending || !flashText.trim()}
              className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
              {flashSending ? '...' : '发送'}
            </button>
          </div>
        )}
        {flashError && <p className="text-red-500 text-xs mb-2">{flashError}</p>}

        {newsFlashes.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">暂无快报消息</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {newsFlashes.map((f, i) => {
              const colors = [
                'bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-l-yellow-400',
                'bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-l-green-400',
                'bg-gradient-to-r from-blue-50 to-cyan-50 border-l-4 border-l-blue-400',
                'bg-gradient-to-r from-purple-50 to-violet-50 border-l-4 border-l-purple-400',
                'bg-gradient-to-r from-pink-50 to-rose-50 border-l-4 border-l-pink-400',
                'bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-l-orange-400',
              ]
              const color = colors[i % colors.length]
              return (
                <div key={f.id} className={`rounded-xl p-3 ${color}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-700">{f.nickname}</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(f.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleLike(f.id)}
                        className={'text-xs font-medium transition ' + ((f.liked_by || []).includes(profile?.id || '') ? 'text-red-500' : 'text-gray-400 hover:text-red-400')}>
                        {(f.liked_by || []).includes(profile?.id || '') ? '❤️' : '🤍'} {(f.liked_by || []).length > 0 && (f.liked_by || []).length}
                      </button>
                      {(isAdmin || profile?.id === f.profile_id) && (
                        <button onClick={() => deleteFlash(f.id)}
                          className="text-[10px] text-red-400 hover:text-red-600">删除</button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{f.content}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
