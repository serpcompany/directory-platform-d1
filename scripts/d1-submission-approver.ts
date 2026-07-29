import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface D1Result {
  results?: Array<Record<string, unknown>>
  success?: boolean
}

interface D1Response {
  errors?: Array<{ message?: string }>
  result?: D1Result[]
  success?: boolean
}

interface Statement {
  sql: string
  params: unknown[]
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`Missing required environment value ${name}.`)
  return value
}

export function validateApprovalContext(env: NodeJS.ProcessEnv): void {
  if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Remote submission approval requires GitHub Actions.')
  }
  if (!env.GITHUB_WORKFLOW_REF?.includes('/.github/workflows/approve-d1-submission.yml@')) {
    throw new Error('Remote submission approval requires approve-d1-submission.yml.')
  }
  if (env.GITHUB_REF !== 'refs/heads/main' || !env.GITHUB_SHA) {
    throw new Error('Remote submission approval requires reviewed main.')
  }
  if (env.D1_SUBMISSION_APPROVAL_CONFIRM !== 'approve-serp.software-submission-production') {
    throw new Error('Explicit production submission approval confirmation is required.')
  }
}

async function query(
  statements: Statement[],
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch
): Promise<D1Result[]> {
  const response = await fetcher(
    `https://api.cloudflare.com/client/v4/accounts/${required(env, 'CLOUDFLARE_ACCOUNT_ID')}/d1/database/${required(env, 'CLOUDFLARE_D1_PRODUCTION_DATABASE_ID')}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required(env, 'CLOUDFLARE_API_TOKEN')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        batch: statements.map(statement => ({ sql: statement.sql, params: statement.params }))
      })
    }
  )
  const payload = (await response.json()) as D1Response
  if (
    !response.ok ||
    payload.success === false ||
    !payload.result ||
    payload.result.some(result => result.success === false)
  ) {
    throw new Error(
      payload.errors
        ?.map(item => item.message)
        .filter(Boolean)
        .join('; ') || `D1 API query failed with status ${response.status}.`
    )
  }
  return payload.result
}

export async function approveRemoteSubmission(
  submissionId: string,
  reviewer: string,
  decision: 'approve' | 'reject' = 'approve',
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ idempotent: boolean; listingId: string | null }> {
  validateApprovalContext(env)
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new Error('Submission ID must be a UUID.')
  if (!reviewer.trim()) throw new Error('Reviewer identity is required.')

  const selected = await query(
    [
      {
        sql: `SELECT s.id,s.slug,s.status,s.listing_id,ps.version,ps.checksum
          FROM listing_submissions s JOIN publication_state ps ON ps.site_id=s.site_id
          WHERE s.id=? AND s.site_id='serp.software'`,
        params: [submissionId]
      }
    ],
    env,
    fetcher
  )
  const row = selected[0]?.results?.[0]
  if (!row) throw new Error('Submission does not exist.')
  if (decision === 'reject') {
    if (row.status === 'rejected') return { idempotent: true, listingId: null }
    if (row.status !== 'pending_badge' && row.status !== 'verified') {
      throw new Error('Only a pending or verified submission can be rejected.')
    }
    await query(
      [
        {
          sql: `UPDATE listing_submissions SET status='rejected',reviewed_at=?,reviewed_by=?,updated_at=?
            WHERE id=? AND status IN ('pending_badge','verified')`,
          params: [new Date().toISOString(), reviewer, new Date().toISOString(), submissionId]
        },
        {
          sql: `INSERT INTO listing_submission_events (submission_id,event_type,actor)
            VALUES (?,'rejected',?)`,
          params: [submissionId, reviewer]
        }
      ],
      env,
      fetcher
    )
    return { idempotent: false, listingId: null }
  }
  const listingId =
    typeof row.listing_id === 'string' ? row.listing_id : `submission_${submissionId}`
  if (row.status === 'approved' && row.listing_id === listingId) {
    return { idempotent: true, listingId }
  }
  if (row.status !== 'verified')
    throw new Error('Only a badge-verified submission can be approved.')
  if (typeof row.version !== 'number' || typeof row.checksum !== 'string') {
    throw new Error('Invalid publication state.')
  }
  const manifestId = `verified-submission-${submissionId}`
  const afterChecksum = createHash('sha256')
    .update(`${row.checksum}\n${manifestId}\n${row.version + 1}`)
    .digest('hex')
  const runId = `submission_publish_${submissionId}`
  const now = new Date().toISOString()

  await query(
    [
      {
        sql: `INSERT INTO publication_runs
          (id,site_id,manifest_id,base_version,input_checksum,affected_records,affected_routes,outcome,
           started_at,actor,workflow,before_checksum,after_checksum)
          VALUES (?,'serp.software',?,?,?,1,?,'started',?,?,?, ?,?)`,
        params: [
          runId,
          manifestId,
          row.version,
          afterChecksum,
          `/products/${row.slug}/`,
          now,
          reviewer,
          'github/approve-d1-submission',
          row.checksum,
          afterChecksum
        ]
      },
      {
        sql: `INSERT INTO listings
          (id,site_id,slug,name,description,website,content,is_unofficial,is_featured,is_active,status,
           source_kind,source_identity,checksum,display_order)
          SELECT ?,'serp.software',slug,name,description,website,content,0,0,1,'draft',
            'verified-submission',id,?,COALESCE((SELECT MAX(display_order)+1 FROM listings WHERE site_id='serp.software'),0)
          FROM listing_submissions WHERE id=? AND status='verified' AND listing_id IS NULL`,
        params: [listingId, afterChecksum, submissionId]
      },
      {
        sql: `INSERT INTO listing_categories (listing_id,category_id,sort_order,is_primary)
          SELECT ?,c.id,0,1 FROM listing_submissions s JOIN categories c
            ON c.site_id=s.site_id AND c.slug=s.category_slug AND c.is_active=1
          WHERE s.id=?`,
        params: [listingId, submissionId]
      },
      {
        sql: `INSERT INTO listing_media (listing_id,kind,url,sort_order)
          SELECT ?,'logo',logo_url,0 FROM listing_submissions WHERE id=?`,
        params: [listingId, submissionId]
      },
      {
        sql: `INSERT INTO listing_media (listing_id,kind,url,sort_order)
          SELECT ?,'video',video_url,1 FROM listing_submissions WHERE id=? AND video_url IS NOT NULL`,
        params: [listingId, submissionId]
      },
      {
        sql: `INSERT INTO listing_resource_links (listing_id,label,url,sort_order)
          SELECT ?,label,url,sort_order FROM listing_submission_resource_links WHERE submission_id=? ORDER BY sort_order`,
        params: [listingId, submissionId]
      },
      {
        sql: `INSERT INTO listing_faqs (listing_id,question,answer,sort_order)
          SELECT ?,question,answer,sort_order FROM listing_submission_faqs WHERE submission_id=? ORDER BY sort_order`,
        params: [listingId, submissionId]
      },
      {
        sql: `UPDATE listings SET status='approved',published_at=?,updated_at=?
          WHERE id=? AND source_kind='verified-submission' AND source_identity=?`,
        params: [now, now, listingId, submissionId]
      },
      {
        sql: `UPDATE listing_submissions SET status='approved',listing_id=?,reviewed_at=?,reviewed_by=?,updated_at=?
          WHERE id=? AND status='verified'`,
        params: [listingId, now, reviewer, now, submissionId]
      },
      {
        sql: `INSERT INTO listing_submission_events (submission_id,event_type,actor)
          VALUES (?,'approved',?)`,
        params: [submissionId, reviewer]
      },
      {
        sql: `UPDATE publication_state SET version=version+1,manifest_id=?,checksum=?,published_at=?
          WHERE site_id='serp.software' AND version=? AND checksum=?`,
        params: [manifestId, afterChecksum, now, row.version, row.checksum]
      },
      {
        sql: `UPDATE publication_runs SET outcome='succeeded',published_version=?,completed_at=?
          WHERE id=? AND outcome='started'`,
        params: [row.version + 1, now, runId]
      }
    ],
    env,
    fetcher
  )
  return { idempotent: false, listingId }
}

async function main(): Promise<void> {
  const [submissionId, requestedDecision = 'approve'] = process.argv
    .slice(2)
    .filter(value => value !== '--')
  const decision = requestedDecision
  if (!submissionId || (decision !== 'approve' && decision !== 'reject')) {
    throw new Error('Usage: pnpm d1:approve:production -- <submission-id> [approve|reject]')
  }
  console.log(
    JSON.stringify(
      await approveRemoteSubmission(submissionId, process.env.GITHUB_ACTOR || 'unknown', decision)
    )
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
