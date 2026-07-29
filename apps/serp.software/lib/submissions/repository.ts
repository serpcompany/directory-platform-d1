import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { SubmissionRequest } from '@thedaviddias/web-core/forms/submission-contract'
import { submissionSlug } from '@thedaviddias/web-core/forms/submission-contract'
import { validatePublicHttpUrl } from '../url-safety'

const SITE_ID = 'serp.software'
const MAX_ATTEMPTS = 10
const COOLDOWN_SECONDS = 30
const SUBMISSION_WINDOW_SECONDS = 60 * 60
const SUBMISSION_WINDOW_LIMIT = 10

export class SubmissionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message)
  }
}

export function isSubmissionError(
  error: unknown
): error is Error & { code: string; status: number } {
  return (
    error instanceof Error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { status?: unknown }).status === 'number'
  )
}

export interface SubmissionState {
  id: string
  name: string
  slug: string
  website: string
  status: 'pending_badge' | 'verified' | 'approved' | 'rejected'
  verificationAttempts: number
  lastVerificationError: string | null
  badgeVerifiedAt: string | null
}

interface SubmissionRow {
  id: string
  name: string
  slug: string
  website: string
  status: SubmissionState['status']
  verification_attempts: number
  last_verification_error: string | null
  badge_verified_at: string | null
  last_verification_at: string | null
}

async function database(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true })
  const workerEnv = env as CloudflareEnv
  if (!workerEnv.DB) throw new Error('D1 binding DB is required for submissions.')
  if (!['local', 'preview', 'production'].includes(workerEnv.D1_RUNTIME_ENV)) {
    throw new Error('A valid D1_RUNTIME_ENV is required for submissions.')
  }
  return workerEnv.DB
}

