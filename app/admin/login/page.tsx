'use client'

import { useEffect, useState } from 'react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [next, setNext] = useState('/')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const n = params.get('next')
    if (n && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\')) {
      setNext(n)
    }
    if (params.get('error') === 'config') {
      setError('Server is not configured. Set OHS_ADMIN_SECRET (32+ chars) and reload.')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        setError(body.error ?? 'Login failed')
        setLoading(false)
        return
      }
      const data = (await res.json()) as { next?: string }
      window.location.href = data.next ?? '/'
    } catch {
      setError('Network error')
      setLoading(false)
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: 'var(--gray-50)' }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="mb-4 flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md"
            style={{ backgroundColor: 'var(--teal)' }}
          >
            <span className="text-sm font-bold text-white">E</span>
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--gray-900)' }}>
            OHS · Express Inbox
          </span>
        </div>

        <h1 className="mb-1 text-base font-semibold" style={{ color: 'var(--gray-900)' }}>
          Internal access
        </h1>
        <p className="mb-4 text-xs" style={{ color: 'var(--gray-400)' }}>
          Enter the shared admin password to continue.
        </p>

        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--gray-600)' }}>
          Password
        </label>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3 w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
          style={{ borderColor: 'var(--border)', color: 'var(--gray-900)' }}
        />

        {error && (
          <p className="mb-3 text-xs" style={{ color: 'var(--red)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="w-full rounded-md py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--teal)' }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
