import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext()

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [refreshToken, setRefreshToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initializeAuth = async () => {
      const storedAccessToken = localStorage.getItem('accessToken')
      const storedRefreshToken = localStorage.getItem('refreshToken')

      if (storedAccessToken) {
        setAccessToken(storedAccessToken)
        setRefreshToken(storedRefreshToken)
        setUser({ id: 'user' })
      } else if (storedRefreshToken) {
        setRefreshToken(storedRefreshToken)
        const refreshedAccessToken = await refreshAccessToken(storedRefreshToken)
        if (refreshedAccessToken) {
          setUser({ id: 'user' })
        }
      }

      setLoading(false)
    }

    initializeAuth()
  }, [])

  const register = async (username, password) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Registration failed')
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  const login = async (username, password) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Login failed')
      }

      const data = await response.json()
      const { accessToken, refreshToken } = data

      setAccessToken(accessToken)
      setRefreshToken(refreshToken)
      setUser({ id: 'user' })
      localStorage.setItem('accessToken', accessToken)
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken)
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      console.error('Logout request failed:', error)
    } finally {
      setUser(null)
      setAccessToken(null)
      setRefreshToken(null)
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
    }
  }

  const refreshAccessToken = async (overrideRefreshToken = null) => {
    const tokenToSend = overrideRefreshToken || refreshToken
    if (!tokenToSend) {
      logout()
      return null
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/token`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToSend }),
      })

      if (!response.ok) {
        logout()
        return null
      }

      const data = await response.json()
      const { accessToken: newAccessToken } = data
      if (!newAccessToken) {
        logout()
        return null
      }

      setAccessToken(newAccessToken)
      localStorage.setItem('accessToken', newAccessToken)
      return newAccessToken
    } catch (error) {
      logout()
      return null
    }
  }

  const authFetch = async (input, init = {}) => {
    const headers = { ...(init.headers || {}) }
    const hasContentType = Object.keys(headers).some(
      (key) => key.toLowerCase() === 'content-type'
    )

    if (!hasContentType && !(init.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }
    
    if (refreshToken) {
      headers['x-refresh-token'] = refreshToken
    }

    const options = {
      ...init,
      credentials: 'include',
      headers,
    }

    let response = await fetch(input, options)
    const newAccessToken = response.headers.get('x-access-token')

    if (newAccessToken) {
      setAccessToken(newAccessToken)
      localStorage.setItem('accessToken', newAccessToken)
    }

    if (response.status === 401 && !init._retry) {
      const refreshedToken = await refreshAccessToken()
      if (refreshedToken) {
        const retryHeaders = { ...(init.headers || {}), Authorization: `Bearer ${refreshedToken}` }
        return authFetch(input, {
          ...init,
          credentials: 'include',
          headers: retryHeaders,
          _retry: true,
        })
      }
    }

    return response
  }

  const value = {
    user,
    accessToken,
    loading,
    register,
    login,
    logout,
    refreshAccessToken,
    authFetch,
    isAuthenticated: !!user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
