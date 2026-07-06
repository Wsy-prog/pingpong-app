import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

interface UserInfo {
  id: string
  username: string
  nickname: string
  elo_score: number
  created_at: string
  match_count: number
}

export function AdminPage() {
  const { user, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) { navigate('/', { replace: true }); return }
    loadUsers()
  }, [])

  async function loadUsers() {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (!profiles) { setLoading(false); return }

    const usersWithCounts: UserInfo[] = await Promise.all(
      profiles.map(async (p) => {
        const { count } = await supabase
          .from('matches').select('*', { count: 'exact', head: true })
          .or(`player1_id.eq.${p.id},player2_id.eq.${p.id}`)
        return {
          id: p.id, username: p.username, nickname: p.nickname,
          elo_score: p.elo_score, created_at: p.created_at,
          match_count: count || 0,
        }
      })
    )
    setUsers(usersWithCounts)
    setLoading(false)
  }

  async function handleDeleteUser(targetId: string) {
    setError('')
    setSuccess('')
    const { data, error: err } = await supabase.rpc('admin_delete_user', {
      p_admin_id: user!.id,
      p_target_id: targetId,
    })
    if (err) { setError(err.message); return }
    const result = data as any
    if (result.error) { setError(result.error); return }
    setSuccess('用户已注销')
    setConfirmUserId(null)
    loadUsers()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">⚙️ 管理后台</h1>
          <p className="text-sm text-gray-500">管理员: {user?.nickname}</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">{success}</div>}

      {/* 用户管理 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm flex items-center justify-between">
          <span>用户管理 ({users.length} 人)</span>
          <span className="text-xs text-gray-400">点击用户名可查看主页</span>
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
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <a href={`/profile/${u.id}`} className="text-blue-600 hover:underline">{u.username}</a>
                    </td>
                    <td className="px-3 py-2">{u.nickname}</td>
                    <td className="px-3 py-2 text-center font-medium">{u.elo_score}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{u.match_count}</td>
                    <td className="px-3 py-2 text-center">
                      {u.username === 'guanliyuan' ? (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">管理员</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">用户</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {u.username !== 'guanliyuan' && (
                        confirmUserId === u.id ? (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => handleDeleteUser(u.id)}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">
                              确认注销
                            </button>
                            <button onClick={() => setConfirmUserId(null)}
                              className="px-2 py-1 border rounded text-xs hover:bg-gray-50">
                              取消
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmUserId(u.id)}
                            className="px-2 py-1 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50">
                            注销
                          </button>
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

      {/* 预留：后续管理员功能扩展区 */}
      <div className="bg-gray-50 rounded-xl p-6 border-2 border-dashed border-gray-200 text-center">
        <p className="text-sm text-gray-400 font-medium">📦 管理员功能扩展区</p>
        <p className="text-xs text-gray-300 mt-1">后续将在这里添加：数据统计 / 系统设置 / 公告管理 / 积分调整 等功能</p>
      </div>
    </div>
  )
}
