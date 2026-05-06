import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT =
  "You are a helpful medical clinic receptionist. Write a brief, warm, professional reply to this parent email. Keep it under 100 words. Do not include any medical advice. Sign off as 'The Care Team'."

export async function POST(request: NextRequest) {
  try {
    const { subject, from, body } = await request.json()

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Subject: ${subject}\nFrom: ${from}\n\n${body}`,
        },
      ],
    })

    console.log('[draft] Anthropic response:', JSON.stringify(message, null, 2))
    const draft = message.content[0].type === 'text' ? message.content[0].text : ''
    console.log('[draft] returning draft:', draft)
    return NextResponse.json({ draft })
  } catch (err) {
    console.error('[draft]', err)
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 })
  }
}
