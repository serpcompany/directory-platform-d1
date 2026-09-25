import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { parseCloudflareHttpFailure } from './d1-database-provision'
import {
  deleteRetiredPreviewDatabase,
  preflightRetiredPreviewDeletion,
  type RetiredPreviewDeleteDependencies,
  retiredPreviewTargets,
  wranglerExportPlan
} from './d1-retired-preview-delete'
import { type SiteId, siteIds } from './site-targets'

const accountId = 'a'.repeat(32)
const sha = 'b'.repeat(40)
const envelope = (result: unknown) => ({ result, success: true })

function env(siteId: SiteId, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const target = retiredPreviewTargets[siteId]
  return {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    GITHUB_WORKFLOW_REF:
      'owner/repo/.github/workflows/delete-retired-preview-d1.yml@refs/heads/main',
    D1_PROTECTED_ENVIRONMENT: target.protectedEnvironment,
    D1_RETIRED_PREVIEW_DELETE_CONFIRM: target.confirmation,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_EXPECTED_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: 'masked-token',
    ...overrides
  }
}

function fixtures(
  siteId: SiteId,
  options: {
    credential?: 'api-token' | 'malformed-oauth' | 'wrangler-oauth'
    onDelete?: () => void
    postDeleteFailure?: boolean
    sourceBound?: boolean
  } = {}
) {
  const target = retiredPreviewTargets[siteId]
  const events: string[] = []
  let databases = [
    { name: target.retired.databaseName, uuid: target.retired.databaseId },
    { name: target.active.databaseName, uuid: target.active.databaseId }
  ]
  const workers = [target.active.workerName, 'unrelated-worker']
  const deps: RetiredPreviewDeleteDependencies = {
    async deleteDatabase(_account, id) {
      options.onDelete?.()
      events.push(`delete:${id}`)
      databases = databases.filter(item => item.uuid !== id)
      return envelope(null)
    },
    exportDatabase(database, output) {
      events.push(`export:${database.uuid}:${database.name}`)
      writeFileSync(output, '-- retained SQL\n')
    },
    async fetchAccount() {
      events.push('account')
      return envelope({ id: accountId })
    },
    async fetchDatabase(_account, id) {
      events.push(`database:${id}`)
      const found = databases.find(item => item.uuid === id)
      if (!found) throw new Error('missing database fixture')
      return envelope(found)
    },
    async fetchDatabases() {
      events.push('databases')
      if (options.postDeleteFailure && databases.length === 1)
        throw new Error('simulated post-delete failure containing masked-token')
      return databases
    },
    async fetchDeployments(_account, workerName) {
      events.push(`deployments:${workerName}`)
      return envelope({
        deployments: [{ versions: [{ percentage: 100, version_id: `${workerName}-version` }] }]
      })
    },
    async fetchToken() {
      events.push('token')
      if (options.credential !== undefined && options.credential !== 'api-token')
        throw parseCloudflareHttpFailure(401, {
          errors: [
            {
              code: options.credential === 'wrangler-oauth' ? 1000 : 1001,
              message: 'Invalid API Token'
            }
          ],
          result: null,
          success: false
        })
      return envelope({ id: 'token', status: 'active' })
    },
    async fetchUser() {
      events.push('user')
      return envelope({ email: 'maintainer@example.com', id: 'oauth-user-id' })
    },
    async fetchWorkerVersion(_account, workerName) {
      events.push(`version:${workerName}`)
      const databaseId =
        workerName === target.active.workerName
          ? target.active.databaseId
          : options.sourceBound
            ? target.retired.databaseId
            : '33333333-3333-4333-8333-333333333333'
      return envelope({
        resources: { bindings: [{ database_id: databaseId, name: 'DB', type: 'd1' }] }
      })
    },
    async fetchWorkers() {
      events.push('workers')
      return workers.map(id => ({ id }))
    },
    now: () => '2026-09-25T00:00:00.000Z',
    readGit: command => (command === 'head' ? sha : '')
  }
  return { deps, events }
}

