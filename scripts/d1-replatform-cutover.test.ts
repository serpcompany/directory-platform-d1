import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import {
  assertRemoteIdentity,
  buildCutoverPlan,
  freshMigrationChecksum,
  previewReceiptSha256,
  validateCutoverEvidence,
  validateReplatformTemplate,
  verifyPreviewRemoteIdentity
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
    workerName: 'worker-name',
    workerHostname: 'preview.example.test'
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
        expect(() => validateReplatformTemplate(target.siteId, environment)).not.toThrow()
        expect(replacement).toContain('"compatibility_date": "2026-07-13"')
      }
    }
    expect(siteTargets['serp.software'].protectedEnvironment.preview).toBe('serp-software-preview')
    expect(siteTargets['pornvideodownloaders.com'].protectedEnvironment.preview).toBe(
      'pornvideodownloaders-preview'
    )
  })

  it('rejects extra bindings, wrong fresh paths, routes, flags, placeholders, and cross-Site references', () => {
    const sourcePath = siteTargets['serp.software'].replatform.previewConfigPath
    const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown>
    const cases: Array<[string, (config: Record<string, unknown>) => void]> = [
      ['extra binding', config => Object.assign(config, { kv_namespaces: [] })],
      [
        'wrong history',
        config => {
          ;(config.d1_databases as Array<Record<string, unknown>>)[0].migrations_dir =
            '../../../d1/migrations'
        }
      ],
      [
        'preview route',
        config =>
          Object.assign(config, {
            routes: [{ pattern: 'serp.software/*', zone_name: 'serp.software' }]
          })
      ],
      [
        'wrong flags',
        config => Object.assign(config, { compatibility_flags: ['nodejs_compat_v2'] })
      ],
      [
        'wrong placeholder',
        config => {
          ;(config.d1_databases as Array<Record<string, unknown>>)[0].database_id =
            '$' + '{CLOUDFLARE_D1_PRODUCTION_DATABASE_ID}'
        }
      ],
      [
        'cross Site',
        config => {
          ;(config.vars as Record<string, unknown>).SITE_ID = 'pornvideodownloaders.com'
        }
      ]
    ]
    for (const [name, mutate] of cases) {
      const candidate = structuredClone(source)
      mutate(candidate)
      expect(
        () =>
          validateReplatformTemplate(
            'serp.software',
            'preview',
            sourcePath,
            JSON.stringify(candidate)
          ),
        name
      ).toThrow()
    }
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

  it('binds observed remote identity to the protected workflow and checked-out GITHUB_SHA', async () => {
    const env = {
      GITHUB_ACTIONS: 'true',
      CI: 'true',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: commitSha,
      GITHUB_WORKFLOW_REF:
        'owner/repo/.github/workflows/rehearse-d1-replatform-preview.yml@refs/heads/main',
      WORKER_PRODUCTION_CONFIRM: 'rehearse-serp.software-preview',
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_EXPECTED_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_D1_PREVIEW_DATABASE_ID: 'source-uuid',
      CLOUDFLARE_D1_PREVIEW_DATABASE_NAME: 'source-name',
      CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID: 'target-uuid',
      CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME: 'target-name',
      CLOUDFLARE_WORKER_PREVIEW_NAME: 'worker-name',
      PREVIEW_BASE_URL: 'https://preview.example.test/'
    }
    const dependencies = {
      fetchAccount: async () => ({ success: true, result: { id: 'account-id' } }),
      fetchWorker: async () => ({ success: true, result: { name: 'worker-name' } }),
      fetchPreviewHostname: async () => 'preview.example.test',
      readD1Info: (name: string) =>
        name === 'source-name' ? { name, uuid: 'source-uuid' } : { name, uuid: 'target-uuid' },
      readGit: (command: 'head' | 'status') => (command === 'head' ? commitSha : '')
    }
    await expect(verifyPreviewRemoteIdentity('serp.software', env, dependencies)).resolves.toEqual(
      expect.objectContaining({ expected: expect.objectContaining({ accountId: 'account-id' }) })
    )
    await expect(
      verifyPreviewRemoteIdentity(
        'serp.software',
        { ...env, GITHUB_SHA: 'd'.repeat(40) },
        dependencies
      )
    ).rejects.toThrow('checked-out HEAD')
  })

  it('accepts controlled Preview evidence and rejects private state', () => {
    const evidence = {
      ...baseEvidence('preview'),
      previewData: {
        policy: 'sanitized-snapshot',
        copiedProduction: { capabilityRows: 0, notificationSecretRows: 0, rateLimitRows: 0 },
        previewGenerated: { capabilityRows: 1, notificationSecretRows: 1, rateLimitRows: 1 }
      }
    }
    expect(() => validateCutoverEvidence(evidence, { commitSha })).not.toThrow()
    expect(() =>
      validateCutoverEvidence(
        {
          ...evidence,
          previewData: {
            ...evidence.previewData,
            copiedProduction: { ...evidence.previewData.copiedProduction, rateLimitRows: 1 }
          }
        },
        { commitSha }
      )
    ).toThrow('must be zero')
  })

  it('requires exact Preview binding, lock, freeze/replay, rollback, and retention evidence for Production', () => {
    const previewEvidence = {
      ...baseEvidence('preview'),
      previewData: {
        policy: 'sanitized-snapshot',
        copiedProduction: { capabilityRows: 0, notificationSecretRows: 0, rateLimitRows: 0 },
        previewGenerated: { capabilityRows: 1, notificationSecretRows: 1, rateLimitRows: 1 }
      }
    }
    const digest = previewReceiptSha256(previewEvidence)
    const evidence = {
      ...baseEvidence('production'),
      previewReceipt: { evidence: previewEvidence, sha256: digest },
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
    expect(() =>
      validateCutoverEvidence(evidence, { commitSha, previewReceiptSha256: digest })
    ).not.toThrow()
    expect(() =>
      validateCutoverEvidence(
        {
          ...evidence,
          previewReceipt: {
            ...evidence.previewReceipt,
            evidence: { ...previewEvidence, commitSha: 'd'.repeat(40) }
          }
        },
        { commitSha, previewReceiptSha256: digest }
      )
    ).toThrow('content does not match')
    expect(() =>
      validateCutoverEvidence(
        {
          ...evidence,
          production: { ...evidence.production, frozenMutations: [] }
        },
        { commitSha, previewReceiptSha256: digest }
      )
    ).toThrow('must contain exactly')
  })

  it('rejects a caller-invented commit even when evidence is otherwise complete', () => {
    const evidence = {
      ...baseEvidence('preview'),
      previewData: {
        policy: 'controlled-fixtures',
        copiedProduction: { capabilityRows: 0, notificationSecretRows: 0, rateLimitRows: 0 },
        previewGenerated: { capabilityRows: 1, notificationSecretRows: 1, rateLimitRows: 1 }
      }
    }
    expect(() => validateCutoverEvidence(evidence, { commitSha: 'd'.repeat(40) })).toThrow(
      'trusted GITHUB_SHA'
    )
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

  it('prepares an approval-gated Preview executor with ordered migrate, browser, repeat, and rollback gates', () => {
    const raw = readFileSync('.github/workflows/rehearse-d1-replatform-preview.yml', 'utf8')
    const workflow = yaml.load(raw) as {
      permissions: unknown
      jobs: {
        rehearse: {
          environment: { name: string }
          if: string
          steps: Array<{ name?: string; run?: string }>
        }
      }
    }
    const job = workflow.jobs.rehearse
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(job.if).toContain("github.ref == 'refs/heads/main'")
    expect(job.environment.name).toContain('serp-software-preview')
    expect(raw).not.toContain('cutover-')
    const names = job.steps.map(step => step.name)
    const ordered = [
      'Verify observed account, source D1, replacement D1, and Worker identity',
      'Apply fresh schema, import controlled data, and verify exact parity',
      'Deploy replacement binding from exact commit',
      'Run critical Catalog and Submission browser journeys',
      'Repeat import and prove verified no-op with unchanged parity',
      'Rehearse nondestructive old-binding rollback and restoration',
      'Build and validate sealed exact-commit Preview receipt',
      'Seal trusted Preview evidence'
    ].map(name => names.indexOf(name))
    expect(ordered.every(index => index >= 0)).toBe(true)
    expect(ordered).toEqual([...ordered].sort((left, right) => left - right))
    expect(raw).toContain('D1_RELEASE_GENERATION: replatform')
    expect(raw).toContain('validate-replatform preview')
    expect(raw).toContain('d1-preview-submission-journey.ts')
    expect(raw).not.toContain('submission-verification.spec.ts')
    expect(raw.match(/verify-preview-identity/gu)?.length).toBeGreaterThanOrEqual(7)
  })

  it('keeps the controlled badge fixture Preview-only and capability-gated', () => {
    for (const siteId of ['serp.software', 'pornvideodownloaders.com']) {
      const source = readFileSync(
        `apps/${siteId}/app/api/replatform/badge-fixture/route.ts`,
        'utf8'
      )
      expect(source).toContain("D1_RUNTIME_ENV !== 'preview'")
      expect(source).toContain('REPLATFORM_PREVIEW_CAPABILITY')
      expect(source).toContain('BADGE_VERIFIER_USER_AGENT')
      expect(source).not.toMatch(/(?:INSERT|UPDATE|DELETE|DB\.)/u)
    }
  })

  it('derives sealed evidence from measured D1 and journey artifacts', () => {
    const source = readFileSync('scripts/d1-preview-evidence.ts', 'utf8')
    expect(source).toContain("required(values, '--measurement')")
    expect(source).toContain("required(values, '--submission-journeys')")
    expect(source).toContain("required(values, '--post-journey-measurement')")
    expect(source).not.toMatch(
      /exactParity:\s*true|freshMigrationLedger:\s*true|nothingDeleted:\s*true/u
    )
    expect(source).not.toMatch(/copiedProduction:\s*\{[^}]*:\s*0/u)
  })
})
