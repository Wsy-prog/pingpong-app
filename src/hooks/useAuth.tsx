import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

interface AuthContextType {
  user: Profile | null
  loading: boolean
  isAdmin: boolean
  signUp: (username: string, password: string, nickname: string) => Promise<string | null>
  signIn: (username: string, password: string) => Promise<string | null>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY = 'pingpong_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch {}
    }
    setLoading(false)
  }, [])

  const signUp = useCallback(async (username: string, password: string, nickname: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('register_user', {
      p_username: username,
      p_password: password,
      p_nickname: nickname,
    })
    if (error) return error.message
    const result = data as any
    if (result.error) return result.error
    const profile: Profile = {
      id: result.id,
      username: result.username,
      nickname: result.nickname,
      elo_score: result.elo_score,
      is_admin: result.is_admin || false,
      created_at: '',
    }
    setUser(profile)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    return null
  }, [])

  const signIn = useCallback(async (username: string, password: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('login_user', {
      p_username: username,
      p_password: password,
    })
    if (error) return error.message
    const result = data as any
    if (result.error) return result.error
    const profile: Profile = {
      id: result.id,
      username: result.username,
      nickname: result.nickname,
      elo_score: result.elo_score,
      is_admin: result.is_admin || false,
      created_at: '',
    }
    setUser(profile)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    return null
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin: user?.is_admin === true, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
