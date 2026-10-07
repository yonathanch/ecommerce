'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface AuthContextType {
  token: string | null
  user: any | null
  isLoading: boolean
  login: (token: string, user: any) => void
  logout: () => void
  setUser: (user: any) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (savedToken) {
      setToken(savedToken)
      if (savedUser) setUser(JSON.parse(savedUser))
    }
    setIsLoading(false)
  }, [])

  const login = (token: string, user: any) => {
    setToken(token)
    setUser(user)
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
  }

  const logout = () => {
    // Revoke the refresh token server-side (fire-and-forget; cookie cleared by server)
    fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002/api') + '/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
