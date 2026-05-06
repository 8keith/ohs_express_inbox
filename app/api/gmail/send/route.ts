import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function rfc2047(value: string): string {
  return `=?utf-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
}

function buildRawEmail(to: string, subject: string, body: string): string {
  const rawSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`
  const email = [
    `To: ${to}`,
    `Subject: ${rfc2047(rawSubject)}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n')
  return Buffer.from(email).toString('base64url')
}

export async function POST(request: NextRequest) {
  try {
    const { messageId, threadId, to, subject, body } = await request.json()

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    )
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

    const gmail = google.gmail({ version: 'v1', auth })

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: buildRawEmail(to, subject, body),
        threadId,
      },
    })

    if (messageId) {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[gmail/send]', err)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
