import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { resolveRuntimeSiteId } from '@serpdirectory/site-contract'
import type { WebsiteDetailMetadata } from '@serpdirectory/web-core/content-query'
import {
  buildSubmissionReviewPreview,
  reviewPreviewAccessSchema,
  type SubmissionReviewPreviewResourceRow,
  type SubmissionReviewPreviewRow
} from './review-preview'

const SITE_ID = resolveRuntimeSiteId()
const CHANNEL = 'github_issue'
const runtimeEnvironments = new Set(['local', 'preview', 'production'])

async function database(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true })
  const workerEnv = env as CloudflareEnv
  if (!workerEnv.DB) throw new Error('D1 binding DB is required for submission review previews.')
  if (!runtimeEnvironments.has(workerEnv.D1_RUNTIME_ENV)) {
    throw new Error('A valid D1_RUNTIME_ENV is required for submission review previews.')
  }
  return workerEnv.DB
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function getSubmissionReviewPreview(
  untrustedAccess: unknown
): Promise<WebsiteDetailMetadata | null> {
  const access = reviewPreviewAccessSchema.parse(untrustedAccess)
  const db = await database()
  const submission = await db
    .prepare(
      `SELECT s.id,s.slug,s.name,s.description,s.website,s.content,s.category_slug,
        s.logo_url,s.video_url,s.created_at
      FROM listing_submissions s
      INNER JOIN listing_submission_notifications n
        ON n.submission_id=s.id AND n.channel=?
      WHERE s.id=? AND s.site_id=? AND s.status='verified' AND n.preview_token_hash=?
      LIMIT 1`
    )
    .bind(CHANNEL, access.id, SITE_ID, await sha256(access.token))
    .first<SubmissionReviewPreviewRow>()

  if (!submission) return null

  const resourceResult = await db
    .prepare(
      `SELECT label,url,sort_order
      FROM listing_submission_resource_links
      WHERE submission_id=?
      ORDER BY sort_order,id`
    )
    .bind(submission.id)
    .all<SubmissionReviewPreviewResourceRow>()
  if (!resourceResult.success) {
    throw new Error(
      `D1 submission review preview query failed: ${resourceResult.error || 'unknown error'}`
    )
  }

  return buildSubmissionReviewPreview(submission, resourceResult.results)
}