function toState(row: SubmissionRow): SubmissionState {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    website: row.website,
    status: row.status,
    verificationAttempts: row.verification_attempts,
    lastVerificationError: row.last_verification_error,
    badgeVerifiedAt: row.badge_verified_at
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function createSubmission(
  input: SubmissionRequest
): Promise<SubmissionState & { token: string }> {
  for (const value of [
    input.website,
    input.logoUrl,
    input.videoUrl,
    ...input.resourceLinks.map(link => link.url)
  ]) {
    if (value && !validatePublicHttpUrl(value).ok) {
      throw new SubmissionError('invalid_url', 'All submitted URLs must be public HTTP(S) URLs.')
    }
  }
  const db = await database()
  const slug = submissionSlug(input.website)
  const [category, existing] = await Promise.all([
    db
      .prepare('SELECT id FROM categories WHERE site_id = ? AND slug = ? AND is_active = 1')
      .bind(SITE_ID, input.category)
      .first<{ id: number }>(),
    db
      .prepare('SELECT id FROM listings WHERE site_id = ? AND slug = ? LIMIT 1')
      .bind(SITE_ID, slug)
      .first<{ id: string }>()
  ])
  if (!category) throw new SubmissionError('invalid_category', 'Choose an active category.')
  if (existing) throw new SubmissionError('listing_exists', 'This website is already listed.', 409)

  const id = crypto.randomUUID()
  const tokenBytes = new Uint8Array(32)
  crypto.getRandomValues(tokenBytes)
  const token = bytesToBase64Url(tokenBytes)
  const tokenHash = await sha256(token)
  const statements = [
    db
      .prepare(`INSERT INTO listing_submissions
      (id, site_id, slug, name, description, website, content, category_slug, logo_url, video_url, access_token_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        SITE_ID,
        slug,
        input.name,
        input.description,
        input.website,
        input.content,
        input.category,
        input.logoUrl,
        input.videoUrl || null,
        tokenHash
      ),
    ...input.resourceLinks.map((link, index) =>
      db
        .prepare(
          'INSERT INTO listing_submission_resource_links (submission_id, label, url, sort_order) VALUES (?, ?, ?, ?)'
        )
        .bind(id, link.label, link.url, index)
    ),
    ...input.faqs.map((faq, index) =>
      db
        .prepare(
          'INSERT INTO listing_submission_faqs (submission_id, question, answer, sort_order) VALUES (?, ?, ?, ?)'
        )
        .bind(id, faq.question, faq.answer, index)
    ),
    db
      .prepare(
        "INSERT INTO listing_submission_events (submission_id, event_type, actor) VALUES (?, 'created', 'public-form')"
      )
      .bind(id)
  ]
  try {
    const results = await db.batch(statements)
    if (results.some(result => !result.success)) throw new Error('D1 batch failed')
  } catch {
    throw new SubmissionError(
      'duplicate_submission',
      'A submission for this website is already awaiting review.',
      409
    )
  }
  return {
    id,
    token,
    name: input.name,
    slug,
    website: input.website,
    status: 'pending_badge',
    verificationAttempts: 0,
    lastVerificationError: null,
    badgeVerifiedAt: null
  }
}

export async function consumeSubmissionRateLimit(fingerprint: string): Promise<void> {
  const db = await database()
  const fingerprintHash = await sha256(`${SITE_ID}:${fingerprint}`)
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - SUBMISSION_WINDOW_SECONDS
  const statements = [
    db
      .prepare(`INSERT INTO listing_submission_rate_limits
      (fingerprint_hash,window_started_at,request_count) VALUES (?,?,1)
      ON CONFLICT(fingerprint_hash) DO UPDATE SET
        request_count=CASE WHEN window_started_at<=? THEN 1 ELSE request_count+1 END,
        window_started_at=CASE WHEN window_started_at<=? THEN ? ELSE window_started_at END`)
      .bind(fingerprintHash, now, windowStart, windowStart, now),
    db
      .prepare('SELECT request_count FROM listing_submission_rate_limits WHERE fingerprint_hash=?')
      .bind(fingerprintHash)
  ]
  const results = await db.batch<{ request_count?: number }>(statements)
  const count = results[1]?.results?.[0]?.request_count
  if (typeof count !== 'number') throw new Error('D1 submission rate limit failed.')
  if (count > SUBMISSION_WINDOW_LIMIT) {
    throw new SubmissionError('rate_limited', 'Too many submissions. Try again later.', 429)
  }
}

async function authorizedRow(id: string, token: string): Promise<SubmissionRow> {
  const db = await database()
  const row = await db
    .prepare(`SELECT id, name, slug, website, status, verification_attempts,
      last_verification_error, badge_verified_at, last_verification_at
      FROM listing_submissions WHERE id = ? AND site_id = ? AND access_token_hash = ?`)
    .bind(id, SITE_ID, await sha256(token))
    .first<SubmissionRow>()
  if (!row) throw new SubmissionError('not_found', 'Submission not found.', 404)
  return row
}

export async function getSubmission(id: string, token: string): Promise<SubmissionState> {
  return toState(await authorizedRow(id, token))
}

export async function beginVerification(id: string, token: string): Promise<SubmissionState> {
  const row = await authorizedRow(id, token)
  if (row.status !== 'pending_badge') return toState(row)
  if (row.verification_attempts >= MAX_ATTEMPTS) {
    throw new SubmissionError('attempt_limit', 'Badge verification attempt limit reached.', 429)
  }
  if (
    row.last_verification_at &&
    Date.now() - Date.parse(`${row.last_verification_at.replace(' ', 'T')}Z`) <
      COOLDOWN_SECONDS * 1000
  ) {
    throw new SubmissionError('cooldown', 'Wait 30 seconds before checking again.', 429)
  }
  return toState(row)
}

export async function finishVerification(
  id: string,
  token: string,
  result: { ok: true } | { ok: false; code: string }
): Promise<SubmissionState> {
  await authorizedRow(id, token)
  const db = await database()
  const tokenHash = await sha256(token)
  const status = result.ok ? 'verified' : 'pending_badge'
  const error = result.ok ? null : result.code
  const statements = [
    db
      .prepare(`UPDATE listing_submissions SET status = ?, verification_attempts = verification_attempts + 1,
      last_verification_at = CURRENT_TIMESTAMP, last_verification_error = ?,
      badge_verified_at = CASE WHEN ? = 'verified' THEN CURRENT_TIMESTAMP ELSE badge_verified_at END,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND site_id = ? AND access_token_hash = ? AND status = 'pending_badge'`)
      .bind(status, error, status, id, SITE_ID, tokenHash),
    db
      .prepare(`INSERT INTO listing_submission_events (submission_id, event_type, detail, actor)
      VALUES (?, ?, ?, 'badge-verifier')`)
      .bind(id, result.ok ? 'badge_verified' : 'verification_failed', error)
  ]
  const results = await db.batch(statements)
  if (results.some(item => !item.success)) throw new Error('D1 verification update failed.')
  return getSubmission(id, token)
}
