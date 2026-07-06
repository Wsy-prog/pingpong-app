import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export function NotificationsPage() {
  const { user: profile } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) loadNotifications()
  }, [profile])

  async function loadNotifications() {
    if (!profile) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setNotifications(data)
    setLoading(false)
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function markAllRead() {
    if (!profile) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          系统通知
          {unreadCount > 0 && (
            <span className="ml-2 text-sm bg-red-500 text-white px-2 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-sm text-blue-600 hover:underline">
            全部标为已读
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-3xl mb-3">🔔</div>
          <p className="text-sm">暂无通知</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div key={n.id}
              className={`rounded-xl p-4 transition cursor-pointer ${n.read ? 'bg-white' : 'bg-blue-50 border border-blue-200'}`}
              onClick={() => markRead(n.id)}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className={`text-sm ${n.read ? 'text-gray-700' : 'font-medium text-gray-900'}`}>{n.title}</p>
                  {n.content && <p className="text-xs text-gray-500 mt-1">{n.content}</p>}
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 flex-shrink-0" />}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {new Date(n.created_at).toLocaleString('zh-CN')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
