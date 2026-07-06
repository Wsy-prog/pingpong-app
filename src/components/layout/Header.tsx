import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export function Header() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="text-lg font-bold text-blue-600">
          🏓 乒乓约球
        </Link>

        {user && (
          <div className="flex items-center gap-4">
            <Link to="/matchmaking" className="text-sm text-gray-600 hover:text-blue-600">
              约球
            </Link>
            <Link to="/tournaments/new" className="text-sm text-gray-600 hover:text-blue-600">
              赛事
            </Link>
            <Link to="/rankings" className="text-sm text-gray-600 hover:text-blue-600">
              排名
            </Link>
            <Link to="/chat" className="text-sm text-gray-600 hover:text-blue-600">
              聊天
            </Link>
            <Link to={`/profile/${profile?.id}`} className="text-sm font-medium text-gray-800">
              {profile?.nickname || '我'}
            </Link>
            <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-red-500">
              退出
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
