import { useEffect, useState, useRef, FormEvent } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface ChatMessage {
  id: string
  sender_id: string
  receiver_id: string | null
  content: string
  created_at: string
  sender?: { nickname: string }
}

export function ChatPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const privateUserId = searchParams.get('user')

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [contacts, setContacts] = useState<{ id: string; nickname: string; lastMsg?: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'global' | 'private'>(privateUserId ? 'private' : 'global')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMessages()
    setupRealtime()
  }, [tab, privateUserId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    setLoading(true)
    if (tab === 'global') {
      const { data } = await supabase
        .from('messages')
        .select('*, sender:profiles!sender_id(nickname)')
        .is('receiver_id', null)
        .order('created_at', { ascending: true })
        .limit(100)
      if (data) setMessages(data as any)
    } else {
      const userId = profile?.id
      const otherId = privateUserId
      if (!userId || !otherId) { setLoading(false); return }
      const { data } = await supabase
        .from('messages')
        .select('*, sender:profiles!sender_id(nickname)')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
        .order('created_at', { ascending: true })
      if (data) setMessages(data as any)
    }
    setLoading(false)
    loadContacts()
  }

  async function loadContacts() {
    const userId = profile?.id
    if (!userId) return
    // 获取有过私聊的联系人
    const { data } = await supabase
      .from('messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .not('receiver_id', 'is', null)
      .order('created_at', { ascending: false })

    if (!data) return
    const contactIds = new Set<string>()
    data.forEach((m: any) => {
      const other = m.sender_id === userId ? m.receiver_id : m.sender_id
      if (other) contactIds.add(other)
    })

    const contactList = await Promise.all(
      Array.from(contactIds).slice(0, 20).map(async (id) => {
        const { data: p } = await supabase.from('profiles').select('nickname').eq('id', id).single()
        return { id, nickname: (p as any)?.nickname || '未知' }
      })
    )
    setContacts(contactList)
  }

  function setupRealtime() {
    const channel = supabase.channel('chat-room')

    channel.on(
      'postgres_changes' as any,
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: tab === 'global' ? 'receiver_id=is.null' : undefined,
      },
      (payload: any) => {
        // 只添加匹配当前 tab 的消息
        if (tab === 'global' && !payload.new.receiver_id) {
          loadMessages()
        } else if (tab === 'private') {
          const userId = profile?.id
          const otherId = privateUserId
          if (userId && otherId &&
            ((payload.new.sender_id === userId && payload.new.receiver_id === otherId) ||
             (payload.new.sender_id === otherId && payload.new.receiver_id === userId))) {
            loadMessages()
          }
        }
      }
    )

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || !profile) return
    const msg = {
      sender_id: profile.id,
      receiver_id: tab === 'private' ? privateUserId || null : null,
      content: input.trim(),
    }
    await supabase.from('messages').insert(msg)
    setInput('')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-lg mx-auto">
      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        <button onClick={() => setTab('global')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'global' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          💬 全局频道
        </button>
        <button onClick={() => setTab('private')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'private' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          🔒 私聊
        </button>
      </div>

      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* 联系人列表（私聊模式） */}
        {tab === 'private' && (
          <div className="w-28 flex-shrink-0 overflow-y-auto space-y-1">
            {contacts.map(c => (
              <button key={c.id} onClick={() => window.location.href = `/chat?user=${c.id}`}
                className={`w-full text-left px-2 py-2 rounded-lg text-xs transition ${
                  privateUserId === c.id ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                }`}>
                <p className="font-medium truncate">{c.nickname}</p>
              </button>
            ))}
            {contacts.length === 0 && (
              <p className="text-xs text-gray-400 px-2">暂无联系人</p>
            )}
          </div>
        )}

        {/* 聊天区域 */}
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm overflow-hidden">
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading ? (
              <p className="text-center text-gray-400 text-sm py-10">加载中...</p>
            ) : messages.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">暂无消息</p>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`flex ${m.sender_id === profile?.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                    m.sender_id === profile?.id
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}>
                    {tab === 'global' && m.sender_id !== profile?.id && (
                      <p className="text-xs opacity-70 mb-0.5">{(m as any).sender?.nickname || '匿名'}</p>
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

          {/* 输入框 */}
          <form onSubmit={sendMessage} className="border-t p-3 flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              placeholder={tab === 'global' ? '发送消息到全局频道...' : '发送私聊消息...'}
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" disabled={!input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              发送
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
