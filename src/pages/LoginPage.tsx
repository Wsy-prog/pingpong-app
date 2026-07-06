import { FormEvent, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-sm w-full">
          <div className="text-4xl mb-4">✉️</div>
          <h1 className="text-xl font-bold mb-2">检查你的邮箱</h1>
          <p className="text-gray-600">
            登录链接已发送到 <strong>{email}</strong>，点击链接即可登录。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏓</div>
          <h1 className="text-2xl font-bold">乒乓约球</h1>
          <p className="text-gray-500 text-sm">登录后开始约球</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              邮箱
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '发送中...' : '发送登录链接'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-4">
          无需密码，点击邮件中的链接即可登录
        </p>
      </div>
    </div>
  )
}
