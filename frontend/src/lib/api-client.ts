import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'

const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002/api',
  timeout: 10000,
  withCredentials: true, // send httpOnly refresh cookie
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// --- Silent refresh: on 401, call /auth/refresh once and retry the request ---
// Concurrent 401s share a single refresh promise so we never fire N refresh calls.
let refreshPromise: Promise<string | null> | null = null

async function performRefresh(): Promise<string | null> {
  try {
    const res = await axios.post(
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002/api') + '/auth/refresh',
      {},
      { withCredentials: true },
    )
    const newToken: string | undefined = res.data?.accessToken
    if (newToken && typeof window !== 'undefined') {
      window.localStorage.setItem('token', newToken)
      return newToken
    }
    return null
  } catch {
    // Refresh failed (expired/revoked) → user must log in again
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('token')
      window.localStorage.removeItem('user')
    }
    return null
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    const isAuthRoute = original?.url?.includes('/auth/')
    const is401 = error.response?.status === 401

    if (is401 && original && !original._retried && !isAuthRoute) {
      original._retried = true
      refreshPromise = refreshPromise ?? performRefresh()
      const newToken = await refreshPromise
      refreshPromise = null
      if (newToken) {
        original.headers = original.headers ?? {}
        original.headers.Authorization = `Bearer ${newToken}`
        return apiClient(original)
      }
    }
    console.error('API Error:', error)
    return Promise.reject(error)
  },
)

export default apiClient
