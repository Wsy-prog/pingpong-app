import { useEffect, useState, useRef, FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const LAST_READ_KEY = 'chat_last_read'

function getLastRead(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LAST_READ_KEY) || '{}') } catch { return {} }
}
function setLastRead(userId: string) {
  const map = getLastRead()
  map[userId] = new Date().toISOString()
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(map))
}

export function ChatPage() {
  const { user: profile } = useAuth()
  const [searchParams] = useSearchParams()
  const privateUserId = searchParams.get('user')

  const [tab, setTab] = useState<'global' | 'private'>(privateUserId ? 'private' : 'global')
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (privateUserId && profile) {
      setTab('private')
      supabase.from('profiles').select('id, nickname').eq('id', privateUserId).single()
        .then(({ data }) => { if (data) setSelectedUser(data) })
    }
  }, [])

  // 一进入页面就计算所有私聊未读，不管在哪个 tab
  useEffect(() => {
    if (!profile) return
    const lastRead = getLastRead()
    // 先查出所有其他用户
    supabase.from('profiles').select('id, nickname').limit(50)
      .then(({ data }) => {
        if (!data) return
        const others = data.filter((u: any) => u.id !== profile.id)
        // 计算每个用户的未读
        const map: Record<string, number> = {}
        Promise.all(others.map(async (u: any) => {
          const since = lastRead[u.id]
          // 从未读过
          if (!since) {
            // 查这个人是否发过私信给我
            const { count } = await supabase
              .from('messages').select('*', { count: 'exact', head: true })
              .eq('sender_id', u.id).eq('receiver_id', profile.id)
            if (count && count > 0) map[u.id] = count
            return
          }
          const { count } = await supabase
            .from('messages').select('*', { count: 'exact', head: true })
            .eq('sender_id', u.id).eq('receiver_id', profile.id)
            .gt('created_at', since)
          if (count && count > 0) map[u.id] = count
        })).then(() => {
          console.log('chat unread:', map)
          setUnreadCounts(map)
        })
      })
  }, [profile])

  // 加载用户列表
  useEffect(() => {
    if (tab === 'private' && profile && allUsers.length === 0) {
      supabase.from('profiles').select('id, nickname').limit(50)
        .then(({ data }) => {
          if (data) setAllUsers(data.filter((u: any) => u.id !== profile.id))
        })
    }
  }, [tab, profile])

  // 选人时标记已读
  useEffect(() => {
    if (selectedUser) {
      setLastRead(selectedUser.id)
      setUnreadCounts(prev => {
        const next = { ...prev }
        delete next[selectedUser.id]
        return next
      })
    }
  }, [selectedUser?.id])

  // 加载消息
  useEffect(() => {
    if (!profile) return
    setLoading(true)
    const fn = async () => {
      let data: any[] = []
      if (tab === 'global') {
        const r = await supabase.from('messages').select('*').is('receiver_id', null).order('created_at', { ascending: true }).limit(100)
        data = r.data || []
      } else if (selectedUser) {
        const r = await supabase.from('messages').select('*')
          .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${profile.id})`)
          .order('created_at', { ascending: true })
        data = r.data || []
      }
      const ids = [...new Set(data.map((m: any) => m.sender_id))]
      if (ids.length > 0) {
        const r = await supabase.from('profiles').select('id, nickname').in('id', ids)
        const nm: any = {}
        if (r.data) r.data.forEach((s: any) => { nm[s.id] = s.nickname })
        setMessages(data.map((m: any) => ({ ...m, sender: { nickname: nm[m.sender_id] || '?' } })))
      } else {
        setMessages([])
      }
      setLoading(false)
    }
    fn()
  }, [tab, selectedUser?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 实时监听
  useEffect(() => {
    const channel = supabase.channel('chat-' + Date.now())
    channel.on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: any) => {
      const n = payload.new
      if (profile && n.receiver_id === profile.id && n.sender_id !== selectedUser?.id) {
        setUnreadCounts(prev => ({ ...prev, [n.sender_id]: (prev[n.sender_id] || 0) + 1 }))
      }
      if (tab === 'global' && !n.receiver_id) loadFresh()
      else if (selectedUser && profile && (
        (n.sender_id === profile.id && n.receiver_id === selectedUser.id) ||
        (n.sender_id === selectedUser.id && n.receiver_id === profile.id)
      )) loadFresh()
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tab, selectedUser?.id])

  async function loadFresh() {
    if (!profile) return
    let d: any[] = []
    if (tab === 'global') {
      const r = await supabase.from('messages').select('*').is('receiver_id', null).order('created_at', { ascending: true }).limit(100)
      d = r.data || []
    } else if (selectedUser) {
      const r = await supabase.from('messages').select('*')
        .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${profile.id})`)
      d = r.data || []
    }
    const ids = [...new Set(d.map((m: any) => m.sender_id))]
    const r = await supabase.from('profiles').select('id, nickname').in('id', ids)
    const nm: any = {}
    if (r.data) r.data.forEach((s: any) => { nm[s.id] = s.nickname })
    setMessages(d.map((m: any) => ({ ...m, sender: { nickname: nm[m.sender_id] || '?' } })))
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || !profile) return
    const { error } = await supabase.from('messages').insert({
      sender_id: profile.id,
      receiver_id: tab === 'private' ? selectedUser?.id || null : null,
      content: input.trim(),
    })
    if (!error) setInput('')
  }

  const totalPrivateUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-lg mx-auto">
      <div className="flex gap-2 mb-3">
        <button onClick={() => { setTab('global'); setSelectedUser(null) }}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'global' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          💬 全局频道
        </button>
        <button onClick={() => { setTab('private'); setSelectedUser(null) }}
          className={`relative px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'private' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          🔒 私聊
          {totalPrivateUnread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {totalPrivateUnread > 9 ? '9+' : totalPrivateUnread}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 flex gap-3 overflow-hidden">
        {tab === 'private' && (
          <div className="w-28 flex-shrink-0 overflow-y-auto space-y-1">
            <p className="text-xs text-gray-400 px-2 mb-1">选择聊天对象</p>
            {allUsers.map((u: any) => {
              const uc = unreadCounts[u.id] || 0
              return (
                <button key={u.id} onClick={() => setSelectedUser(u)}
                  className={`relative w-full text-left px-2 py-2 rounded-lg text-xs transition ${
                    selectedUser?.id === u.id ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                  }`}>
                  {u.nickname}
                  {uc > 0 && (
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                      {uc > 9 ? '9+' : uc}
                    </span>
                  )}
                </button>
              )
            })}
            {allUsers.length === 0 && <p className="text-xs text-gray-400 px-2">暂无用户</p>}
          </div>
        )}

        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm overflow-hidden">
          {tab === 'private' && !selectedUser ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              请从左侧选择聊天对象
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loading ? (
                  <p className="text-center text-gray-400 text-sm py-10">加载中...</p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-10">
                    {tab === 'global' ? '暂时没有消息' : '开始聊天吧！'}
                  </p>
                ) : (
                  messages.map((m: any) => (
                    <div key={m.id} className={`flex ${m.sender_id === profile?.id ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                        m.sender_id === profile?.id ? 'bg-blue-600 text-white' : 'bg-gray-100'
                      }`}>
                        {tab === 'global' && m.sender_id !== profile?.id && (
                          <p className="text-xs opacity-70 mb-0.5">{m.sender?.nickname || '?'}</p>
                        )}
                        <p>{m.content}</p>
                        <p className={`text-xs mt-0.5 ${m.sender_id === profile?.id ? 'text-blue-200' : 'text-gray-400'}`}>
                          {new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendMessage} className="border-t p-3 flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)}
                  placeholder={tab === 'global' ? '发消息...' : `发给 ${selectedUser?.nickname || '...'}`}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="submit" disabled={!input.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  发送
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
