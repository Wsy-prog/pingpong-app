import { useEffect, useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

type ViewMode = 'all' | 'mine'

export function MatchmakingPage() {
  const { user: profile } = useAuth()
  const [posts, setPosts] = useState<any[]>([])
  const [myRespMap, setMyRespMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [view, setView] = useState<ViewMode>('all')
  const [showAwaiting, setShowAwaiting] = useState(true)
  const [showPending, setShowPending] = useState(true)
  const [showMatched, setShowMatched] = useState(true)
  const [showNoResp, setShowNoResp] = useState(true)
  const [showPublished, setShowPublished] = useState(true)
  const [showExpiredMine, setShowExpiredMine] = useState(true)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [matchTime, setMatchTime] = useState('')
  const [matchEndTime, setMatchEndTime] = useState('')
  const [note, setNote] = useState('')
  const [skillLevel, setSkillLevel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadPosts(); cleanupOldPosts() }, [])

  async function cleanupOldPosts() {
    const now = new Date().toISOString()
    await supabase
      .from('matchmaking_posts')
      .update({ status: 'closed' })
      .eq('status', 'open')
      .or(`match_end_time.lt.${now},and(match_end_time.is.null,match_time.lt.${now})`)
  }

  async function loadPosts() {
    const { data: posts } = await supabase.from('matchmaking_posts').select('*').order('created_at', { ascending: false })
    if (!posts) { setLoading(false); return }

    const authorIds = [...new Set(posts.map(p => p.author_id))]
    const { data: authors } = await supabase.from('profiles').select('id, nickname').in('id', authorIds)
    const authorMap: Record<string, string> = {}
    if (authors) authors.forEach(a => { authorMap[a.id] = a.nickname })

    if (profile) {
      const { data: myResps } = await supabase.from('matchmaking_responses').select('*').eq('responder_id', profile.id)
      const m: Record<string, any> = {}
      if (myResps) myResps.forEach(r => { m[r.post_id] = r })

      // 同时加载别人响应我的帖子（用于"待接受"分区判断）
      const myPostIds = posts.filter(p => p.author_id === profile.id).map(p => p.id)
      if (myPostIds.length > 0) {
        const { data: othersResps } = await supabase
          .from('matchmaking_responses')
          .select('*')
          .in('post_id', myPostIds)
          .eq('status', 'pending')
        if (othersResps) {
          othersResps.forEach(r => { m[r.post_id] = r })
        }
      }
      setMyRespMap({ ...m })
    }

    // 为已匹配的帖子获取接受的响应者信息
    const matchedPosts = posts.filter(p => p.status === 'matched')
    const acceptedRespMap: Record<string, any> = {}
    if (matchedPosts.length > 0) {
      for (const p of matchedPosts) {
        const { data: accepted } = await supabase
          .from('matchmaking_responses')
          .select('responder_id')
          .eq('post_id', p.id)
          .eq('status', 'accepted')
          .maybeSingle()
        if (accepted) {
          const { data: respProfile } = await supabase
            .from('profiles')
            .select('id, nickname')
            .eq('id', accepted.responder_id)
            .single()
          acceptedRespMap[p.id] = respProfile ? { nickname: respProfile.nickname, id: respProfile.id } : null
        }
      }
    }

    setPosts(posts.map(p => ({
      ...p,
      author: { nickname: authorMap[p.author_id] || '未知' },
      acceptedResponder: acceptedRespMap[p.id] || null,
    })))
    setLoading(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSubmitting(true); setError('')
    const startISO = new Date(matchTime).toISOString()
    const endISO = matchEndTime ? new Date(matchEndTime).toISOString() : null
    const { error: err } = await supabase.from('matchmaking_posts').insert({
      author_id: profile.id, title, location, match_time: startISO, match_end_time: endISO, note: note || null, skill_level: skillLevel || null,
    })
    if (err) { setError('发布失败: ' + err.message); setSubmitting(false); return }
    setShowForm(false); setTitle(''); setLocation(''); setMatchTime(''); setMatchEndTime(''); setNote(''); setSkillLevel('')
    setSubmitting(false); loadPosts()
  }

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

  async function handleCancelRespond(postId: string) {
    if (!profile) return
    await supabase.from('matchmaking_responses').delete().eq('post_id', postId).eq('responder_id', profile.id)
    loadPosts()
  }

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

  async function handleDeletePost(postId: string) {
    if (!profile) return
    const ok = window.confirm('确定删除这条约球信息吗？')
    if (!ok) return
    const { error: rErr } = await supabase.from('matchmaking_responses').delete().eq('post_id', postId)
    if (rErr) console.error('删除响应失败:', rErr)
    const { error: err } = await supabase.from('matchmaking_posts').delete().eq('id', postId)
    if (err) { setError('删除失败: ' + err.message); return }
    loadPosts()
  }

  const isExpired = (p: any) => {
    if (p.match_end_time) return new Date(p.match_end_time) < new Date()
    return new Date(p.match_time) < new Date()
  }

  // ---- 过滤逻辑 ----

  // 所有约球：仅显示用户可以约的（排除自己发布的、以及我已经响应过的）
  const allOpen = posts.filter(p => p.status === 'open' && !isExpired(p) && p.author_id !== profile?.id && !myRespMap[p.id])
  const allMatched = posts.filter(p => p.status === 'matched')
  const allClosed = posts.filter(p => p.status === 'closed' || isExpired(p))

  // 我的约球
  const myMatched = posts.filter(p => {
    if (p.status !== 'matched') return false
    if (p.author_id === profile?.id) return true
    const resp = myRespMap[p.id]
    return resp && resp.status === 'accepted'
  })
  const myPending = posts.filter(p => {
    if (p.author_id === profile?.id) return false
    if (isExpired(p) || p.status === 'closed') return false
    const resp = myRespMap[p.id]
    return resp && resp.status === 'pending'
  })
  // 我发布、有人响应、等我来接受
  const myAwaitingAccept = posts.filter(p => {
    if (p.author_id !== profile?.id) return false
    if (p.status !== 'open' || isExpired(p)) return false
    // 有 pending 响应才算有待接受
    const hasPendingResp = Object.values(myRespMap).some((r: any) => r.post_id === p.id && r.status === 'pending')
    return hasPendingResp
  })
  // 我发布、无人响应
  const myAwaitingIds = new Set(myAwaitingAccept.map(p => p.id))
  const myNoResp = posts.filter(p => p.author_id === profile?.id && p.status === 'open' && !isExpired(p) && !myAwaitingIds.has(p.id))
  // 我发布且已下架/已关闭（排除已匹配、已过期、已在上面的）
  const myUpperNoResp = new Set([...myMatched, ...myPending, ...myAwaitingAccept, ...myNoResp].map(p => p.id))
  const myPublished = posts.filter(p => {
    if (p.author_id !== profile?.id) return false
    if (myUpperNoResp.has(p.id)) return false
    return !isExpired(p) && p.status !== 'matched'
  })
  // 已过期
  const myUpperIds = new Set([...myMatched, ...myPending, ...myAwaitingAccept, ...myNoResp, ...myPublished].map(p => p.id))
  const myExpired = posts.filter(p => {
    if (myUpperIds.has(p.id)) return false
    // 必须是与我相关的帖子
    if (p.author_id !== profile?.id && !myRespMap[p.id]) return false
    return isExpired(p) || p.status === 'closed'
  })

  function PostCard({ p, showAuthor = true, borderColor = 'border-l-gray-300' }: { p: any; showAuthor?: boolean; borderColor?: string }) {
    const expired = isExpired(p)
    const myResp = myRespMap[p.id]
    const responded = !!myResp
    const isAuthor = p.author_id === profile?.id

    return (
      <div className={`rounded-xl p-4 shadow-sm transition border-l-4 ${borderColor} ${
        expired ? 'bg-gray-50 opacity-60' : 'bg-white'
      }`}>
        <div className="flex items-start gap-3 mb-2">
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold shrink-0">
              {p.author?.nickname?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-[10px] text-gray-400 leading-none">发布者</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">{p.author?.nickname || '未知'}</p>
            <div className="flex gap-2 text-xs text-gray-400 flex-wrap">
              <span>📅 {new Date(p.match_time).toLocaleDateString('zh-CN')} {new Date(p.match_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
              {p.match_end_time && <span>~ {new Date(p.match_end_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
              <span>📍 {p.location}</span>
            </div>

            {p.status === 'matched' && p.acceptedResponder && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dashed border-gray-200">
                <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold shrink-0">
                  {p.acceptedResponder.nickname?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-700">{p.acceptedResponder.nickname}</p>
                  <p className="text-[10px] text-gray-400">约球对象</p>
                </div>
                <Link to={`/profile/${p.acceptedResponder.id}`}
                  className="ml-auto text-xs text-blue-600 hover:underline shrink-0">
                  主页
                </Link>
              </div>
            )}
          </div>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full shrink-0 ${
            expired ? 'bg-gray-100 text-gray-500' :
            p.status === 'matched' ? 'bg-yellow-100 text-yellow-700' :
            isAuthor ? 'bg-green-100 text-green-700' :
            (responded && myResp?.status === 'accepted') ? 'bg-purple-100 text-purple-700' :
            (responded && myResp?.status === 'pending') ? 'bg-blue-100 text-blue-700' :
            'bg-green-100 text-green-700'
          }`}>
            {expired ? '已过期' :
             p.status === 'matched' ? '✅ 已匹配' :
             isAuthor ? '📣 我发布的' :
             (responded && myResp?.status === 'accepted') ? '✅ 已约上' :
             (responded && myResp?.status === 'pending') ? '⏳ 待确认' :
             '🏓 可约'}
          </span>
        </div>
        <p className="text-sm font-medium">{p.title}</p>
        {p.skill_level && <p className="text-xs text-gray-500 mt-1">水平: {p.skill_level}</p>}
        {p.note && <p className="text-xs text-gray-500 mt-1">{p.note}</p>}

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

        {isAuthor && p.status === 'open' && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="flex items-center justify-between">
              <button onClick={() => handleDeletePost(p.id)}
                className="px-3 py-1 border border-red-300 text-red-500 rounded-lg text-xs hover:bg-red-50">
                删除
              </button>
            </div>
            <ResponseList postId={p.id} onAccept={(rid, rname) => handleAccept(p.id, rid, rname)} loadPosts={loadPosts} />
          </div>
        )}

        {isAuthor && p.status === 'matched' && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-green-600">✅ 已有人接受了你的约球，准备开打吧！</p>
          </div>
        )}

        {showAuthor && p.author_id && !isAuthor && (
          <div className="mt-2">
            <Link to={`/profile/${p.author_id}`} className="text-xs text-blue-600 hover:underline">
              查看发布者主页
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🏓 自由约球</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          {showForm ? '取消' : '发布约球'}
        </button>
      </div>

      {/* 视图切换 */}
      <div className="flex gap-2">
        <button onClick={() => setView('all')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
            view === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          所有约球
        </button>
        <button onClick={() => setView('mine')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
            view === 'mine' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          我的约球
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="标题（如：今晚找人打球）" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input value={location} onChange={e => setLocation(e.target.value)} required placeholder="地点" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <div>
            <input type="datetime-local" value={matchTime} onChange={e => setMatchTime(e.target.value)} required className="w-full px-3 py-2 border rounded-lg text-sm" />
            <p className="text-xs text-gray-400 mt-1">开始时间（必填）</p>
          </div>
          <div>
            <input type="datetime-local" value={matchEndTime} onChange={e => setMatchEndTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <p className="text-xs text-gray-400 mt-1">结束时间（选填）</p>
          </div>
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
      ) : view === 'all' ? (
        /* ===== 所有约球 ===== */
        <div className="space-y-4">
          {allOpen.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">🏓 可以约</p>
              <div className="space-y-3">
                {allOpen.map(p => <PostCard key={p.id} p={p} borderColor="border-l-green-500" />)}
              </div>
            </div>
          )}

          {allOpen.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🏓</div>
              <p>暂无可以约的球</p>
              <button onClick={() => setShowForm(true)} className="text-blue-600 text-sm mt-2">发布一条</button>
            </div>
          )}
        </div>
      ) : (
        /* ===== 我的约球 ===== */
        <div className="space-y-4">
          {myMatched.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">✅ 已约上</p>
                <button onClick={() => setShowMatched(!showMatched)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">
                  {showMatched ? '▲ 收起' : '▼ 展开'}
                </button>
              </div>
              {showMatched && (
                <div className="space-y-3">
                  {myMatched.map(p => <PostCard key={p.id} p={p} borderColor="border-l-green-500" />)}
                </div>
              )}
            </div>
          )}

          {/* ⏳ 待确认 = 我点了"我要约"，等对方确认 */}
          {myPending.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">⏳ 待确认</p>
                <button onClick={() => setShowPending(!showPending)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">
                  {showPending ? '▲ 收起' : '▼ 展开'}
                </button>
              </div>
              {showPending && (
                <div className="space-y-3">
                  {myPending.map(p => <PostCard key={p.id} p={p} borderColor="border-l-orange-400" />)}
                </div>
              )}
            </div>
          )}

          {/* 📩 待接受 = 我发布的，有人申请了 */}
          {myAwaitingAccept.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">📩 待接受</p>
                <button onClick={() => setShowAwaiting(!showAwaiting)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">
                  {showAwaiting ? '▲ 收起' : '▼ 展开'}
                </button>
              </div>
              {showAwaiting && (
                <div className="space-y-3">
                  {myAwaitingAccept.map(p => <PostCard key={p.id} p={p} borderColor="border-l-purple-500" />)}
                </div>
              )}
            </div>
          )}

          {/* 📢 已发布 = 我发布的，没人响应 */}
          {myNoResp.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">📢 已发布</p>
                <button onClick={() => setShowNoResp(!showNoResp)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">
                  {showNoResp ? '▲ 收起' : '▼ 展开'}
                </button>
              </div>
              {showNoResp && (
                <div className="space-y-3">
                  {myNoResp.map(p => <PostCard key={p.id} p={p} borderColor="border-l-teal-500" />)}
                </div>
              )}
            </div>
          )}

          {/* 📣 旧的/已下架/手动关闭的 */}
          {myPublished.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">📣 我发布的</p>
                <button onClick={() => setShowPublished(!showPublished)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">
                  {showPublished ? '▲ 收起' : '▼ 展开'}
                </button>
              </div>
              {showPublished && (
                <div className="space-y-3">
                  {myPublished.map(p => <PostCard key={p.id} p={p} borderColor="border-l-cyan-500" />)}
                </div>
              )}
            </div>
          )}

          {myExpired.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">📦 已过期</p>
                <button onClick={() => setShowExpiredMine(!showExpiredMine)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">
                  {showExpiredMine ? '▲ 收起' : '▼ 展开'}
                </button>
              </div>
              {showExpiredMine && (
                <div className="space-y-3">
                  {myExpired.map(p => <PostCard key={p.id} p={p} borderColor="border-l-gray-400" />)}
                </div>
              )}
            </div>
          )}

          {myMatched.length === 0 && myPending.length === 0 && myAwaitingAccept.length === 0 && myNoResp.length === 0 && myPublished.length === 0 && myExpired.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🏓</div>
              <p>你还没有参与任何约球</p>
              <button onClick={() => setView('all')} className="text-blue-600 text-sm mt-2">去看看可约的球</button>
            </div>
          )}
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
