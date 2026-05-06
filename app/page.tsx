'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────

type Tier = 'Emergency' | 'STAT' | 'Routine' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6'
type FilterType = 'All' | Tier

// Shape returned from Supabase email_events table
interface QueueRow {
  id: string
  tier: Tier
  urgency: string
  inquiry_type: string
  received_at: string
  status: string
  assigned_to_name: string | null
  claimed_at: string | null
  claim_expires_at: string | null
  gmail_message_id: string | null
  gmail_thread_id: string | null
  subject: string | null
  sender: string | null
}

// Kept for the centre panel (static until Gmail wiring)
interface EmailItem {
  id: string
  tier: Tier
  subject: string
  fromName: string
  fromEmail: string
  timestamp: string
  fullDate: string
  unread: boolean
  preview: string
  body: string
}

interface LiveEmail {
  subject: string
  from: string
  to: string
  date: string
  body: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TIER_ORDER: Record<Tier, number> = {
  Emergency: 0, T1: 0,
  STAT: 1,      T2: 1,
  Routine: 2,   T3: 2,
  T4: 3, T5: 4, T6: 5,
}

function sortQueue(rows: QueueRow[], newestFirst: boolean): QueueRow[] {
  return [...rows].sort((a, b) => {
    if (!newestFirst) {
      const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
      if (t !== 0) return t
    }
    return new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
  })
}

function stripDisplayName(sender: string | null): string | null {
  if (!sender) return null
  const idx = sender.indexOf('<')
  return idx > 0 ? sender.slice(0, idx).trim() : sender.trim()
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function splitBody(body: string): { main: string; signature: string | null } {
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '--') {
      return { main: lines.slice(0, i).join('\n').trimEnd(), signature: lines.slice(i).join('\n') }
    }
  }
  for (let i = 3; i < lines.length; i++) {
    if (lines[i].includes('[image:') || /https?:\/\//.test(lines[i])) {
      return { main: lines.slice(0, i).join('\n').trimEnd(), signature: lines.slice(i).join('\n') }
    }
  }
  return { main: body, signature: null }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfItem = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (startOfItem.getTime() === startOfToday.getTime()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  if (startOfItem.getTime() === startOfYesterday.getTime()) {
    return 'Yesterday'
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Static data for centre panel (wired to Gmail in next step) ─────────────

const EMAILS: EmailItem[] = [
  {
    id: '1',
    tier: 'Emergency',
    subject: 'Urgent: Patient BP reading 195/110 — needs immediate callback',
    fromName: 'Sarah Chen',
    fromEmail: 'sarah.chen@gmail.com',
    timestamp: '9:42 AM',
    fullDate: 'Today at 9:42 AM',
    unread: true,
    preview:
      'My mother took her blood pressure this morning and the reading was 195/110. She is 75 years old with a history of hypertension and is currently on lisinopril…',
    body: `Dear OHS Team,

I am writing on behalf of my mother, Margaret Chen (DOB: 07/22/1948, Patient ID: OHS-4821). She took her blood pressure this morning using our home monitor and the reading was 195/110.

She is 75 years old with a known history of hypertension and is currently taking lisinopril 10mg daily. She did take her medication this morning as prescribed.

She is now experiencing a mild but persistent headache and says she feels "not quite right." She has been sitting down and resting but the headache is not improving.

Should we go to the emergency room immediately, or is there something else we should do first? We are very worried and would appreciate a callback as soon as possible.

Her direct phone number is (555) 847-2291. She will be home all day.

Thank you so much for your help.

Best regards,
Sarah Chen
(Daughter and emergency contact for Margaret Chen)`,
  },
  {
    id: '2',
    tier: 'STAT',
    subject: 'Rx refill needed urgently — only 2 days of metformin left',
    fromName: 'Robert Kim',
    fromEmail: 'r.kim@yahoo.com',
    timestamp: '9:15 AM',
    fullDate: 'Today at 9:15 AM',
    unread: true,
    preview:
      'I have only 2 days of metformin 500mg left and am unable to get to the pharmacy until Friday due to work commitments…',
    body: `Hello,

My name is Robert Kim (Patient ID: OHS-3302, DOB: 05/18/1972). I am currently prescribed metformin 500mg twice daily for Type 2 diabetes management.

I have only 2 days of medication left and due to work obligations I am unable to get to the pharmacy until this Friday. I last had this prescription refilled approximately 3 months ago.

Could you please send a refill to Walgreens on Main Street (pharmacy fax: 555-0142)? I have been stable on this dose for over two years with no issues.

Thank you,
Robert Kim`,
  },
  {
    id: '3',
    tier: 'Routine',
    subject: 'Post-op follow-up appointment — scheduling request',
    fromName: 'Amanda Torres',
    fromEmail: 'a.torres@hotmail.com',
    timestamp: '8:58 AM',
    fullDate: 'Today at 8:58 AM',
    unread: true,
    preview:
      'Dr. Williams mentioned I should schedule a 2-week follow-up after my laparoscopic procedure. I am available Monday through Wednesday…',
    body: `Hi there,

I had a laparoscopic appendectomy at Valley General on April 22nd. Dr. Williams told me to schedule a follow-up appointment approximately 2 weeks post-op to check on my recovery.

I am available any time Monday through Wednesday between 9am and 3pm. I can also do a telehealth visit if that's easier to schedule.

My patient ID is OHS-5517 and my callback number is (555) 203-8847.

Thanks,
Amanda Torres`,
  },
  {
    id: '4',
    tier: 'Emergency',
    subject: 'CRITICAL LAB RESULT: Troponin elevated — James Whitfield',
    fromName: 'Valley General Lab',
    fromEmail: 'labs@valleygeneral.org',
    timestamp: 'Yesterday',
    fullDate: 'Yesterday at 4:17 PM',
    unread: false,
    preview:
      'CRITICAL RESULT: Troponin I: 2.45 ng/mL (Ref: <0.04). Patient: James Whitfield, DOB: 03/14/1958. Ordering provider notified…',
    body: `CRITICAL LABORATORY RESULT — IMMEDIATE ATTENTION REQUIRED

Patient: James Whitfield
DOB: 03/14/1958
MRN: VG-8821002

CRITICAL VALUE:
Troponin I: 2.45 ng/mL  (Reference Range: <0.04 ng/mL)

Additional results on this panel:
- CK-MB: 48 U/L (Ref: <25 U/L)  HIGH
- BNP: 312 pg/mL (Ref: <100 pg/mL)  HIGH
- CBC and CMP within normal limits

This result was called to the ordering provider at 16:12. Please acknowledge receipt and document clinical action taken.

Valley General Hospital Laboratory
(555) 900-1100 ext. 4`,
  },
  {
    id: '5',
    tier: 'STAT',
    subject: 'Urgent referral request — cardiology consult for Michael Okafor',
    fromName: 'Dr. Patricia Moore',
    fromEmail: 'pmoore@citymedical.com',
    timestamp: 'Yesterday',
    fullDate: 'Yesterday at 2:41 PM',
    unread: false,
    preview:
      'Requesting urgent cardiology consult for our shared patient Michael Okafor. Recent 12-lead EKG shows new LBBB pattern not seen on prior EKG from January…',
    body: `Dear OHS Team,

I am writing regarding our shared patient, Michael Okafor (DOB: 09/03/1965, your Patient ID: OHS-7743).

Mr. Okafor presented to City Medical today with chest discomfort and shortness of breath on exertion. A 12-lead EKG performed in our office shows a new left bundle branch block (LBBB) pattern not seen on his prior EKG from January.

Given the new LBBB, I would appreciate an urgent cardiology referral for echo and stress testing.

Please advise on next steps. I can be reached at (555) 622-3900.

Best regards,
Dr. Patricia Moore, MD
City Medical Group`,
  },
  {
    id: '6',
    tier: 'Routine',
    subject: 'Insurance pre-auth — MRI lumbar spine, Jennifer Walsh',
    fromName: 'Jennifer Walsh',
    fromEmail: 'j.walsh@gmail.com',
    timestamp: 'Yesterday',
    fullDate: 'Yesterday at 11:08 AM',
    unread: false,
    preview:
      'Blue Cross has requested additional clinical notes for my lumbar MRI pre-authorization. The deadline is this Friday, May 8th…',
    body: `Hello OHS Team,

I received a letter from Blue Cross Blue Shield requesting additional clinical documentation for the pre-authorization of my lumbar spine MRI (CPT 72148).

The letter states they need physician notes documenting at least 6 weeks of conservative treatment failure, including physical therapy records and medication history.

The deadline for submission is this Friday, May 8th. Could you please submit the required documentation to Blue Cross at fax (800) 441-9188? My insurance member ID is BCB-447-22-9901.

Thank you,
Jennifer Walsh
(555) 317-6640`,
  },
]

const DRAFT_TEXT = `Dear Sarah,

Thank you for contacting OHS. A blood pressure reading of 195/110 with accompanying symptoms requires prompt evaluation.

Please take your mother to the nearest emergency room now, or call 911 if her headache intensifies, she develops vision changes, confusion, or chest pain.

Our on-call provider will attempt to reach you at (555) 847-2291 within the next 30 minutes. If you have not heard from us, please proceed directly to the ER without waiting.

Please bring her current medication list if possible.

Warm regards,
OHS Care Team
hello@ohsdemo.com`

const FORWARD_OPTIONS = [
  'On-Call Provider',
  'Nurse Triage',
  'Front Desk',
  'Dr. Williams',
  'Dr. Chen',
]

// ─── Sub-components ─────────────────────────────────────────────────────────

const TIER_STYLES: Record<string, React.CSSProperties> = {
  T1: { backgroundColor: 'var(--teal-light)', color: 'var(--teal-dark)' },
  T2: { backgroundColor: 'var(--teal-light)', color: 'var(--teal-dark)' },
  T3: { backgroundColor: 'var(--amber-light)', color: 'var(--amber)' },
  T4: { backgroundColor: '#eff6ff', color: '#3b82f6' },
  T5: { backgroundColor: '#f5f3ff', color: '#8b5cf6' },
  T6: { backgroundColor: 'var(--gray-100)', color: 'var(--gray-500)' },
  Emergency: { backgroundColor: 'var(--red-light)', color: 'var(--red)' },
  STAT: { backgroundColor: 'var(--amber-light)', color: 'var(--amber)' },
  Routine: { backgroundColor: 'var(--teal-light)', color: 'var(--teal-dark)' },
}

const TIER_LABELS: Record<string, string> = {
  T1: 'T1 appointment', T2: 'T2 clinical',  T3: 'T3 complaint',
  T4: 'T4 billing',     T5: 'T5 staff',      T6: 'T6 other',
}

function TierBadge({ tier }: { tier: string }) {
  const s = TIER_STYLES[tier] ?? { backgroundColor: 'var(--gray-100)', color: 'var(--gray-500)' }
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded font-mono text-[10px] font-semibold tracking-wide"
      style={{ ...s, padding: '4px 14px' }}
    >
      {TIER_LABELS[tier] ?? tier}
    </span>
  )
}

const URGENCY_CONFIG: Record<string, { dot: string; bg: string; text: string }> = {
  Emergency: { dot: 'var(--red)',   bg: 'var(--red-light)',   text: 'var(--red)' },
  STAT:      { dot: 'var(--amber)', bg: 'var(--amber-light)', text: 'var(--amber)' },
  Routine:   { dot: '#22c55e',      bg: '#f0fdf4',            text: '#16a34a' },
  High:      { dot: 'var(--red)',   bg: 'var(--red-light)',   text: 'var(--red)' },
  Medium:    { dot: 'var(--amber)', bg: 'var(--amber-light)', text: 'var(--amber)' },
  Low:       { dot: '#22c55e',      bg: '#f0fdf4',            text: '#16a34a' },
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (urgency === 'Emergency') {
    return (
      <span
        className="inline-flex flex-shrink-0 items-center rounded text-[10px] font-semibold tracking-wide"
        style={{ backgroundColor: '#E24B4A', color: 'white', padding: '4px 14px' }}
      >
        Emergency
      </span>
    )
  }
  const c = URGENCY_CONFIG[urgency] ?? { dot: 'var(--gray-400)', bg: 'var(--gray-100)', text: 'var(--gray-500)' }
  return (
    <span
      className="inline-flex flex-shrink-0 items-center gap-1 rounded text-[10px] font-semibold tracking-wide"
      style={{ backgroundColor: c.bg, color: c.text, padding: '4px 14px' }}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: c.dot }} />
      {urgency}
    </span>
  )
}

