import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { provisionPvdReplacementPreview } from './d1-preview-provision'
import { siteTargets } from './site-targets'

const sourceId = '11111111-1111-4111-8111-111111111111'
const replacementId = '22222222-2222-4222-8222-222222222222'
const accountId = 'a'.repeat(32)
const sha = 'b'.repeat(40)
const sourceName = 'pornvideodownloaders-preview'
const replacementName = 'pornvideodownloaders-replatform-preview'
const workerName = 'pornvideodownloaders-preview'

function envelope(result: unknown) {
  return { result, success: true }
}

function workflowEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    GITHUB_WORKFLOW_REF:
      'owner/repo/.github/workflows/provision-pornvideodownloaders-replacement-preview.yml@refs/heads/main',
    D1_PREVIEW_PROVISION_CONFIRM: 'provision-pornvideodownloaders.com-replacement-preview',
    D1_PROTECTED_ENVIRONMENT: 'pornvideodownloaders-preview',
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_EXPECTED_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: 'masked-token',
    CLOUDFLARE_D1_PREVIEW_DATABASE_ID: sourceId,
    CLOUDFLARE_D1_PREVIEW_DATABASE_NAME: sourceName,
    CLOUDFLARE_WORKER_PREVIEW_NAME: workerName,
    ...overrides
  }
}

function dependencies(options: { existing?: boolean; sourceJurisdiction?: string } = {}) {
  const events: string[] = []
  let databases = [
    { created_in_region: 'APAC', name: sourceName, uuid: sourceId },
    ...(options.existing
      ? [{ created_in_region: 'APAC', name: replacementName, uuid: replacementId }]
      : [])
  ]
  const deps = {
    async createDatabase(
      _accountId: string,
      _token: string,
      body: { name: string; primary_location_hint?: string; jurisdiction?: string }
    ) {
      events.push(`create:${JSON.stringify(body)}`)
      const created = {
        created_in_region: body.primary_location_hint?.toUpperCase(),
        jurisdiction: body.jurisdiction,
        name: body.name,
        uuid: replacementId
      }
      databases = [...databases, created]
      return envelope(created)
    },
    async fetchAccount() {
      events.push('account')
      return envelope({ id: accountId, name: 'expected-account' })
    },
    async fetchDatabase(_accountId: string, id: string) {
      events.push(`database:${id}`)
      const found = databases.find(item => item.uuid === id)
      if (!found) throw new Error('missing fixture database')
      return envelope({
        ...found,
        ...(id === sourceId && options.sourceJurisdiction
          ? { created_in_region: undefined, jurisdiction: options.sourceJurisdiction }
          : {})
      })
    },
    async fetchDatabases() {
      events.push('databases')
      return databases
    },
    async fetchToken() {
      events.push('token')
      return envelope({ status: 'active' })
    },
    async fetchWorker() {
      events.push('worker')
      return envelope({ name: workerName })
    },
    readGit(command: 'head' | 'status') {
      return command === 'head' ? sha : ''
    },
    now: () => '2026-09-25T00:00:00.000Z'
  }
  return { deps, events }
}

