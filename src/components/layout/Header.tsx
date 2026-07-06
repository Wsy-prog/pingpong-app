import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export function Header() {
  const { user, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [chatUnread, setChatUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    loadUnreadCount()
    loadChatUnread()

    const ch1 = supabase.channel('notif-count')
    ch1.on('postgres_changes' as any,
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
      () => loadUnreadCount()
    ).subscribe()

    const ch2 = supabase.channel('header-chat')
    ch2.on('postgres_changes' as any,
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
      () => loadChatUnread()
    ).subscribe()

    const interval = setInterval(() => { loadUnreadCount(); loadChatUnread() }, 15000)
    return () => { clearInterval(interval); supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [user])

  async function loadUnreadCount() {
    if (!user) return
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false)
    if (count !== null) setUnreadCount(count)
  }

  async function loadChatUnread() {
    if (!user) return
    let lastRead: Record<string, string> = {}
    try { lastRead = JSON.parse(localStorage.getItem('chat_last_read') || '{}') } catch {}

    const { data: msgs } = await supabase.from('messages').select('sender_id').eq('receiver_id', user.id)
    if (!msgs) return
    const uniqueSenders = [...new Set(msgs.map((m: any) => m.sender_id))]
    let total = 0
    for (const sid of uniqueSenders) {
      const since = lastRead[sid]
      if (!since) { total++; continue }
      const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true })
        .eq('sender_id', sid).eq('receiver_id', user.id).gt('created_at', since)
      if (count) total += count
    }
    setChatUnread(total)
  }

  const handleSignOut = () => { signOut(); navigate('/login') }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="text-lg font-bold text-blue-600">🏓 乒乓约球</Link>

        {user && (
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-gray-600 hover:text-blue-600 font-medium">主页</Link>
            <Link to="/matchmaking" className="text-sm text-gray-600 hover:text-blue-600">约球</Link>
            <Link to="/tournaments/new" className="text-sm text-gray-600 hover:text-blue-600">赛事</Link>
            <Link to="/rankings" className="text-sm text-gray-600 hover:text-blue-600">排名</Link>
            <Link to="/chat" className="relative text-sm text-gray-600 hover:text-blue-600">
              聊天
              {chatUnread > 0 && (
                <span className="absolute -top-2 -right-3 text-xs bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
            </Link>
            <Link to="/notifications" className="relative text-sm text-gray-600 hover:text-blue-600">
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 text-xs bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
            {isAdmin && (
              <Link to="/admin" className="text-sm text-red-500 hover:text-red-600 font-medium">管理</Link>
            )}
            <Link to={`/profile/${user.id}`} className="text-sm font-medium text-gray-800">
              {user.nickname || '我'}
            </Link>
            <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-red-500">退出</button>
          </div>
        )}
      </div>
    </header>
  )
}