function Divider() {
  return <div className="h-5 w-px flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Page() {
  const [activeFilter, setActiveFilter] = useState<FilterType>('All')
  const [selectedId, setSelectedId] = useState<string>('1')
  const [draftText, setDraftText] = useState(DRAFT_TEXT)
  const [forwardTo, setForwardTo] = useState(FORWARD_OPTIONS[0])
  const [newestFirst, setNewestFirst] = useState(true)

  // ── Queue state (live from Supabase) ──
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [liveEmail, setLiveEmail] = useState<LiveEmail | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftMode, setDraftMode] = useState<'choice' | 'editing'>('choice')
  const draftMapRef = useRef<Map<string, string>>(new Map())
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<'success' | 'error' | null>(null)
  const [showSignature, setShowSignature] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastFading, setToastFading] = useState(false)

  const generateDraft = useCallback(async (email: LiveEmail, rowId: string) => {
    setDraftLoading(true)
    setDraftMode('editing')
    setDraftText('Generating draft…')
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: email.subject, from: email.from, body: email.body }),
      })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      console.log('[generateDraft] response from /api/draft:', data)
      draftMapRef.current.set(rowId, data.draft)
      setDraftText(data.draft)
    } catch {
      setDraftText('')
    } finally {
      setDraftLoading(false)
    }
  }, [])

  const fetchEmailForRow = useCallback(async (row: QueueRow) => {
    console.log('[fetchEmailForRow] gmail_message_id:', row.gmail_message_id)
    if (!row.gmail_message_id) {
      setLiveEmail(null)
      setEmailLoading(false)
      setEmailError(null)
      setDraftMode('choice')
      setDraftText('')
      return
    }
    // Restore existing draft if one was already written for this row
    if (draftMapRef.current.has(row.id)) {
      setDraftText(draftMapRef.current.get(row.id)!)
      setDraftMode('editing')
    } else {
      setDraftMode('choice')
      setDraftText('')
    }
    setShowSignature(false)
    setEmailLoading(true)
    setLiveEmail(null)
    setEmailError(null)
    try {
      const res = await fetch(`/api/gmail/message?messageId=${encodeURIComponent(row.gmail_message_id)}`)
      if (!res.ok) throw new Error('fetch failed')
      const email = await res.json()
      setLiveEmail(email)
    } catch {
      setEmailError('Could not load email')
    } finally {
      setEmailLoading(false)
    }
  }, [])

  const fetchQueue = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('email_events')
      .select(
        'id, tier, urgency, inquiry_type, subject, sender, received_at, status, assigned_to_name, claimed_at, claim_expires_at, gmail_message_id, gmail_thread_id'
      )
    if (error) {
      setFetchError(error.message)
    } else {
      const rows = (data ?? []) as QueueRow[]
      setQueue(rows)
      if (!silent && rows.length > 0) {
        const first = sortQueue(rows, true)[0]
        setSelectedId(first.id)
        fetchEmailForRow(first)
      }
      setFetchError(null)
    }
    if (!silent) setLoading(false)
  }, [fetchEmailForRow])

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(() => fetchQueue(true), 15_000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  // ── Derivations ──
  // Centre panel still uses static placeholder until Gmail wiring
  const selectedEmail = EMAILS.find((e) => e.id === selectedId) ?? EMAILS[0]

  const sortedQueue = sortQueue(queue, newestFirst)
  const filteredQueue = (
    activeFilter === 'All' ? sortedQueue : sortedQueue.filter((r) => r.urgency === activeFilter)
  ).filter((r) => {
    const s = r.status
    return s !== 'no_content' && s !== 'resolved' && s !== 'done' && s !== 'billed' && s !== 'sent'
      && r.inquiry_type !== 'no_content'
  })
  const selectedQueueRow = queue.find((r) => r.id === selectedId) ?? null

  // ── Draft mode handlers ──
  function handleWriteManually() {
    if (!selectedQueueRow) return
    draftMapRef.current.set(selectedQueueRow.id, '')
    setDraftText('')
    setDraftMode('editing')
  }

  // ── Send handler ──
  async function handleSend() {
    if (!selectedQueueRow || !liveEmail || sending) return
    setSending(true)
    setSendStatus(null)
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: selectedQueueRow.gmail_message_id,
          threadId: selectedQueueRow.gmail_thread_id,
          to: liveEmail.from,
          subject: liveEmail.subject,
          body: draftText,
        }),
      })
      if (!res.ok) throw new Error('Send failed')

      await supabase.from('email_events').update({ status: 'resolved' }).eq('id', selectedQueueRow.id)

      // Queue: advance immediately
      const currentIdx = filteredQueue.findIndex((r) => r.id === selectedQueueRow.id)
      const nextRow = filteredQueue[currentIdx + 1] ?? filteredQueue[currentIdx - 1] ?? null
      if (nextRow) {
        setSelectedId(nextRow.id)
        fetchEmailForRow(nextRow)
      } else {
        setSelectedId(null)
        setLiveEmail(null)
      }

      // Toast: appear and fade independently
      setSendStatus('success')
      setToastVisible(true)
      setToastFading(false)
      setTimeout(() => setToastFading(true), 2000)
      setTimeout(() => {
        setSendStatus(null)
        setToastVisible(false)
        setToastFading(false)
      }, 2500)
    } catch {
      setSendStatus('error')
    } finally {
      setSending(false)
    }
  }

  const unreadCount = queue.filter((r) => !r.claimed_at).length

  const filters: FilterType[] = ['All', 'Emergency', 'STAT', 'Routine']
  const filterCounts: Record<string, number> = {
    All: queue.length,
    Emergency: queue.filter((r) => r.urgency === 'Emergency').length,
    STAT: queue.filter((r) => r.urgency === 'STAT').length,
    Routine: queue.filter((r) => r.urgency === 'Routine').length,
  }

  const avatarStyle: Record<string, { backgroundColor: string; color: string }> = {
    Emergency: { backgroundColor: '#FCEBEB', color: '#A32D2D' },
    STAT:      { backgroundColor: '#FAEEDA', color: '#633806' },
    Routine:   { backgroundColor: '#E1F5EE', color: '#0F6E56' },
  }

  const urgencyColor: Record<string, string> = {
    High: 'var(--red)',
    Medium: 'var(--amber)',
    Low: 'var(--teal)',
  }

  return (
    <div className="min-h-screen p-3" style={{ backgroundColor: 'var(--gray-50)' }}>
      <div
        className="flex flex-col overflow-hidden rounded-lg border bg-white"
        style={{ height: 'calc(100vh - 24px)', borderColor: 'var(--border)' }}
      >

        {/* ═══════════════════════════════════════════════════════════════
            TOP BAR
        ════════════════════════════════════════════════════════════════ */}
        <header
          className="flex h-14 flex-shrink-0 items-center gap-0 border-b px-4"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Logo mark */}
          <div
            className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[7px]"
            style={{ backgroundColor: 'var(--teal)' }}
          >
            <span className="text-[18px] font-bold leading-none text-white">E</span>
          </div>

          {/* App title */}
          <span
            className="ml-2.5 text-[15px] font-semibold"
            style={{ color: 'var(--gray-900)' }}
          >
            OHS · Express Inbox
          </span>

          <div className="mx-3">
            <Divider />
          </div>

          {/* Inbox address */}
          <span className="text-sm font-medium" style={{ color: 'var(--teal)' }}>
            hello@ohsdemo.com
          </span>

          <div className="flex-1" />

          {/* Live · Classifying indicator */}
          <div className="flex items-center gap-1.5">
            <span
              className="pulse-dot h-2 w-2 rounded-full"
              style={{ backgroundColor: 'var(--teal)' }}
            />
            <span
              className="pulse-dot-2 h-2 w-2 rounded-full"
              style={{ backgroundColor: 'var(--teal)' }}
            />
            <span
              className="pulse-dot-3 h-2 w-2 rounded-full"
              style={{ backgroundColor: 'var(--teal)' }}
            />
            <span
              className="ml-1 text-sm font-medium"
              style={{ color: 'var(--teal)' }}
            >
              Live · Classifying
            </span>
          </div>

          <div className="mx-3">
            <Divider />
          </div>

          {/* Avatar */}
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--teal-dark)' }}
          >
            <span className="text-xs font-semibold text-white">KD</span>
          </div>
        </header>

        {/* ═══════════════════════════════════════════════════════════════
            THREE-COLUMN WORKSPACE
        ════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-1 overflow-x-auto overflow-y-hidden">

          {/* ── LEFT: INBOX QUEUE ─────────────────────────────────────── */}
          <div
            className="flex flex-shrink flex-col border-r"
            style={{ minWidth: '320px', maxWidth: '560px', flexBasis: '560px', borderColor: 'var(--border)', backgroundColor: 'var(--gray-50)' }}
          >
            {/* Queue header */}
            <div
              className="flex h-14 flex-shrink-0 items-center justify-between border-b px-4"
              style={{ borderColor: 'var(--border)', backgroundColor: 'white' }}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold" style={{ color: 'var(--gray-900)' }}>
                  Inbox queue
                </span>
                {unreadCount > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: 'var(--teal)' }}
                  >
                    {unreadCount}
                  </span>
                )}
              </div>
              <span className="text-xs" style={{ color: 'var(--gray-400)' }}>
                {loading ? 'Loading…' : `${filteredQueue.length} message${filteredQueue.length !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Filter buttons */}
            <div
              className="flex flex-shrink-0 items-center gap-1.5 border-b px-4 py-2.5"
              style={{ borderColor: 'var(--border)' }}
            >
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                  style={
                    activeFilter === f
                      ? { backgroundColor: 'var(--teal)', color: 'white', border: '1px solid var(--teal)' }
                      : { backgroundColor: 'white', border: '1px solid var(--border)', color: 'var(--gray-600)' }
                  }
                >
                  {f}
                  {f !== 'All' && (
                    <span className="ml-1 opacity-60">{filterCounts[f]}</span>
                  )}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setNewestFirst((v) => !v)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={
                  newestFirst
                    ? { backgroundColor: 'var(--teal)', color: 'white', border: '1px solid var(--teal)' }
                    : { backgroundColor: 'white', border: '1px solid var(--border)', color: 'var(--gray-600)' }
                }
              >
                Newest first
              </button>
            </div>

            {/* Email list */}
            <div
              className="flex-1 overflow-y-auto"
              style={{ backgroundColor: 'var(--gray-50)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              {/* Loading skeleton */}
              {loading && (
                <>
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border bg-white"
                      style={{ borderColor: 'var(--border)', padding: '14px 16px' }}
                    >
                      <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-full" style={{ backgroundColor: 'var(--gray-100)' }} />
                      <div className="flex flex-1 flex-col gap-2">
                        <div className="h-3 w-3/4 animate-pulse rounded" style={{ backgroundColor: 'var(--gray-100)' }} />
                        <div className="h-2.5 w-1/2 animate-pulse rounded" style={{ backgroundColor: 'var(--gray-100)' }} />
                        <div className="h-2 w-1/3 animate-pulse rounded" style={{ backgroundColor: 'var(--gray-100)' }} />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Error state */}
              {!loading && fetchError && (
                <div className="flex flex-col items-center gap-3 px-6 py-10">
                  <span className="text-sm" style={{ color: 'var(--red)' }}>
                    Could not load queue
                  </span>
                  <p className="text-center text-[11px]" style={{ color: 'var(--gray-400)' }}>
                    {fetchError}
                  </p>
                  <button
                    onClick={() => fetchQueue()}
                    className="rounded-lg px-4 py-1.5 text-xs font-medium text-white"
                    style={{ backgroundColor: 'var(--teal)' }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!loading && !fetchError && filteredQueue.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-6 py-10">
                  <span className="text-sm font-medium" style={{ color: 'var(--gray-600)' }}>
                    No messages
                  </span>
                  <p className="text-[11px]" style={{ color: 'var(--gray-400)' }}>
                    {activeFilter === 'All' ? 'Inbox is empty.' : `No ${activeFilter} messages.`}
                  </p>
                </div>
              )}

              {/* Live queue rows */}
              {!loading &&
                !fetchError &&
                filteredQueue.map((row) => {
                  const isSelected = selectedId === row.id
                  const ts = formatTimestamp(row.received_at)
                  const displayName = stripDisplayName(row.sender)
                  const initials = getInitials(displayName)
                  const preview = row.subject || row.inquiry_type

                  const accentBorder =
                    row.urgency === 'Emergency' ? '5px solid #E24B4A' :
                    row.urgency === 'STAT'      ? '5px solid #EF9F27' :
                    undefined
                  const isResolved = row.status === 'resolved'
                  const cardStyle: React.CSSProperties = isSelected
                    ? {
                        backgroundColor: 'var(--teal-light)',
                        border: '2px solid var(--teal)',
                        borderRadius: '8px',
                        padding: '14px 16px',
                      }
                    : {
                        backgroundColor: isResolved ? '#EFF6FF' : 'white',
                        border: '1px solid var(--border)',
                        ...(accentBorder ? { borderLeft: accentBorder } : {}),
                        borderRadius: '8px',
                        padding: '14px 16px',
                      }

                  return (
                    <button
                      key={row.id}
                      onClick={() => { setSelectedId(row.id); fetchEmailForRow(row) }}
                      className="flex w-full cursor-pointer items-start gap-3 text-left transition-colors"
                      style={cardStyle}
                    >
                      {/* Avatar */}
                      <div
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                        style={avatarStyle[row.urgency] ?? { backgroundColor: 'var(--gray-100)', color: 'var(--gray-500)' }}
                      >
                        {initials}
                      </div>

                      {/* Content */}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        {/* Top: sender name + timestamp */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="truncate text-[15px]"
                            style={{ fontWeight: 500, color: 'var(--gray-900)' }}
                          >
                            {displayName || row.inquiry_type}
                          </span>
                          <span
                            className="flex-shrink-0 text-[11px]"
                            style={{ color: 'var(--gray-400)' }}
                          >
                            {ts}
                          </span>
                        </div>

                        {/* Middle: preview snippet */}
                        <p className="truncate text-[13px]" style={{ color: 'var(--gray-500)' }}>
                          {preview}
                        </p>

                        {/* Bottom: tier badge + urgency badge + status */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <TierBadge tier={row.tier} />
                          {row.urgency && <UrgencyBadge urgency={row.urgency} />}
                          <div className="flex-1" />
                          {(row.status === 'new' || row.status === 'unresolved') && (
                            <span
                              className="font-medium"
                              style={{ backgroundColor: '#1D9E75', color: 'white', fontSize: '11px', padding: '4px 10px', borderRadius: '4px' }}
                            >
                              New
                            </span>
                          )}
                          {row.status === 'resolved' && (
                            <span className="font-medium" style={{ color: '#2563EB', fontSize: '11px' }}>Resolved</span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>

          {/* ── CENTRE: EMAIL VIEW + DRAFT ────────────────────────────── */}
          <div
            className="flex flex-1 flex-col overflow-hidden border-r"
            style={{ minWidth: '380px', borderColor: 'var(--border)' }}
          >
            {/* Email header */}
            <div
              className="flex-shrink-0 border-b px-6 py-4"
              style={{ borderColor: 'var(--border)' }}
            >
              {selectedQueueRow ? (
                emailLoading ? (
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-3/4 animate-pulse rounded" style={{ backgroundColor: 'var(--gray-100)' }} />
                    <div className="h-3 w-1/2 animate-pulse rounded" style={{ backgroundColor: 'var(--gray-100)' }} />
                  </div>
                ) : emailError ? (
                  <p className="text-sm" style={{ color: 'var(--red)' }}>{emailError}</p>
                ) : liveEmail ? (
                  <>
                    <div className="mb-2 flex items-start gap-2">
                      <TierBadge tier={selectedQueueRow.tier} />
                      <h2
                        className="text-[15px] font-semibold leading-snug"
                        style={{ color: 'var(--gray-900)' }}
                      >
                        {liveEmail.subject}
                      </h2>
                    </div>
                    <div
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                      style={{ color: 'var(--gray-600)' }}
                    >
                      <span>
                        <span style={{ color: 'var(--gray-400)' }}>From: </span>
                        <span className="font-medium">{liveEmail.from}</span>
                      </span>
                      <span>
                        <span style={{ color: 'var(--gray-400)' }}>To: </span>
                        <span style={{ color: 'var(--teal)' }}>{liveEmail.to}</span>
                      </span>
                      <span className="ml-auto" style={{ color: 'var(--gray-400)' }}>
                        {liveEmail.date}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--gray-400)' }}>
                    Email content unavailable
                  </p>
                )
              ) : (
                <>
                  <div className="mb-2 flex items-start gap-2">
                    <TierBadge tier={selectedEmail.tier} />
                    <h2
                      className="text-[15px] font-semibold leading-snug"
                      style={{ color: 'var(--gray-900)' }}
                    >
                      {selectedEmail.subject}
                    </h2>
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                    style={{ color: 'var(--gray-600)' }}
                  >
                    <span>
                      <span style={{ color: 'var(--gray-400)' }}>From: </span>
                      <span className="font-medium">{selectedEmail.fromName}</span>
                      <span style={{ color: 'var(--gray-400)' }}>
                        {' '}
                        &lt;{selectedEmail.fromEmail}&gt;
                      </span>
                    </span>
                    <span>
                      <span style={{ color: 'var(--gray-400)' }}>To: </span>
                      <span style={{ color: 'var(--teal)' }}>hello@ohsdemo.com</span>
                    </span>
                    <span className="ml-auto" style={{ color: 'var(--gray-400)' }}>
                      {selectedEmail.fullDate}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Email body — scrollable, 40% */}
            <div className="flex-[2] min-h-0 overflow-y-auto px-6 py-5">
              {selectedQueueRow ? (
                emailLoading ? (
                  <div className="flex flex-col gap-3">
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className="h-3 animate-pulse rounded"
                        style={{ backgroundColor: 'var(--gray-100)', width: `${60 + (i % 4) * 10}%` }}
                      />
                    ))}
                  </div>
                ) : emailError ? (
                  <p className="text-sm" style={{ color: 'var(--red)' }}>{emailError}</p>
                ) : liveEmail ? (
                  (() => {
                    const { main, signature } = splitBody(liveEmail.body)
                    return (
                      <>
                        <pre
                          className="whitespace-pre-wrap font-sans text-sm leading-relaxed"
                          style={{ color: 'var(--gray-900)' }}
                        >
                          {main}
                        </pre>
                        {signature && (
                          <>
                            <button
                              onClick={() => setShowSignature(v => !v)}
                              className="mt-3 text-xs"
                              style={{ color: 'var(--gray-400)' }}
                            >
                              {showSignature ? 'Hide signature' : 'View signature'}
                            </button>
                            {showSignature && (
                              <pre
                                className="whitespace-pre-wrap font-sans text-xs leading-relaxed mt-2"
                                style={{ color: 'var(--gray-400)' }}
                              >
                                {signature}
                              </pre>
                            )}
                          </>
                        )}
                      </>
                    )
                  })()
                ) : (
                  <p className="text-sm" style={{ color: 'var(--gray-400)' }}>
                    Email content unavailable
                  </p>
                )
              ) : (
                <pre
                  className="whitespace-pre-wrap font-sans text-sm leading-relaxed"
                  style={{ color: 'var(--gray-900)' }}
                >
                  {selectedEmail.body}
                </pre>
              )}
            </div>

            {/* Draft compose — 60%, flex column so textarea fills space */}
            <div
              className="flex flex-[3] min-h-0 flex-col border-t px-6 py-4"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--gray-50)',
              }}
            >
              <div className="mb-2.5 flex flex-shrink-0 items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: 'var(--gray-900)' }}>
                  Draft reply
                </span>
                <span
                  className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--amber-light)',
                    color: 'var(--amber)',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M5 0a5 5 0 110 10A5 5 0 015 0zm.5 2.5H4.5v3.25l2.25 1.35.5-.83-2-.25V2.5z" />
                  </svg>
                  AI draft — review before sending
                </span>
              </div>
              {draftMode === 'choice' ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <button
                    onClick={() => liveEmail && selectedQueueRow && generateDraft(liveEmail, selectedQueueRow.id)}
                    disabled={!liveEmail}
                    className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ backgroundColor: 'var(--teal)' }}
                  >
                    Generate AI Draft
                  </button>
                  <button
                    onClick={handleWriteManually}
                    className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--gray-600)', backgroundColor: 'white' }}
                  >
                    Write manually
                  </button>
                </div>
              ) : (
                <textarea
                  className="w-full flex-1 resize-none rounded-lg border px-3 py-2.5 text-sm focus:outline-none"
                  style={{
                    borderColor: 'var(--border)',
                    color: draftLoading ? 'var(--gray-400)' : 'var(--gray-900)',
                    backgroundColor: 'white',
                    fontFamily: 'var(--font-dm-sans), sans-serif',
                    lineHeight: '1.6',
                  }}
                  value={draftText}
                  onChange={(e) => {
                    setDraftText(e.target.value)
                    if (selectedQueueRow) draftMapRef.current.set(selectedQueueRow.id, e.target.value)
                  }}
                  disabled={draftLoading}
                />
              )}
              <div className="mt-3 flex flex-shrink-0 items-center gap-2">
                <button
                  onClick={handleSend}
                  disabled={sending || !liveEmail || draftLoading || draftMode === 'choice'}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--teal)' }}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
                <button
                  onClick={() => liveEmail && selectedQueueRow && generateDraft(liveEmail, selectedQueueRow.id)}
                  disabled={draftLoading || !liveEmail || draftMode === 'choice'}
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--gray-600)',
                    backgroundColor: 'white',
                  }}
                >
                  Regenerate
                </button>
                <button
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--gray-600)',
                    backgroundColor: 'white',
                  }}
                >
                  Forward
                </button>
                {sendStatus === 'error' && (
                  <span className="text-xs font-medium" style={{ color: 'var(--red)' }}>
                    Failed to send — please try again
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: TRIAGE PANEL ───────────────────────────────────── */}
          <div className="flex flex-shrink flex-col" style={{ minWidth: '300px', maxWidth: '440px', flexBasis: '440px' }}>
            {/* Panel header */}
            <div
              className="flex flex-shrink-0 items-center border-b px-4 py-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--gray-900)' }}>
                OHS triage panel
              </span>
            </div>

            {/* Scrollable triage content */}
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">

              {/* Status card */}
              <div
                className="rounded-lg border p-3.5"
                style={{ borderColor: 'var(--border)' }}
              >
                <p
                  className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--gray-400)' }}
                >
                  Status
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: 'var(--red)' }}
                    />
                    <span className="text-sm font-medium" style={{ color: 'var(--gray-900)' }}>
                      Unresolved
                    </span>
                  </div>
                  <button
                    className="rounded-md border px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      borderColor: 'var(--teal)',
                      color: 'var(--teal)',
                      backgroundColor: 'transparent',
                    }}
                  >
                    Claim →
                  </button>
                </div>
                {/* Response-time bar */}
                <div className="mt-3">
                  <div
                    className="mb-1.5 flex items-center justify-between text-[11px]"
                    style={{ color: 'var(--gray-400)' }}
                  >
                    <span>Response time</span>
                    <span className="font-medium" style={{ color: 'var(--red)' }}>
                      Overdue · 8m
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--gray-100)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: '85%', backgroundColor: 'var(--red)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Classification card */}
              <div
                className="rounded-lg border p-3.5"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--gray-400)' }}
                  >
                    Classification
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: 'var(--teal-light)',
                      color: 'var(--teal-dark)',
                    }}
                  >
                    AI · Claude
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--gray-600)' }}>
                      Tier
                    </span>
                    <TierBadge tier="Emergency" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--gray-600)' }}>
                      Urgency
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: 'var(--red)' }}
                    >
                      High
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--gray-600)' }}>
                      Inquiry type
                    </span>
                    <span
                      className="text-right text-sm font-medium"
                      style={{ color: 'var(--gray-900)' }}
                    >
                      Urgent Medical Concern
                    </span>
                  </div>
                </div>

                {/* Confidence bar */}
                <div className="mt-4">
                  <div
                    className="mb-1.5 flex items-center justify-between text-[11px]"
                    style={{ color: 'var(--gray-400)' }}
                  >
                    <span>AI confidence</span>
                    <span className="font-semibold" style={{ color: 'var(--teal)' }}>
                      94%
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--gray-100)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: '94%', backgroundColor: 'var(--teal)' }}
                    />
                  </div>
                </div>

                {/* Tags */}
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {['Hypertension', 'Callback Required', 'High BP', 'Elderly Patient'].map(
                    (tag) => (
                      <span
                        key={tag}
                        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: 'var(--gray-100)',
                          color: 'var(--gray-600)',
                        }}
                      >
                        {tag}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Forward-to card */}
              <div
                className="rounded-lg border p-3.5"
                style={{ borderColor: 'var(--border)' }}
              >
                <p
                  className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--gray-400)' }}
                >
                  Forward to
                </p>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--gray-900)',
                    backgroundColor: 'white',
                    fontFamily: 'inherit',
                  }}
                  value={forwardTo}
                  onChange={(e) => setForwardTo(e.target.value)}
                >
                  {FORWARD_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <button
                  className="mt-2.5 w-full rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--teal)' }}
                >
                  Forward to {forwardTo}
                </button>
              </div>
            </div>

            {/* Panel footer — Mark resolved */}
            <div
              className="flex-shrink-0 border-t px-4 py-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                className="w-full rounded-lg border py-2 text-sm font-medium transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--gray-600)',
                  backgroundColor: 'transparent',
                }}
              >
                ✓ Mark resolved
              </button>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            BOTTOM BAR
        ════════════════════════════════════════════════════════════════ */}
        <footer
          className="flex flex-shrink-0 items-center px-5 py-3"
          style={{ backgroundColor: 'var(--teal)' }}
        >
          {/* Logo */}
          <div
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ backgroundColor: 'var(--teal-dark)' }}
          >
            <span className="text-[11px] font-bold text-white">E</span>
          </div>
          <span className="ml-2 text-sm font-semibold text-white">OHS Express Inbox</span>
          <div className="mx-4 h-4 w-px bg-white/30" />
          <span className="text-sm text-white/70">Good medicine, clearly communicated.</span>

          <div className="flex-1" />

          {/* Footer links */}
          <nav className="flex items-center gap-5">
            {['Privacy', 'Terms', 'Support'].map((link) => (
              <a
                key={link}
                href="#"
                className="text-xs font-medium text-white/60 transition-colors hover:text-white/90"
              >
                {link}
              </a>
            ))}
          </nav>
        </footer>
      </div>

      {/* ── SEND TOAST ───────────────────────────────────────────────── */}
      {toastVisible && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{
            backgroundColor: 'rgba(0,0,0,0.35)',
            zIndex: 50,
            opacity: toastFading ? 0 : 1,
            transition: 'opacity 0.5s ease',
            pointerEvents: 'none',
          }}
        >
          <div
            className="rounded-lg px-8 py-4 text-base font-semibold text-white shadow-lg"
            style={{ backgroundColor: 'var(--teal)' }}
          >
            Message sent
          </div>
        </div>
      )}
    </div>
  )
}
