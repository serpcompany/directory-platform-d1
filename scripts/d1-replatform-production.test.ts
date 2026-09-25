import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acquireCutoverLock,
  activeDeployment,
  finalizeActiveLock,
  sealProductionEvidence,
  validateProductionReceipt
} from './d1-replatform-production'

const digest = 'a'.repeat(64)
const identity = {
  activeDeploymentId: 'source-deployment',
  activeVersionId: 'source-version',
  accountId: 'account',
  allowedSiteIds: ['serp.software'],
  currentDatabaseId: 'source-id',
  protectedEnvironment: 'production',
  replacementDatabaseId: 'target-id',
  replacementDatabaseName: 'target-name',
  routeId: 'route',
  routePattern: 'serp.software/*',
  siteId: 'serp.software',
  sourceDatabaseId: 'source-id',
  sourceDatabaseName: 'source-name',
  verifiedAt: '2026-09-25T00:00:00.000Z',
  workerName: 'worker',
  zoneId: 'zone',
  zoneName: 'serp.software'
}

function evidence() {
  return {
    authorityRemoved: true,
    commitSha: 'b'.repeat(40),
    cutoverId: '123-1',
    frozenSnapshotChecksum: digest,
    identity: { ...identity, allowedSiteIds: [...identity.allowedSiteIds] },
    preview: { artifactId: 1, artifactName: 'preview', receiptSha256: digest, runId: 2 },
    rollback: {
      sourceVersionId: 'source-version',
      sourceVerified: true,
      targetRestored: true,
      targetVersionId: 'target-version'
    },
    siteId: 'serp.software',
    sourceBackupSha256: digest,
    status: 'locked-target-active',
    targetBackupSha256: digest,
    transfer: {
      materializeMode: 'imported',
      receiptId: 'receipt',
      snapshotChecksum: digest,
      totalRows: 17,
      verificationMode: 'verified-no-op'
    },
    version: 1
  }
}

describe('Production cutover sealed evidence', () => {
  it('seals and revalidates the exact measured schema', () => {
    const sealed = sealProductionEvidence(evidence())
    expect(validateProductionReceipt(sealed, sealed.sha256)).toEqual(sealed)
  })

  it.each([
    ['unknown field', value => Object.assign(value, { success: true })],
    ['wrong Site', value => Object.assign(value.identity, { siteId: 'pornvideodownloaders.com' })],
    ['wrong parity', value => Object.assign(value.transfer, { snapshotChecksum: 'c'.repeat(64) })],
    ['missing rollback', value => Object.assign(value.rollback, { sourceVerified: false })],
    ['same versions', value => Object.assign(value.rollback, { targetVersionId: 'source-version' })]
  ])('rejects %s without success defaults', (_label, mutate) => {
    const value = evidence() as Record<string, any>
    mutate(value)
    expect(() => sealProductionEvidence(value)).toThrow()
  })

  it('rejects receipt and protected-digest tampering', () => {
    const sealed = sealProductionEvidence(evidence())
    expect(() => validateProductionReceipt(sealed, 'c'.repeat(64))).toThrow('protected evidence')
    expect(() =>
      validateProductionReceipt(
        { ...sealed, evidence: { ...sealed.evidence, status: 'complete' } },
        sealed.sha256
      )
    ).toThrow()
  })
})

