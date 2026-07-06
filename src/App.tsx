import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute, PublicRoute } from './components/common/ProtectedRoute'
import { MainLayout } from './components/layout/MainLayout'
import { initEngines } from './lib/engine-init'
import { useChatCleanup } from './hooks/useChatCleanup'
import { LoginPage } from './pages/LoginPage'
import { LobbyPage } from './pages/LobbyPage'
import { MatchmakingPage } from './pages/MatchmakingPage'
import { RankingsPage } from './pages/RankingsPage'
import { HistoryPage } from './pages/HistoryPage'
import { ChatPage } from './pages/ChatPage'
import { ProfilePage } from './pages/ProfilePage'
import { MatchCreatePage } from './pages/MatchCreatePage'
import { MatchDetailPage } from './pages/MatchDetailPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { TournamentCreatePage } from './pages/TournamentCreatePage'
import { TournamentSetupPage } from './pages/TournamentSetupPage'
import { TournamentDetailPage } from './pages/TournamentDetailPage'
import { AdminPage } from './pages/AdminPage'

export default function App() {
  useEffect(() => { initEngines() }, [])
  useChatCleanup()

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={
            <PublicRoute><LoginPage /></PublicRoute>
          } />

          {/* 受保护路由 */}
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/" element={<LobbyPage />} />
            <Route path="/matchmaking" element={<MatchmakingPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/matches/new" element={<MatchCreatePage />} />
            <Route path="/matches/:id" element={<MatchDetailPage />} />
            <Route path="/tournaments/new" element={<TournamentCreatePage />} />
            <Route path="/tournaments/:id/setup" element={<TournamentSetupPage />} />
            <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
