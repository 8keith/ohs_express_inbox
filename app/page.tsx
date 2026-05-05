'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────

type Tier = 'Emergency' | 'STAT' | 'Routine'
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

// ─── Helpers ────────────────────────────────────────────────────────────────

const TIER_ORDER: Record<Tier, number> = { Emergency: 0, STAT: 1, Routine: 2 }

function sortQueue(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    if (t !== 0) return t
    return new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
  })
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

function TierBadge({ tier }: { tier: Tier }) {
  const s: Record<Tier, React.CSSProperties> = {
    Emergency: { backgroundColor: 'var(--red-light)', color: 'var(--red)' },
    STAT: { backgroundColor: 'var(--amber-light)', color: 'var(--amber)' },
    Routine: { backgroundColor: 'var(--teal-light)', color: 'var(--teal-dark)' },
  }
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={s[tier]}
    >
      {tier}
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

  // ── Queue state (live from Supabase) ──
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchQueue = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('email_events')
      .select(
        'id, tier, urgency, inquiry_type, received_at, status, assigned_to_name, claimed_at, claim_expires_at, gmail_message_id, gmail_thread_id'
      )
    if (error) {
      setFetchError(error.message)
    } else {
      const sorted = sortQueue((data ?? []) as QueueRow[])
      setQueue(sorted)
      // Auto-select first item on initial load
      if (!silent && sorted.length > 0) {
        setSelectedId(sorted[0].id)
      }
      setFetchError(null)
    }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(() => fetchQueue(true), 15_000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  // ── Derivations ──
  // Centre panel still uses static placeholder until Gmail wiring
  const selectedEmail = EMAILS.find((e) => e.id === selectedId) ?? EMAILS[0]

  const filteredQueue =
    activeFilter === 'All' ? queue : queue.filter((r) => r.tier === activeFilter)

  const unreadCount = queue.filter((r) => !r.claimed_at).length

  const filters: FilterType[] = ['All', 'Emergency', 'STAT', 'Routine']
  const filterCounts: Record<FilterType, number> = {
    All: queue.length,
    Emergency: queue.filter((r) => r.tier === 'Emergency').length,
    STAT: queue.filter((r) => r.tier === 'STAT').length,
    Routine: queue.filter((r) => r.tier === 'Routine').length,
  }

  const tierBarColor: Record<Tier, string> = {
    Emergency: 'var(--red)',
    STAT: 'var(--amber)',
    Routine: 'var(--teal)',
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
        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT: INBOX QUEUE ─────────────────────────────────────── */}
          <div
            className="flex w-[680px] flex-none flex-col border-r"
            style={{ borderColor: 'var(--border)' }}
          >
            {/* Queue header */}
            <div
              className="flex flex-shrink-0 items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--border)' }}
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
                      ? { backgroundColor: 'var(--teal)', color: 'white' }
                      : { backgroundColor: 'var(--gray-100)', color: 'var(--gray-600)' }
                  }
                >
                  {f}
                  {f !== 'All' && (
                    <span className="ml-1 opacity-60">{filterCounts[f]}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Email list */}
            <div className="flex-1 overflow-y-auto">
              {/* Loading skeleton */}
              {loading && (
                <div className="flex flex-col">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-stretch border-b"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div
                        className="w-1 flex-shrink-0"
                        style={{ backgroundColor: 'var(--gray-100)' }}
                      />
                      <div className="flex flex-1 flex-col gap-2 px-3 py-3">
                        <div
                          className="h-3 w-3/4 animate-pulse rounded"
                          style={{ backgroundColor: 'var(--gray-100)' }}
                        />
                        <div
                          className="h-2.5 w-1/2 animate-pulse rounded"
                          style={{ backgroundColor: 'var(--gray-100)' }}
                        />
                        <div
                          className="h-2 w-5/6 animate-pulse rounded"
                          style={{ backgroundColor: 'var(--gray-100)' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
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
                  const isUnread = !row.claimed_at
                  const ts = formatTimestamp(row.received_at)
                  return (
                    <button
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className="flex w-full cursor-pointer items-stretch border-b text-left transition-colors"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor:
                          selectedId === row.id ? 'var(--teal-light)' : 'transparent',
                      }}
                    >
                      {/* Tier colour strip */}
                      <div
                        className="w-1 flex-shrink-0"
                        style={{ backgroundColor: tierBarColor[row.tier] }}
                      />

                      {/* Content */}
                      <div className="flex flex-1 flex-col gap-1 px-3 py-3">
                        {/* Row 1: unread dot + tier badge + urgency + inquiry_type + time */}
                        <div className="flex items-center gap-2">
                          {isUnread ? (
                            <span
                              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: 'var(--teal)' }}
                            />
                          ) : (
                            <span className="h-1.5 w-1.5 flex-shrink-0" />
                          )}
                          <TierBadge tier={row.tier} />
                          {row.urgency && (
                            <span
                              className="flex-shrink-0 text-[10px] font-semibold"
                              style={{ color: urgencyColor[row.urgency] ?? 'var(--gray-400)' }}
                            >
                              {row.urgency}
                            </span>
                          )}
                          <span
                            className="flex-1 truncate text-[13px]"
                            style={{
                              fontWeight: isUnread ? 600 : 400,
                              color: 'var(--gray-900)',
                            }}
                          >
                            {row.inquiry_type}
                          </span>
                          <span
                            className="flex-shrink-0 text-[11px]"
                            style={{ color: 'var(--gray-400)' }}
                          >
                            {ts}
                          </span>
                        </div>

                        {/* Row 2: status + assigned name */}
                        <div
                          className="flex items-center gap-1.5 pl-5 text-xs"
                          style={{ color: 'var(--gray-400)' }}
                        >
                          <span
                            className="capitalize"
                            style={{
                              color:
                                row.status === 'unresolved' ? 'var(--red)' : 'var(--gray-400)',
                            }}
                          >
                            {row.status}
                          </span>
                          {row.assigned_to_name && (
                            <>
                              <span>·</span>
                              <span style={{ color: 'var(--gray-600)' }}>
                                {row.assigned_to_name}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Row 3: inquiry_type as preview */}
                        <p
                          className="truncate pl-5 text-[11px] leading-relaxed"
                          style={{ color: 'var(--gray-400)' }}
                        >
                          {row.inquiry_type}
                        </p>
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>

          {/* ── CENTRE: EMAIL VIEW + DRAFT ────────────────────────────── */}
          <div
            className="flex flex-1 flex-col overflow-hidden border-r"
            style={{ borderColor: 'var(--border)' }}
          >
            {/* Email header */}
            <div
              className="flex-shrink-0 border-b px-6 py-4"
              style={{ borderColor: 'var(--border)' }}
            >
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
            </div>

            {/* Email body — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <pre
                className="whitespace-pre-wrap font-sans text-sm leading-relaxed"
                style={{ color: 'var(--gray-900)' }}
              >
                {selectedEmail.body}
              </pre>
            </div>

            {/* Draft compose — fixed at bottom */}
            <div
              className="flex-shrink-0 border-t px-6 py-4"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--gray-50)',
              }}
            >
              <div className="mb-2.5 flex items-center justify-between">
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
              <textarea
                className="w-full resize-y rounded-lg border px-3 py-2.5 text-sm focus:outline-none"
                style={{
                  minHeight: '148px',
                  maxHeight: '280px',
                  borderColor: 'var(--border)',
                  color: 'var(--gray-900)',
                  backgroundColor: 'white',
                  fontFamily: 'var(--font-dm-sans), sans-serif',
                  lineHeight: '1.6',
                }}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
                  style={{ backgroundColor: 'var(--teal)' }}
                >
                  Create Gmail Draft
                </button>
                <button
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
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
              </div>
            </div>
          </div>

          {/* ── RIGHT: TRIAGE PANEL ───────────────────────────────────── */}
          <div className="flex w-[440px] flex-none flex-col">
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
    </div>
  )
}
