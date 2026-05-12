import { NextRequest, NextResponse } from 'next/server'
import { google, gmail_v1 } from 'googleapis'
import { COOKIE_NAME, verifySessionToken } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const messageId = request.nextUrl.searchParams.get('messageId')
  if (!messageId) {
    return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

  const gmail = google.gmail({ version: 'v1', auth })

  try {
    const { data } = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const headers = data.payload?.headers ?? []
    const h = (name: string) =>
      headers.find((hdr) => hdr.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

    return NextResponse.json({
      subject: h('Subject'),
      from: h('From'),
      to: h('To'),
      date: h('Date'),
      body: extractPlainText(data.payload ?? {}),
    })
  } catch (err) {
    console.error('[gmail/message]', err)
    return NextResponse.json({ error: 'Failed to fetch message' }, { status: 500 })
  }
}

function extractPlainText(part: gmail_v1.Schema$MessagePart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf-8')
  }
  for (const child of part.parts ?? []) {
    const text = extractPlainText(child)
    if (text) return text
  }
  return ''
}
