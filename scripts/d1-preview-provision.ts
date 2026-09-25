import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveSiteTarget, type SiteId } from './site-targets'

const provisioningSiteId = 'pornvideodownloaders.com' as const
const provisioningWorkflow =
  '/.github/workflows/provision-pornvideodownloaders-replacement-preview.yml@refs/heads/main'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const locationHints = ['weur', 'eeur', 'apac', 'oc', 'wnam', 'enam'] as const
const jurisdictions = ['eu', 'fedramp', 'us'] as const

type LocationHint = (typeof locationHints)[number]
type Jurisdiction = (typeof jurisdictions)[number]

interface CloudflareEnvelope<T> {
  errors?: unknown[]
  result?: T
  result_info?: { page?: number; total_pages?: number }
  success?: boolean
}

interface D1Database {
  created_at?: string
  created_in_region?: string
  jurisdiction?: string | null
  name?: string
  primary_location_hint?: string
  uuid?: string
}

interface ProvisionDependencies {
  createDatabase(
    accountId: string,
    token: string,
    body: { jurisdiction?: Jurisdiction; name: string; primary_location_hint?: LocationHint }
  ): Promise<unknown>
  fetchAccount(accountId: string, token: string): Promise<unknown>
  fetchDatabase(accountId: string, databaseId: string, token: string): Promise<unknown>
  fetchDatabases(accountId: string, token: string): Promise<unknown[]>
  fetchToken(token: string): Promise<unknown>
  fetchWorker(accountId: string, workerName: string, token: string): Promise<unknown>
  readGit(command: 'head' | 'status'): string
  now(): string
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be nonempty.`)
  return value
}

function uuid(value: unknown, label: string): string {
  const parsed = nonempty(value, label)
  if (!uuidPattern.test(parsed)) throw new Error(`${label} must be a UUID.`)
  return parsed
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function result<T extends object>(value: unknown, label: string): T {
  const envelope = object(value, label) as CloudflareEnvelope<unknown>
  if (envelope.success !== true) throw new Error(`${label} was not successful.`)
  return object(envelope.result, `${label}.result`) as T
}

function database(
  value: unknown,
  label: string
): Required<Pick<D1Database, 'name' | 'uuid'>> & D1Database {
  const item = object(value, label) as D1Database
  return {
    ...item,
    name: nonempty(item.name, `${label}.name`),
    uuid: uuid(item.uuid, `${label}.uuid`)
  }
}

async function cloudflareRequest(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {})
    }
  })
  if (!response.ok) throw new Error(`Cloudflare request failed with HTTP ${response.status}.`)
  return response.json()
}

const defaultDependencies: ProvisionDependencies = {
  createDatabase(accountId, token, body) {
    return cloudflareRequest(`/accounts/${encodeURIComponent(accountId)}/d1/database`, token, {
      body: JSON.stringify(body),
      method: 'POST'
    })
  },
  fetchAccount(accountId, token) {
    return cloudflareRequest(`/accounts/${encodeURIComponent(accountId)}`, token)
  },
  fetchDatabase(accountId, databaseId, token) {
    return cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}`,
      token
    )
  },
  async fetchDatabases(accountId, token) {
    const databases: unknown[] = []
    for (let page = 1; page <= 100; page += 1) {
      const response = object(
        await cloudflareRequest(
          `/accounts/${encodeURIComponent(accountId)}/d1/database?page=${page}&per_page=100`,
          token
        ),
        'Cloudflare D1 list'
      ) as CloudflareEnvelope<unknown>
      if (response.success !== true || !Array.isArray(response.result))
        throw new Error('Cloudflare D1 list was not successful.')
      databases.push(...response.result)
      const totalPages = response.result_info?.total_pages
      if (typeof totalPages === 'number' ? page >= totalPages : response.result.length < 100)
        return databases
    }
    throw new Error('Cloudflare D1 list exceeded the bounded page limit.')
  },
  fetchToken(token) {
    return cloudflareRequest('/user/tokens/verify', token)
  },
  fetchWorker(accountId, workerName, token) {
    return cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/workers/services/${encodeURIComponent(workerName)}`,
      token
    )
  },
  readGit(command) {
    const args = command === 'head' ? ['rev-parse', 'HEAD'] : ['status', '--porcelain']
    const execution = spawnSync('git', args, { encoding: 'utf8' })
    if (execution.status !== 0) throw new Error('Unable to verify the checked-out commit.')
    return execution.stdout.trim()
  },
  now: () => new Date().toISOString()
}

function placement(
  source: D1Database
):
  | { create: { jurisdiction: Jurisdiction }; jurisdiction: Jurisdiction; region: null }
  | { create: { primary_location_hint: LocationHint }; jurisdiction: null; region: LocationHint } {
  if (source.jurisdiction) {
    const value = source.jurisdiction.toLowerCase()
    if (!jurisdictions.includes(value as Jurisdiction))
      throw new Error('Source D1 has an unsupported jurisdiction.')
    return {
      create: { jurisdiction: value as Jurisdiction },
      jurisdiction: value as Jurisdiction,
      region: null
    }
  }
  const rawRegion = source.created_in_region ?? source.primary_location_hint
  if (!rawRegion)
    throw new Error('Source D1 identity does not expose a jurisdiction or primary region.')
  const value = rawRegion.toLowerCase()
  if (!locationHints.includes(value as LocationHint))
    throw new Error('Source D1 has an unsupported primary region.')
  return {
    create: { primary_location_hint: value as LocationHint },
    jurisdiction: null,
    region: value as LocationHint
  }
}

function assertWorkflow(
  siteId: SiteId,
  env: NodeJS.ProcessEnv,
  dependencies: ProvisionDependencies
) {
  const target = resolveSiteTarget(siteId)
  if (siteId !== provisioningSiteId) throw new Error('This workflow provisions only PVD Preview.')
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.CI !== 'true' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    !env.GITHUB_WORKFLOW_REF?.endsWith(provisioningWorkflow)
  )
    throw new Error('Replacement Preview provisioning requires the exact protected main workflow.')
  if (env.D1_PROTECTED_ENVIRONMENT !== target.protectedEnvironment.preview)
    throw new Error('Protected Preview environment does not match the selected Site.')
  if (env.D1_PREVIEW_PROVISION_CONFIRM !== target.confirmation.provision.replacementPreview)
    throw new Error('Exact replacement Preview provisioning confirmation is required.')
  const commitSha = nonempty(env.GITHUB_SHA, 'GITHUB_SHA')
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) throw new Error('GITHUB_SHA must be a full commit SHA.')
  if (dependencies.readGit('status')) throw new Error('Provisioning requires a clean checkout.')
  if (dependencies.readGit('head') !== commitSha)
    throw new Error('GITHUB_SHA must match checked-out HEAD.')
  return { commitSha, target }
}

export async function provisionPvdReplacementPreview(
  siteId: SiteId,
  env: NodeJS.ProcessEnv,
  dependencies: ProvisionDependencies = defaultDependencies
): Promise<Record<string, unknown>> {
  const { commitSha, target } = assertWorkflow(siteId, env, dependencies)
  const accountId = nonempty(env.CLOUDFLARE_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID')
  const expectedAccountId = nonempty(
    env.CLOUDFLARE_EXPECTED_ACCOUNT_ID,
    'CLOUDFLARE_EXPECTED_ACCOUNT_ID'
  )
  if (accountId !== expectedAccountId) throw new Error('Cloudflare account IDs do not match.')
  const token = nonempty(env.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN')
  const sourceDatabaseId = uuid(
    env.CLOUDFLARE_D1_PREVIEW_DATABASE_ID,
    'CLOUDFLARE_D1_PREVIEW_DATABASE_ID'
  )
  const sourceDatabaseName = nonempty(
    env.CLOUDFLARE_D1_PREVIEW_DATABASE_NAME,
    'CLOUDFLARE_D1_PREVIEW_DATABASE_NAME'
  )
  const workerName = nonempty(env.CLOUDFLARE_WORKER_PREVIEW_NAME, 'CLOUDFLARE_WORKER_PREVIEW_NAME')
  const expectedReplacementName = target.replatform.previewDatabaseName
  if (sourceDatabaseName === expectedReplacementName)
    throw new Error('Source and replacement Preview D1 names must be distinct.')

  const configuredReplacementId = env.CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID?.trim() ?? ''
  const configuredReplacementName =
    env.CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME?.trim() ?? ''
  if (Boolean(configuredReplacementId) !== Boolean(configuredReplacementName))
    throw new Error('Protected replacement D1 ID and name must be both absent or both present.')
  if (configuredReplacementName && configuredReplacementName !== expectedReplacementName)
    throw new Error('Protected replacement D1 name does not match the Site registry.')
  if (
    configuredReplacementId &&
    uuid(configuredReplacementId, 'Protected replacement D1 ID') === sourceDatabaseId
  )
    throw new Error('Source and replacement Preview D1 IDs must be distinct.')

  const tokenProof = result<Record<string, unknown>>(
    await dependencies.fetchToken(token),
    'Cloudflare token verification'
  )
  if (tokenProof.status !== 'active') throw new Error('Cloudflare token is not active.')
  const account = result<Record<string, unknown>>(
    await dependencies.fetchAccount(accountId, token),
    'Cloudflare account identity'
  )
  if (account.id !== expectedAccountId)
    throw new Error('Observed Cloudflare account does not match the protected account.')

  const listed = (await dependencies.fetchDatabases(accountId, token)).map((item, index) =>
    database(item, `Cloudflare D1 list[${index}]`)
  )
  const sourceById = listed.filter(item => item.uuid === sourceDatabaseId)
  const sourceByName = listed.filter(item => item.name === sourceDatabaseName)
  if (
    sourceById.length !== 1 ||
    sourceByName.length !== 1 ||
    sourceById[0]?.uuid !== sourceByName[0]?.uuid
  )
    throw new Error('Source Preview D1 identity is missing or ambiguous.')
  const source = database(
    result<D1Database>(
      await dependencies.fetchDatabase(accountId, sourceDatabaseId, token),
      'Source Preview D1 identity'
    ),
    'Source Preview D1 identity.result'
  )
  if (source.uuid !== sourceDatabaseId || source.name !== sourceDatabaseName)
    throw new Error('Observed source Preview D1 does not match protected identity.')
  const sourcePlacement = placement(source)

  const worker = result<Record<string, unknown>>(
    await dependencies.fetchWorker(accountId, workerName, token),
    'Preview Worker identity'
  )
  if ((worker.name ?? worker.id) !== workerName)
    throw new Error('Observed Preview Worker does not match protected identity.')

  const sameName = listed.filter(item => item.name === expectedReplacementName)
  if (sameName.length > 1) throw new Error('Replacement Preview D1 name is ambiguous.')
  if (sameName[0]?.uuid === sourceDatabaseId)
    throw new Error('Source and replacement Preview D1 identities alias.')

  const baseEvidence = {
    accountId: expectedAccountId,
    commitSha,
    environment: 'preview',
    protectedEnvironment: target.protectedEnvironment.preview,
    siteId,
    source: {
      jurisdiction: sourcePlacement.jurisdiction,
      name: sourceDatabaseName,
      region: sourcePlacement.region,
      uuid: sourceDatabaseId
    },
    verifiedWorkerName: workerName,
    workflow: 'provision-pornvideodownloaders-replacement-preview'
  }

  if (sameName.length === 1) {
    if (!configuredReplacementId)
      throw new Error(
        'Expected replacement D1 already exists; configure its exact protected ID and name before rerunning.'
      )
    const expectedId = uuid(configuredReplacementId, 'Protected replacement D1 ID')
    if (sameName[0]?.uuid !== expectedId)
      throw new Error('Existing replacement D1 does not match protected expected identity.')
    const existing = database(
      result<D1Database>(
        await dependencies.fetchDatabase(accountId, expectedId, token),
        'Existing replacement Preview D1 identity'
      ),
      'Existing replacement Preview D1 identity.result'
    )
    if (existing.name !== expectedReplacementName || existing.uuid !== expectedId)
      throw new Error('Existing replacement Preview D1 identity changed during verification.')
    const existingPlacement = placement(existing)
    if (
      existingPlacement.jurisdiction !== sourcePlacement.jurisdiction ||
      existingPlacement.region !== sourcePlacement.region
    )
      throw new Error('Existing replacement Preview D1 placement differs from its source.')
    return {
      ...baseEvidence,
      action: 'verified-existing',
      replacement: {
        jurisdiction: existingPlacement.jurisdiction,
        name: existing.name,
        region: existingPlacement.region,
        uuid: existing.uuid
      },
      verifiedAt: dependencies.now()
    }
  }
  if (configuredReplacementId)
    throw new Error('Protected replacement D1 identity was configured but is not present.')

  const created = database(
    result<D1Database>(
      await dependencies.createDatabase(accountId, token, {
        name: expectedReplacementName,
        ...sourcePlacement.create
      }),
      'Replacement Preview D1 creation'
    ),
    'Replacement Preview D1 creation.result'
  )
  if (created.name !== expectedReplacementName || created.uuid === sourceDatabaseId)
    throw new Error('Created replacement Preview D1 has an unexpected identity.')

  const after = (await dependencies.fetchDatabases(accountId, token)).map((item, index) =>
    database(item, `Post-create Cloudflare D1 list[${index}]`)
  )
  const exactCreated = after.filter(
    item => item.name === expectedReplacementName && item.uuid === created.uuid
  )
  if (
    exactCreated.length !== 1 ||
    after.filter(item => item.name === expectedReplacementName).length !== 1
  )
    throw new Error('Created replacement Preview D1 could not be proven unique.')
  const observed = database(
    result<D1Database>(
      await dependencies.fetchDatabase(accountId, created.uuid, token),
      'Created replacement Preview D1 identity'
    ),
    'Created replacement Preview D1 identity.result'
  )
  if (observed.name !== expectedReplacementName || observed.uuid !== created.uuid)
    throw new Error('Created replacement Preview D1 changed during read-back.')
  const observedPlacement = placement(observed)
  if (
    observedPlacement.jurisdiction !== sourcePlacement.jurisdiction ||
    observedPlacement.region !== sourcePlacement.region
  )
    throw new Error('Created replacement Preview D1 placement differs from its source.')
  return {
    ...baseEvidence,
    action: 'created',
    replacement: {
      jurisdiction: observedPlacement.jurisdiction,
      name: observed.name,
      region: observedPlacement.region,
      uuid: observed.uuid
    },
    verifiedAt: dependencies.now()
  }
}

function parseCli(argv: string[]): { output: string; siteId: SiteId } {
  if (argv.length !== 4 || argv[0] !== '--site' || argv[2] !== '--output')
    throw new Error(
      'Usage: d1-preview-provision.ts --site pornvideodownloaders.com --output <path>.'
    )
  return { output: resolve(nonempty(argv[3], '--output')), siteId: argv[1] as SiteId }
}

async function main() {
  const { output, siteId } = parseCli(process.argv.slice(2))
  const evidence = await provisionPvdReplacementPreview(siteId, process.env)
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain)
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
