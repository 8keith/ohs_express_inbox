import { NextResponse } from 'next/server'
import { COOKIE_NAME, clearCookieOptions } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', clearCookieOptions())
  return res
}