describe('PVD replacement Preview D1 provisioning', () => {
  it('proves all protected identities before creating exactly one D1 in the source region', async () => {
    const { deps, events } = dependencies()
    const evidence = await provisionPvdReplacementPreview(
      'pornvideodownloaders.com',
      workflowEnvironment(),
      deps
    )

    expect(evidence).toMatchObject({
      action: 'created',
      accountId,
      commitSha: sha,
      environment: 'preview',
      protectedEnvironment: 'pornvideodownloaders-preview',
      replacement: {
        jurisdiction: null,
        name: replacementName,
        region: 'apac',
        uuid: replacementId
      },
      siteId: 'pornvideodownloaders.com',
      source: { name: sourceName, region: 'apac', uuid: sourceId },
      verifiedWorkerName: workerName
    })
    expect(events.filter(item => item.startsWith('create:'))).toEqual([
      `create:${JSON.stringify({ name: replacementName, primary_location_hint: 'apac' })}`
    ])
    expect(events.indexOf('token')).toBeLessThan(
      events.findIndex(item => item.startsWith('create:'))
    )
    expect(events.indexOf('account')).toBeLessThan(
      events.findIndex(item => item.startsWith('create:'))
    )
    expect(events.indexOf('worker')).toBeLessThan(
      events.findIndex(item => item.startsWith('create:'))
    )
    expect(JSON.stringify(evidence)).not.toContain('masked-token')
  })

  it('copies an explicit source jurisdiction instead of a location hint', async () => {
    const { deps, events } = dependencies({ sourceJurisdiction: 'eu' })
    const evidence = await provisionPvdReplacementPreview(
      'pornvideodownloaders.com',
      workflowEnvironment(),
      deps
    )
    expect(events.filter(item => item.startsWith('create:'))).toEqual([
      `create:${JSON.stringify({ name: replacementName, jurisdiction: 'eu' })}`
    ])
    expect(evidence.replacement).toMatchObject({ jurisdiction: 'eu', region: null })
  })

  it('makes an exact protected rerun read-only and returns the existing identity', async () => {
    const { deps, events } = dependencies({ existing: true })
    const evidence = await provisionPvdReplacementPreview(
      'pornvideodownloaders.com',
      workflowEnvironment({
        CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID: replacementId,
        CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME: replacementName
      }),
      deps
    )
    expect(evidence).toMatchObject({
      action: 'verified-existing',
      replacement: { name: replacementName, uuid: replacementId }
    })
    expect(events.some(item => item.startsWith('create:'))).toBe(false)
  })

  it('refuses an unexpected same-name resource, partial expectations, aliases, and missing expected targets', async () => {
    const existing = dependencies({ existing: true })
    await expect(
      provisionPvdReplacementPreview(
        'pornvideodownloaders.com',
        workflowEnvironment(),
        existing.deps
      )
    ).rejects.toThrow('configure its exact protected ID and name')
    expect(existing.events.some(item => item.startsWith('create:'))).toBe(false)

    const partial = dependencies()
    await expect(
      provisionPvdReplacementPreview(
        'pornvideodownloaders.com',
        workflowEnvironment({
          CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID: replacementId
        }),
        partial.deps
      )
    ).rejects.toThrow('both absent or both present')

    const alias = dependencies()
    await expect(
      provisionPvdReplacementPreview(
        'pornvideodownloaders.com',
        workflowEnvironment({
          CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID: sourceId,
          CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME: replacementName
        }),
        alias.deps
      )
    ).rejects.toThrow('IDs must be distinct')

    const missing = dependencies()
    await expect(
      provisionPvdReplacementPreview(
        'pornvideodownloaders.com',
        workflowEnvironment({
          CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID: replacementId,
          CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME: replacementName
        }),
        missing.deps
      )
    ).rejects.toThrow('configured but is not present')
  })

  it('rejects any non-main, wrong-workflow, wrong-environment, or wrong-confirmation execution', async () => {
    const cases: Array<[string, NodeJS.ProcessEnv]> = [
      ['branch', { GITHUB_REF: 'refs/heads/topic' }],
      [
        'workflow',
        { GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/other.yml@refs/heads/main' }
      ],
      ['environment', { D1_PROTECTED_ENVIRONMENT: 'production' }],
      ['confirmation', { D1_PREVIEW_PROVISION_CONFIRM: 'provision-something-else' }]
    ]
    for (const [label, overrides] of cases) {
      const { deps, events } = dependencies()
      await expect(
        provisionPvdReplacementPreview(
          'pornvideodownloaders.com',
          workflowEnvironment(overrides),
          deps
        ),
        label
      ).rejects.toThrow()
      expect(events).toEqual([])
    }
  })
})

describe('PVD replacement Preview provisioning workflow contract', () => {
  it('is exact-main, protected, PVD-only, and limited to one provisioning script', () => {
    const raw = readFileSync(
      '.github/workflows/provision-pornvideodownloaders-replacement-preview.yml',
      'utf8'
    )
    const workflow = yaml.load(raw) as {
      jobs: {
        provision: { environment: { name: string }; if: string; steps: Array<{ run?: string }> }
      }
      on: {
        workflow_dispatch: { inputs: { confirmation: { description: string; required: boolean } } }
      }
      permissions: Record<string, string>
    }
    const job = workflow.jobs.provision
    const commands = job.steps.map(step => step.run ?? '').join('\n')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on.workflow_dispatch.inputs.confirmation).toMatchObject({
      description: 'Type provision-pornvideodownloaders.com-replacement-preview',
      required: true
    })
    expect(job.if).toContain("github.ref == 'refs/heads/main'")
    expect(job.if).toContain(
      "inputs.confirmation == 'provision-pornvideodownloaders.com-replacement-preview'"
    )
    expect(job.environment.name).toBe('pornvideodownloaders-preview')
    expect(commands).toContain('scripts/d1-preview-provision.ts')
    expect(commands).toContain('--site pornvideodownloaders.com')
    expect(commands).not.toMatch(
      /worker-release|wrangler|d1\s+(?:execute|migrations|delete)|gh secret|production/iu
    )
    expect(raw).not.toContain('CLOUDFLARE_D1_PRODUCTION')
    expect(raw).not.toContain('deploy')
    expect(raw).not.toContain('delete')
  })

  it('derives the exact replacement name from the registry while the template stays credential-free', () => {
    const target = siteTargets['pornvideodownloaders.com']
    expect(target.replatform.previewDatabaseName).toBe(replacementName)
    expect(target.confirmation.provision.replacementPreview).toBe(
      'provision-pornvideodownloaders.com-replacement-preview'
    )
    const template = readFileSync(target.replatform.previewConfigPath, 'utf8')
    expect(template).toContain('$' + '{CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME}')
    expect(template).not.toContain(replacementId)
  })
})