describe('Production cutover workflow contracts', () => {
  const load = (name: string) => {
    const source = readFileSync(resolve(`.github/workflows/${name}.yml`), 'utf8')
    return { source, workflow: yaml.load(source) as Record<string, any> }
  }

  it.each([
    'cutover-d1-replatform-production',
    'rollback-d1-replatform-production',
    'finalize-d1-replatform-production'
  ])('%s is main-only, Site-serialized, protected, and retains evidence for 90 days', name => {
    const { source, workflow } = load(name)
    expect(source).toContain("github.ref == 'refs/heads/main'")
    expect(workflow.concurrency.group).toBe('${{ inputs.site_id }}-production-d1')
    expect(workflow.concurrency['cancel-in-progress']).toBe(false)
    expect(source).toContain("'production' || 'pornvideodownloaders-production'")
    expect(source).toContain('retention-days: 90')
    expect(source).not.toMatch(/d1 delete|wrangler delete|time-travel restore/u)
  })

  it('orders freeze, exact snapshot, transfer, cutover, gates, rollback rehearsal, restoration, and sealing', () => {
    const { source } = load('cutover-d1-replatform-production')
    const ordered = [
      'Validate exact-main Preview trust and Production identity',
      'Deploy and observe exact-main source-bound Worker',
      'Retain immutable source and empty-target backups',
      'Acquire immutable Site-wide write lock',
      'Prove public writes are frozen',
      'Capture exact stable frozen 17-table source snapshot',
      'Apply fresh schema and resumably import exact frozen snapshot',
      'Deploy same commit target-bound and attest sole active version',
      'Run Production-safe catalog and frozen-write gates',
      'Rehearse immutable source-version rollback',
      'Restore exact target version and leave both databases locked',
      'Seal exact measured cutover receipt'
    ]
    let prior = -1
    for (const label of ordered) {
      const current = source.indexOf(label)
      expect(current, label).toBeGreaterThan(prior)
      prior = current
    }
    expect(source).toContain('if: always()')
    expect(source).not.toContain("outcome='succeeded'")
    expect(source.match(/Current Version ID:/gu)).toHaveLength(2)
    expect(source).toContain('browser-fixture --site')
    expect(source).not.toContain('E2E_LISTING_COUNT: ${{')
    expect(source).not.toContain('EVIDENCE_DIR: ${{ runner.temp }}')
    expect(source).not.toContain('printf \'%s\' "${{ inputs.cutover_id }}"')
  })

  it('rolls back by recorded immutable version only and finalizes only the active target lock', () => {
    const rollback = load('rollback-d1-replatform-production').source
    const finalize = load('finalize-d1-replatform-production').source
    expect(rollback).toContain('versions deploy "${source_version}@100"')
    expect(rollback).toContain('TRUSTED_RECOVERY_RECEIPT_SHA256')
    expect(rollback).toContain('validate-recovery')
    expect(rollback).not.toMatch(/build:worker|d1.*execute|migrations apply|backup production/u)
    expect(finalize).toContain('--database-id "$CLOUDFLARE_D1_REPLACEMENT_PRODUCTION_DATABASE_ID"')
    expect(finalize).toContain('--database-id "$CLOUDFLARE_D1_PRODUCTION_DATABASE_ID" --cutover-id')
    expect(finalize).not.toContain('versions deploy')
  })
})

describe('Production provider boundaries', () => {
  const original = { ...process.env }
  afterEach(() => {
    process.env = { ...original }
    vi.unstubAllGlobals()
  })

  it('acquires and finalizes a lock through atomic REST batches with exact assertions', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account'
    process.env.CLOUDFLARE_API_TOKEN = 'token'
    const bodies: unknown[] = []
    const responses = [
      [{ success: true, results: [] }],
      [{ success: true, results: [{ id: 'd1-cutover-lock-v1:serp.software:cutover' }] }],
      [
        { success: true, results: [] },
        { success: true, results: [{ value: 1 }] }
      ],
      [{ success: true, results: [{ outcome: 'succeeded', completed_at: 'later' }] }]
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ success: true, result: responses.shift() }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      })
    )
    await expect(
      acquireCutoverLock('database', 'serp.software', 'cutover', 'now')
    ).resolves.toContain('cutover')
    await expect(
      finalizeActiveLock('database', 'serp.software', 'cutover', 'later')
    ).resolves.toBeUndefined()
    expect(bodies[0]).toEqual(expect.objectContaining({ batch: expect.any(Array) }))
    expect((bodies[0] as { batch: unknown[] }).batch).toHaveLength(1)
    expect((bodies[2] as { batch: unknown[] }).batch).toHaveLength(2)
  })

  it('observes the exact emitted sole version, script, route, and D1 binding', async () => {
    Object.assign(process.env, {
      CLOUDFLARE_ACCOUNT_ID: 'account',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_WORKER_PRODUCTION_NAME: 'worker',
      GITHUB_SHA: 'b'.repeat(40)
    })
    const results = [
      { name: 'worker' },
      [{ id: 'zone', name: 'serp.software', status: 'active' }],
      [{ id: 'route', pattern: 'serp.software/*', script: 'worker' }],
      {
        deployments: [{ id: 'deployment', versions: [{ percentage: 100, version_id: 'version' }] }]
      },
      {
        id: 'version',
        resources: {
          script: { etag: 'etag' },
          bindings: [{ type: 'd1', name: 'DB', database_id: 'database' }]
        }
      }
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, result: results.shift() }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
      )
    )
    await expect(activeDeployment('serp.software', 'database', 'version')).resolves.toEqual(
      expect.objectContaining({
        capturedVersionId: 'version',
        commitSha: 'b'.repeat(40),
        databaseId: 'database',
        routeId: 'route',
        scriptEtag: 'etag',
        versionId: 'version'
      })
    )
  })
})
