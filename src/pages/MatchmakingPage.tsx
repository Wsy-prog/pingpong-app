import { useEffect, useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export function MatchmakingPage() {
  const { user: profile } = useAuth()
  const [posts, setPosts] = useState<any[]>([])
  const [myRespMap, setMyRespMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [matchTime, setMatchTime] = useState('')
  const [note, setNote] = useState('')
  const [skillLevel, setSkillLevel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadPosts(); cleanupOldPosts() }, [])

  async function cleanupOldPosts() {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    await supabase.from('matchmaking_posts').update({ status: 'closed' }).lt('match_time', yesterday.toISOString()).eq('status', 'open')
  }

  async function loadPosts() {
    const { data: posts } = await supabase.from('matchmaking_posts').select('*').order('created_at', { ascending: false })
    if (!posts) { setLoading(false); return }

    const authorIds = [...new Set(posts.map(p => p.author_id))]
    const { data: authors } = await supabase.from('profiles').select('id, nickname').in('id', authorIds)
    const authorMap: Record<string, string> = {}
    if (authors) authors.forEach(a => { authorMap[a.id] = a.nickname })

    // 查询当前用户已响应的帖子
    if (profile) {
      const { data: myResps } = await supabase.from('matchmaking_responses').select('*').eq('responder_id', profile.id)
      const m: Record<string, any> = {}
      if (myResps) myResps.forEach(r => { m[r.post_id] = r })
      setMyRespMap(m)
    }

    const now = new Date()
    const statusOrder: Record<string, number> = { open: 0, matched: 1, closed: 2 }
    const sorted = posts.sort((a, b) => {
      const d = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
      if (d !== 0) return d
      const aResp = myRespMap[a.id]?.status || ''
      const bResp = myRespMap[b.id]?.status || ''
      if (a.status === 'open' && b.status === 'open') {
        if (aResp === 'pending' && bResp !== 'pending') return 1
        if (aResp !== 'pending' && bResp === 'pending') return -1
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    setPosts(sorted.map(p => ({ ...p, author: { nickname: authorMap[p.author_id] || '未知' } })))
    setLoading(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSubmitting(true); setError('')
    const { error: err } = await supabase.from('matchmaking_posts').insert({
      author_id: profile.id, title, location, match_time: matchTime, note: note || null, skill_level: skillLevel || null,
    })
    if (err) { setError('发布失败: ' + err.message); setSubmitting(false); return }
    setShowForm(false); setTitle(''); setLocation(''); setMatchTime(''); setNote(''); setSkillLevel('')
    setSubmitting(false); loadPosts()
  }

  // 我要约
  async function handleRespond(postId: string, authorId: string) {
    if (!profile) return
    const post = posts.find(p => p.id === postId)
    const { error: rErr } = await supabase.from('matchmaking_responses').insert({ post_id: postId, responder_id: profile.id })
    if (rErr) { setError('响应失败: ' + rErr.message); return }
    const { error: nErr } = await supabase.from('notifications').insert({
      user_id: authorId, type: 'match_request',
      title: '有人想和你打球',
      content: `${profile.nickname || profile.username} 想和你约球「${post?.title}」`,
      related_id: postId,
    })
    if (nErr) console.error('通知发送失败:', nErr)
    loadPosts()
  }

  // 放弃约球
  async function handleCancelRespond(postId: string) {
    if (!profile) return
    await supabase.from('matchmaking_responses').delete().eq('post_id', postId).eq('responder_id', profile.id)
    loadPosts()
  }

  // 发布者接受约球
  async function handleAccept(postId: string, responderId: string, responderName: string) {
    const post = posts.find(p => p.id === postId)
    await supabase.from('matchmaking_posts').update({ status: 'matched' }).eq('id', postId)
    await supabase.from('matchmaking_responses').update({ status: 'accepted' }).eq('post_id', postId).eq('responder_id', responderId)
    const { error: nErr } = await supabase.from('notifications').insert({
      user_id: responderId, type: 'match_accepted',
      title: '约球已确认！',
      content: `${profile?.nickname || profile?.username} 接受了你的约球请求，快和「${post?.title}」打球吧！`,
      related_id: postId,
    })
    if (nErr) console.error('通知发送失败:', nErr)
    loadPosts()
  }

  const isExpired = (t: string) => new Date(t) < new Date()

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">自由约球</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          {showForm ? '取消' : '发布约球'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="标题（如：今晚找人打球）" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input value={location} onChange={e => setLocation(e.target.value)} required placeholder="地点" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input type="datetime-local" value={matchTime} onChange={e => setMatchTime(e.target.value)} required className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input value={skillLevel} onChange={e => setSkillLevel(e.target.value)} placeholder="水平说明（可选）" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="备注/个人声明（可选）" rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
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
          {posts.map(p => {
            const expired = isExpired(p.match_time)
            const myResp = myRespMap[p.id]
            const responded = !!myResp
            const isAuthor = p.author_id === profile?.id

            return (
              <div key={p.id} className={`rounded-xl p-4 shadow-sm transition ${
                expired ? 'bg-gray-50 opacity-60' :
                responded && !isAuthor ? 'bg-blue-50 border border-blue-200' :
                'bg-white'
              }`}>
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
                    p.status === 'open' ? (responded && !isAuthor ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700') :
                    p.status === 'matched' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {expired ? '已过期' :
                     p.status === 'open' && responded && !isAuthor ? '已约' :
                     p.status === 'open' ? '开放' :
                     p.status === 'matched' ? '已匹配' : '已关闭'}
                  </span>
                </div>
                <p className="text-sm font-medium">{p.title}</p>
                {p.skill_level && <p className="text-xs text-gray-500 mt-1">水平: {p.skill_level}</p>}
                {p.note && <p className="text-xs text-gray-500 mt-1">{p.note}</p>}

                {/* 非发布者操作区 */}
                {!isAuthor && p.status === 'open' && !expired && profile && (
                  <div className="flex gap-2 mt-3">
                    {responded && myResp?.status === 'pending' ? (
                      <>
                        <span className="text-xs text-blue-600 px-2 py-1">⏳ 等待对方确认</span>
                        <button onClick={() => handleCancelRespond(p.id)}
                          className="px-3 py-1.5 border border-red-300 text-red-500 rounded-lg text-xs hover:bg-red-50">
                          放弃约球
                        </button>
                      </>
                    ) : !responded ? (
                      <button onClick={() => handleRespond(p.id, p.author_id)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
                        我要约
                      </button>
                    ) : null}
                  </div>
                )}

                {/* 发布者：查看谁约了 */}
                {isAuthor && p.status === 'open' && (
                  <ResponseList postId={p.id} onAccept={(rid, rname) => handleAccept(p.id, rid, rname)} loadPosts={loadPosts} />
                )}

                {isAuthor && p.status === 'matched' && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-green-600">✅ 已有人接受了你的约球，准备开打吧！</p>
                  </div>
                )}

                {p.author_id && !isAuthor && (
                  <div className="mt-2">
                    <Link to={`/profile/${p.author_id}`} className="text-xs text-blue-600 hover:underline">
                      查看发布者主页
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ResponseList({ postId, onAccept, loadPosts }: { postId: string; onAccept: (id: string, name: string) => void; loadPosts: () => void }) {
  const [responses, setResponses] = useState<any[]>([])

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('matchmaking_responses').select('*').eq('post_id', postId).eq('status', 'pending')
      if (data) {
        const ids = data.map(r => r.responder_id)
        const { data: profiles } = await supabase.from('profiles').select('id, nickname').in('id', ids)
        const nameMap: Record<string, string> = {}
        if (profiles) profiles.forEach(p => { nameMap[p.id] = p.nickname })
        setResponses(data.map(r => ({ ...r, nickname: nameMap[r.responder_id] || '未知' })))
      }
    })()
  }, [postId])

  if (responses.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      <p className="text-xs text-orange-600 font-medium">🙋 {responses.length} 人想和你打球：</p>
      {responses.map(r => (
        <div key={r.id} className="flex items-center justify-between">
          <Link to={`/profile/${r.responder_id}`} className="text-blue-600 text-xs hover:underline">{r.nickname}</Link>
          <button onClick={() => onAccept(r.responder_id, r.nickname)}
            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">
            接受
          </button>
        </div>
      ))}
    </div>
  )
}
