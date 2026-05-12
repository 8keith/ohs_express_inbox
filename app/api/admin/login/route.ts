import { NextRequest, NextResponse } from 'next/server'
import {
  COOKIE_NAME,
  createSessionToken,
  isSecretConfigured,
  sanitizeNext,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!isSecretConfigured()) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const password = (body as { password?: unknown })?.password
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const ok = await verifyPassword(password)
  if (!ok) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = await createSessionToken()
  if (!token) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const next = sanitizeNext((body as { next?: unknown })?.next)
  const res = NextResponse.json({ ok: true, next })
  res.cookies.set(COOKIE_NAME, token, sessionCookieOptions())
  return res
}
