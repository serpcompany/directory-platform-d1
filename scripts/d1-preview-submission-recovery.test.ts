import { describe, expect, it } from 'vitest'
import { buildRecoveryPlans, type RecoveryJournal } from './d1-preview-submission-recovery'

const base: RecoveryJournal = {
  originalPublicationRunIds: ['existing-run'],
  originalPublicationState: {
    site_id: 'serp.software',
    version: 1,
    manifest_id: 'initial',
    checksum: 'a'.repeat(64),
    published_at: '2026-01-01T00:00:00.000Z'
  },
  ownedRateFingerprint: 'owned-fingerprint',
  rateFingerprintsBefore: [],
  runId: 'run-1',
  siteId: 'serp.software',
  sourcePrivateBefore: {},
  submissions: [],
  targetPrivateBefore: {},
  version: 1
}

describe('Preview Submission recovery journal', () => {
  it.each([
    ['before intake', [], []],
    ['interrupted after intake', [], ['intake-id']],
    [
      'interrupted after notification',
      [
        {
          id: 'notified-id',
          listingId: 'submission_notified-id',
          publicationRunId: 'submission_publish_notified-id'
        }
      ],
      []
    ],
    [
      'interrupted after approval',
      [
        {
          id: 'approved-id',
          listingId: 'submission_approved-id',
          publicationRunId: 'submission_publish_approved-id'
        }
      ],
      []
    ],
    [
      'interrupted after rejection/rate',
      [
        {
          id: 'approved-id',
          listingId: 'submission_approved-id',
          publicationRunId: 'submission_publish_approved-id'
        },
        {
          id: 'rejected-id',
          listingId: 'submission_rejected-id',
          publicationRunId: 'submission_publish_rejected-id'
        }
      ],
      []
    ]
  ])('builds idempotent exact recovery for %s', (_label, submissions, discovered) => {
    const plans = buildRecoveryPlans({ ...base, submissions }, discovered)
    const sql = plans.map(item => item.sql).join('\n')
    const params = plans.flatMap(item => item.params)
    expect(sql).toContain('UPDATE publication_state SET version=?')
    expect(sql).toContain('DELETE FROM listing_submission_rate_limits WHERE fingerprint_hash=?')
    expect(params).toContain('owned-fingerprint')
    for (const id of [...submissions.map(item => item.id), ...discovered])
      expect(params).toContain(id)
    expect(params).not.toContain('unrelated-fingerprint')
  })

  it('never targets a concurrent unrelated fingerprint', () => {
    const plans = buildRecoveryPlans(base, [])
    expect(plans.flatMap(item => item.params)).toContain('owned-fingerprint')
    expect(plans.flatMap(item => item.params)).not.toContain('unrelated-fingerprint')
  })
})
