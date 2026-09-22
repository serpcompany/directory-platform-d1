import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import {
  assertRemoteIdentity,
  buildCutoverPlan,
  freshMigrationChecksum,
  validateCutoverEvidence
} from './d1-replatform-cutover'
import { siteTargets } from './site-targets'

const commitSha = 'a'.repeat(40)
const checksum = freshMigrationChecksum()

function baseEvidence(environment: 'preview' | 'production') {
  const siteId = 'serp.software'
  const exactIdentity = {
    siteId,
    environment,
    protectedEnvironment: siteTargets[siteId].protectedEnvironment[environment],
    allowedSiteIds: [siteId],
    accountId: 'account-id',
    sourceDatabaseId: 'source-uuid',
    sourceDatabaseName: 'source-name',
    targetDatabaseId: 'target-uuid',
    targetDatabaseName: 'target-name',
    workerName: 'worker-name'
  }
  return {
    siteId,
    environment,
    commitSha,
    migrationChecksum: checksum,
    identity: {
      expected: exactIdentity,
      observed: { ...exactIdentity }
    },
    migration: {
      finalSnapshotSha256: 'b'.repeat(64),
      sourceSnapshotChecksum: 'c'.repeat(64),
      targetSnapshotChecksum: 'c'.repeat(64),
      firstRunMode: 'imported',
      repeatRunMode: 'verified-no-op',
      exactParity: true,
      freshMigrationLedger: true
    },
    catalogJourneys: ['home', 'category', 'detail', 'search', 'rss', 'sitemap', 'legacy-redirect'],
    submissionJourneys: [
      'intake',
      'rate-limit',
      'badge-verification',
      'private-review-preview',
      'approval',
      'rejection'
    ],
    rollbackRehearsed: true,
    nothingDeleted: true
  }
}

describe('D1 replatform cutover preparation', () => {
  it('keeps legacy and replacement templates separate for every Site', () => {
    for (const target of Object.values(siteTargets)) {
      for (const environment of ['preview', 'production'] as const) {
        const legacyPath =
          environment === 'preview'
            ? target.remote.previewConfigPath
            : target.remote.productionConfigPath
        const replacementPath =
          environment === 'preview'
            ? target.replatform.previewConfigPath
            : target.replatform.productionConfigPath
        expect(legacyPath).not.toBe(replacementPath)
        expect(readFileSync(legacyPath, 'utf8')).toContain('../../../d1/migrations')
        const replacement = readFileSync(replacementPath, 'utf8')
        expect(replacement).toContain('../../../d1/drizzle')
        expect(replacement).toContain(`"D1_RUNTIME_ENV": "${environment}"`)
        expect(replacement).toContain(`"SITE_ID": "${target.siteId}"`)
      }
    }
    expect(siteTargets['serp.software'].protectedEnvironment.preview).toBe('serp-software-preview')
    expect(siteTargets['pornvideodownloaders.com'].protectedEnvironment.preview).toBe(
      'pornvideodownloaders-preview'
    )
  })

  it('emits inert plans with ordered preview and production gates', () => {
    const preview = buildCutoverPlan('serp.software', 'preview')
    const production = buildCutoverPlan('serp.software', 'production')
    expect(preview.executesRemoteCommand).toBe(false)
    expect(preview.orderedGates).toContain('repeat-and-prove-verified-no-op')
    expect(production.orderedGates[0]).toBe('require-matching-sealed-preview-evidence')
    expect(production.orderedGates).toContain('acquire-one-site-wide-mutation-lock')
    expect(preview.migrationChecksum).toBe(production.migrationChecksum)
  })

  it('fails closed when a read-only observed identity differs from the protected expectation', () => {
    const identity = baseEvidence('preview').identity
    expect(() => assertRemoteIdentity('serp.software', 'preview', identity)).not.toThrow()
    expect(() =>
      assertRemoteIdentity('serp.software', 'preview', {
        ...identity,
        observed: { ...identity.observed, targetDatabaseId: 'wrong-target' }
      })
    ).toThrow('does not match')
    expect(() =>
      assertRemoteIdentity('serp.software', 'preview', {
        ...identity,
        observed: { ...identity.observed, allowedSiteIds: ['serp.software', 'example.com'] }
      })
    ).toThrow('must contain exactly')
  })

  it('accepts controlled Preview evidence and rejects private state', () => {
    const evidence = {
      ...baseEvidence('preview'),
      previewData: {
        policy: 'sanitized-snapshot',
        capabilityRows: 0,
        notificationSecretRows: 0,
        rateLimitRows: 0
      }
    }
    expect(() => validateCutoverEvidence(evidence)).not.toThrow()
    expect(() =>
      validateCutoverEvidence({
        ...evidence,
        previewData: { ...evidence.previewData, rateLimitRows: 1 }
      })
    ).toThrow('must be zero')
  })

  it('requires exact Preview binding, lock, freeze/replay, rollback, and retention evidence for Production', () => {
    const evidence = {
      ...baseEvidence('production'),
      previewEvidence: { siteId: 'serp.software', commitSha, migrationChecksum: checksum },
      separateProductionApproval: true,
      production: {
        siteWideMutationLock: true,
        finalSnapshotCapturedAfterLock: true,
        parityBeforeBindingChange: true,
        oldDatabaseReadOnly: true,
        replayProven: false,
        frozenMutations: ['submission', 'publication', 'approval', 'notification'],
        retentionDays: 30,
        backupArtifact: 'retained-artifact-id',
        rollbackCommand: 'protected workflow rollback operation',
        responsibleMaintainer: 'maintainer-login'
      }
    }
    expect(() => validateCutoverEvidence(evidence)).not.toThrow()
    expect(() =>
      validateCutoverEvidence({
        ...evidence,
        previewEvidence: { ...evidence.previewEvidence, commitSha: 'd'.repeat(40) }
      })
    ).toThrow('exact Preview')
    expect(() =>
      validateCutoverEvidence({
        ...evidence,
        production: { ...evidence.production, frozenMutations: [] }
      })
    ).toThrow('must contain exactly')
  })

  it('keeps the preparation workflow credential-free and non-mutating', () => {
    const raw = readFileSync('.github/workflows/prepare-d1-replatform.yml', 'utf8')
    const workflow = yaml.load(raw) as {
      permissions: unknown
      jobs: { prepare: { steps: Array<{ run?: string }> } }
    }
    const commands = workflow.jobs.prepare.steps.map(step => step.run ?? '').join('\n')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(raw).not.toMatch(/CLOUDFLARE_API_TOKEN|secrets\./u)
    expect(commands).not.toMatch(/--remote|\bd1\s+(?:create|delete|execute|export)|\bdeploy\b/u)
    expect(commands).toContain('d1-replatform-cutover.ts plan')
  })
})