describe.each(siteIds)('%s retired Preview D1 deletion', siteId => {
  it('exports before deleting exactly the hardcoded source and reproves the replacement', async () => {
    const directory = join(tmpdir(), `retired-preview-${siteId.replaceAll('.', '-')}-${Date.now()}`)
    const receipt = `${directory}.preflight.json`
    const sql = `${directory}.sql`
    const final = `${directory}.final.json`
    const { deps, events } = fixtures(siteId, {
      onDelete: () => {
        expect(JSON.parse(readFileSync(final, 'utf8'))).toMatchObject({
          action: 'delete-attempt',
          siteId
        })
      }
    })

    const preflight = await preflightRetiredPreviewDeletion(siteId, receipt, sql, env(siteId), deps)
    expect(preflight).toMatchObject({ action: 'preflight-complete', siteId })
    expect(events.some(event => event.startsWith('delete:'))).toBe(false)

    const result = await deleteRetiredPreviewDatabase(
      siteId,
      receipt,
      sql,
      final,
      env(siteId),
      deps
    )
    expect(result).toMatchObject({
      action: 'deleted',
      active: {
        name: retiredPreviewTargets[siteId].active.databaseName,
        uuid: retiredPreviewTargets[siteId].active.databaseId
      },
      deleted: {
        name: retiredPreviewTargets[siteId].retired.databaseName,
        uuid: retiredPreviewTargets[siteId].retired.databaseId
      },
      siteId
    })
    expect(events.filter(event => event.startsWith('delete:'))).toEqual([
      `delete:${retiredPreviewTargets[siteId].retired.databaseId}`
    ])
    expect(
      events.indexOf(
        `export:${retiredPreviewTargets[siteId].retired.databaseId}:${retiredPreviewTargets[siteId].retired.databaseName}`
      )
    ).toBeLessThan(events.indexOf(`delete:${retiredPreviewTargets[siteId].retired.databaseId}`))
    expect(JSON.stringify(result)).not.toContain('masked-token')
    expect(JSON.parse(readFileSync(final, 'utf8'))).toEqual(result)
  })

  it('accepts API-token identity and only the exact Wrangler OAuth fallback', async () => {
    const base = join(tmpdir(), `retired-preview-auth-${siteId.replaceAll('.', '-')}-${Date.now()}`)
    const api = fixtures(siteId, { credential: 'api-token' })
    const apiReceipt = await preflightRetiredPreviewDeletion(
      siteId,
      `${base}.api.json`,
      `${base}.api.sql`,
      env(siteId),
      api.deps
    )
    expect(apiReceipt).toMatchObject({ credentialIdentity: 'api-token' })
    expect(api.events).not.toContain('user')

    const oauth = fixtures(siteId, { credential: 'wrangler-oauth' })
    const oauthReceipt = await preflightRetiredPreviewDeletion(
      siteId,
      `${base}.oauth.json`,
      `${base}.oauth.sql`,
      env(siteId),
      oauth.deps
    )
    expect(oauthReceipt).toMatchObject({ credentialIdentity: 'wrangler-oauth' })
    expect(oauth.events.slice(0, 3)).toEqual(['token', 'user', 'account'])

    const malformed = fixtures(siteId, { credential: 'malformed-oauth' })
    await expect(
      preflightRetiredPreviewDeletion(
        siteId,
        `${base}.bad.json`,
        `${base}.bad.sql`,
        env(siteId),
        malformed.deps
      )
    ).rejects.toThrow('Cloudflare request failed')
    expect(malformed.events).toEqual(['token'])
  })

  it('retains a secret-free receipt when post-delete verification fails', async () => {
    const base = join(
      tmpdir(),
      `retired-preview-failure-${siteId.replaceAll('.', '-')}-${Date.now()}`
    )
    const receipt = `${base}.preflight.json`
    const sql = `${base}.sql`
    const final = `${base}.final.json`
    const fixture = fixtures(siteId, { postDeleteFailure: true })
    await preflightRetiredPreviewDeletion(siteId, receipt, sql, env(siteId), fixture.deps)

    await expect(
      deleteRetiredPreviewDatabase(siteId, receipt, sql, final, env(siteId), fixture.deps)
    ).rejects.toThrow('simulated post-delete failure')
    const retained = JSON.parse(readFileSync(final, 'utf8'))
    expect(retained).toMatchObject({
      action: 'post-delete-verification-error',
      credentialIdentity: 'api-token',
      siteId
    })
    expect(JSON.stringify(retained)).not.toContain('masked-token')
  })

  it('fails before mutation for wrong workflow authority or any active source binding', async () => {
    const wrong = fixtures(siteId)
    await expect(
      preflightRetiredPreviewDeletion(
        siteId,
        '/tmp/not-written.json',
        '/tmp/not-written.sql',
        env(siteId, { GITHUB_REF: 'refs/heads/topic' }),
        wrong.deps
      )
    ).rejects.toThrow('exact main-only')
    expect(wrong.events).toEqual([])

    const bound = fixtures(siteId, { sourceBound: true })
    await expect(
      preflightRetiredPreviewDeletion(
        siteId,
        '/tmp/not-written.json',
        '/tmp/not-written.sql',
        env(siteId),
        bound.deps
      )
    ).rejects.toThrow('remains bound')
    expect(bound.events.some(event => event.startsWith('export:'))).toBe(false)
    expect(bound.events.some(event => event.startsWith('delete:'))).toBe(false)
  })
})

describe('retired Preview deletion workflow', () => {
  it('pins Wrangler export to the exact remote name, UUID, and temporary config', () => {
    for (const siteId of siteIds) {
      const retired = retiredPreviewTargets[siteId].retired
      const plan = wranglerExportPlan(
        { name: retired.databaseName, uuid: retired.databaseId },
        '/tmp/pre-delete.sql'
      )
      expect(plan.args).toEqual([
        'exec',
        'wrangler',
        'd1',
        'export',
        retired.databaseName,
        '--config',
        '/tmp/pre-delete.sql.wrangler.json',
        '--remote',
        '--skip-confirmation',
        '--output',
        '/tmp/pre-delete.sql'
      ])
      expect(plan.config.d1_databases).toEqual([
        {
          binding: 'DB',
          database_id: retired.databaseId,
          database_name: retired.databaseName
        }
      ])
    }
  })

  it('is main-only, site-explicit, protected, and retains evidence before deletion', () => {
    const raw = readFileSync('.github/workflows/delete-retired-preview-d1.yml', 'utf8')
    const workflow = yaml.load(raw) as any
    const job = workflow.jobs.delete
    const steps = job.steps.map((step: { name?: string; run?: string }) => step)
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on.workflow_dispatch.inputs.site_id.options).toEqual([...siteIds])
    expect(job.if).toContain("github.ref == 'refs/heads/main'")
    expect(job.environment.name).toContain('pornvideodownloaders-preview')
    expect(job.environment.name).toContain('serp-software-preview')
    expect(
      steps.findIndex((step: { name?: string }) => step.name?.startsWith('Retain pre-delete'))
    ).toBeLessThan(
      steps.findIndex((step: { name?: string }) => step.name?.startsWith('Delete only'))
    )
    expect(raw).toContain('delete-retired-{0}-preview-d1')
    expect(raw).not.toMatch(/production-d1|PRODUCTION_DATABASE_ID/u)
  })
})
