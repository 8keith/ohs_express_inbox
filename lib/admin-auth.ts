// Edge-compatible admin auth helpers.
// Used by middleware.ts (Edge runtime) and API route handlers (Node runtime).
// All crypto uses the Web Crypto API (crypto.subtle) so it works in both.

export const COOKIE_NAME = 'ohs_admin'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000

function getSecret(): string | null {
  const s = process.env.OHS_ADMIN_SECRET
  if (!s || s.length < 32) return null
  return s
}

export function isSecretConfigured(): boolean {
  return getSecret() !== null
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(s: string): Uint8Array | null {
  try {
    const pad = (4 - (s.length % 4)) % 4
    const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
    const bin = atob(padded)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return new Uint8Array(sig)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function createSessionToken(): Promise<string | null> {
  const secret = getSecret()
  if (!secret) return null
  const expiry = Date.now() + SESSION_TTL_MS
  const payload = `v1.${expiry}`
  const sig = await hmacSha256(secret, payload)
  return `${payload}.${bytesToBase64Url(sig)}`
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const secret = getSecret()
  if (!secret) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [version, expiryStr, sigB64] = parts
  if (version !== 'v1') return false
  const expiry = Number(expiryStr)
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false
  const payload = `${version}.${expiryStr}`
  const expected = await hmacSha256(secret, payload)
  const provided = base64UrlToBytes(sigB64)
  if (!provided) return false
  return constantTimeEqual(expected, provided)
}

export async function verifyPassword(submitted: string): Promise<boolean> {
  const secret = getSecret()
  if (!secret) return false
  const a = new TextEncoder().encode(submitted)
  const b = new TextEncoder().encode(secret)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}

export function clearCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  }
}

export function sanitizeNext(next: unknown): string {
  if (typeof next !== 'string' || next.length === 0) return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//')) return '/'
  if (next.includes('\\')) return '/'
  return next
}
