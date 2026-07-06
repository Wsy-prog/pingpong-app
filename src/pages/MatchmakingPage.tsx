import { useEffect, useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { MatchmakingPost } from '../types'

export function MatchmakingPage() {
  const { profile } = useAuth()
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [matchTime, setMatchTime] = useState('')
  const [note, setNote] = useState('')
  const [skillLevel, setSkillLevel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [responding, setResponding] = useState<string | null>(null)

  useEffect(() => { loadPosts() }, [])

  async function loadPosts() {
    const { data } = await supabase
      .from('matchmaking_posts')
      .select('*, author:profiles!author_id(nickname)')
      .order('created_at', { ascending: false })
    if (data) setPosts(data)
    setLoading(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSubmitting(true)
    const { error: err } = await supabase.from('matchmaking_posts').insert({
      author_id: profile.id, title, location,
      match_time: matchTime, note: note || null, skill_level: skillLevel || null,
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    setShowForm(false); setTitle(''); setLocation(''); setMatchTime(''); setNote(''); setSkillLevel('')
    setSubmitting(false); loadPosts()
  }

  async function handleRespond(postId: string) {
    if (!profile) return
    setResponding(postId)
    await supabase.from('matchmaking_responses').insert({
      post_id: postId, responder_id: profile.id,
    })
    setResponding(null)
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">自由约球</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          {showForm ? '取消' : '发布约球'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="标题（如：今晚找人打球）"
            className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input value={location} onChange={e => setLocation(e.target.value)} required placeholder="地点"
            className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input type="datetime-local" value={matchTime} onChange={e => setMatchTime(e.target.value)} required
            className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input value={skillLevel} onChange={e => setSkillLevel(e.target.value)} placeholder="水平说明（可选）"
            className="w-full px-3 py-2 border rounded-lg text-sm" />
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="备注/个人声明（可选）"
            rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {submitting ? '发布中...' : '发布'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-center text-gray-400 py-10">加载中...</p>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🏓</div>
          <p>暂无约球信息</p>
          <button onClick={() => setShowForm(true)} className="text-blue-600 text-sm mt-2">发布第一条</button>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(p => (
            <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold">
                  {p.author?.nickname?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-medium text-sm">{p.author?.nickname || '未知'}</p>
                  <div className="flex gap-2 text-xs text-gray-400">
                    <span>📅 {new Date(p.match_time).toLocaleDateString('zh-CN')}</span>
                    <span>📍 {p.location}</span>
                  </div>
                </div>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                  p.status === 'open' ? 'bg-green-100 text-green-700' :
                  p.status === 'matched' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {p.status === 'open' ? '开放' : p.status === 'matched' ? '已匹配' : '已关闭'}
                </span>
              </div>
              <p className="text-sm font-medium">{p.title}</p>
              {p.skill_level && <p className="text-xs text-gray-500 mt-1">水平: {p.skill_level}</p>}
              {p.note && <p className="text-xs text-gray-500 mt-1">{p.note}</p>}
              <div className="flex gap-2 mt-3">
                {p.status === 'open' && profile && (
                  <button onClick={() => handleRespond(p.id)} disabled={responding === p.id}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 disabled:opacity-50">
                    {responding === p.id ? '发送中...' : '我要约'}
                  </button>
                )}
                {p.author_id && (
                  <Link to={`/profile/${p.author_id}`}
                    className="px-3 py-1.5 border rounded-lg text-xs hover:bg-gray-50">
                    查看主页
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
