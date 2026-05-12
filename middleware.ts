import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, isSecretConfigured, verifySessionToken } from '@/lib/admin-auth'

const PUBLIC_PATHS = new Set<string>([
  '/admin/login',
  '/api/admin/login',
  '/api/admin/logout',
  '/favicon.svg',
  '/robots.txt',
])

const STATIC_FILE_RE = /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?|ttf|otf)$/i

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  if (pathname.startsWith('/_next/')) return true
  if (STATIC_FILE_RE.test(pathname)) return true
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  // Fail closed if secret is not configured or is too short.
  if (!isSecretConfigured()) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    url.searchParams.set('error', 'config')
    return NextResponse.redirect(url)
  }

  const token = request.cookies.get(COOKIE_NAME)?.value
  const ok = await verifySessionToken(token)
  if (ok) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = request.nextUrl.clone()
  url.pathname = '/admin/login'
  url.searchParams.set('next', pathname + search)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
