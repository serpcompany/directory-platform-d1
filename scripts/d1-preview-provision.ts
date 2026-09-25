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

interface D1Database {
  created_at?: string
  jurisdiction?: string | null
  name?: string
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

const runbookRemediation =
  'Review docs/D1_CUTOVER.md#one-time-pvd-replacement-preview-provisioning before retrying.'

function fail(message: string, remediation = runbookRemediation): never {
  throw new Error(`${message} Remediation: ${remediation}`)
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be nonempty.`)
  return value
}

function uuid(value: unknown, label: string): string {
  const parsed = nonempty(value, label)
  if (!uuidPattern.test(parsed)) fail(`${label} must be a UUID.`)
  return parsed
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function envelopeResult(value: unknown, label: string): unknown {
  const envelope = object(value, label)
  if (envelope.success !== true) fail(`${label} was not successful.`)
  return envelope.result
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || !value.trim())
    fail(`${label} must be nonempty text when present.`)
  return value
}

function parseTokenIdentity(value: unknown): { status: 'active' } {
  const token = object(envelopeResult(value, 'Cloudflare token verification'), 'Token identity')
  if (token.status !== 'active')
    fail(
      'Cloudflare token is not active.',
      'Replace CLOUDFLARE_API_TOKEN in pornvideodownloaders-preview with an active scoped token, then retry.'
    )
  return { status: 'active' }
}

function parseAccountIdentity(value: unknown): { id: string } {
  const account = object(envelopeResult(value, 'Cloudflare account identity'), 'Account identity')
  return { id: nonempty(account.id, 'Cloudflare account identity.result.id') }
}

function parseWorkerIdentity(value: unknown): { name: string } {
  const worker = object(envelopeResult(value, 'Preview Worker identity'), 'Worker identity')
  return { name: nonempty(worker.name ?? worker.id, 'Preview Worker identity.result.name') }
}

function database(
  value: unknown,
  label: string
): Required<Pick<D1Database, 'name' | 'uuid'>> & D1Database {
  const item = object(value, label)
  return {
    created_at: optionalText(item.created_at, `${label}.created_at`),
    jurisdiction: optionalText(item.jurisdiction, `${label}.jurisdiction`),
    name: nonempty(item.name, `${label}.name`),
    uuid: uuid(item.uuid, `${label}.uuid`)
  }
}

function parseDatabaseIdentity(value: unknown, label: string) {
  return database(envelopeResult(value, label), `${label}.result`)
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
  if (!response.ok)
    fail(
      `Cloudflare request failed with HTTP ${response.status}.`,
      'Verify the protected account ID and token permissions, inspect Cloudflare status, then retry without changing the expected resource identities.'
    )
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
      )
      if (response.success !== true || !Array.isArray(response.result))
        fail('Cloudflare D1 list was not successful.')
      databases.push(...response.result)
      const resultInfo =
        response.result_info === undefined
          ? undefined
          : object(response.result_info, 'Cloudflare D1 list.result_info')
      const totalPages = resultInfo?.total_pages
      if (
        totalPages !== undefined &&
        (typeof totalPages !== 'number' || !Number.isInteger(totalPages) || totalPages < page)
      )
        fail('Cloudflare D1 list returned invalid pagination metadata.')
      if (typeof totalPages === 'number' ? page >= totalPages : response.result.length < 100)
        return databases
    }
    fail('Cloudflare D1 list exceeded the bounded page limit.')
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
    if (execution.status !== 0)
      fail(
        'Unable to verify the checked-out commit.',
        'Rerun the workflow from a clean exact main commit.'
      )
    return execution.stdout.trim()
  },
  now: () => new Date().toISOString()
}

function placement(
  source: D1Database,
  protectedPlacement: string
):
  | {
      create: { jurisdiction: Jurisdiction }
      jurisdiction: Jurisdiction
      proof: 'observed-jurisdiction'
      region: null
    }
  | {
      create: { primary_location_hint: LocationHint }
      jurisdiction: null
      proof: 'protected-source-region-create-hint'
      region: LocationHint
    } {
  if (source.jurisdiction) {
    const value = source.jurisdiction.toLowerCase()
    if (!jurisdictions.includes(value as Jurisdiction))
      fail('Source D1 has an unsupported jurisdiction.')
    if (protectedPlacement !== `jurisdiction:${value}`)
      fail(
        'Protected source placement does not match the observed D1 jurisdiction.',
        `Set CLOUDFLARE_D1_PREVIEW_PLACEMENT to jurisdiction:${value} in pornvideodownloaders-preview, then retry.`
      )
    return {
      create: { jurisdiction: value as Jurisdiction },
      jurisdiction: value as Jurisdiction,
      proof: 'observed-jurisdiction',
      region: null
    }
  }
  const match = /^region:(weur|eeur|apac|oc|wnam|enam)$/u.exec(protectedPlacement)
  if (!match)
    fail(
      'Non-jurisdiction source D1 requires a protected primary-region hint.',
      'Record the reviewed source region as CLOUDFLARE_D1_PREVIEW_PLACEMENT=region:<weur|eeur|apac|oc|wnam|enam> in pornvideodownloaders-preview.'
    )
  const value = match[1]
  if (!locationHints.includes(value as LocationHint))
    fail('Source D1 has an unsupported primary region.')
  return {
    create: { primary_location_hint: value as LocationHint },
    jurisdiction: null,
    proof: 'protected-source-region-create-hint',
    region: value as LocationHint
  }
}

function verifyObservedPlacement(
  databaseIdentity: D1Database,
  intended: ReturnType<typeof placement>
): void {
  const observedJurisdiction = databaseIdentity.jurisdiction?.toLowerCase()
  if (intended.jurisdiction) {
    if (observedJurisdiction !== intended.jurisdiction)
      fail('Replacement Preview D1 jurisdiction differs from its source.')
    return
  }
  if (observedJurisdiction)
    fail('Region-hinted replacement Preview D1 unexpectedly has a jurisdiction.')
}

function assertWorkflow(
  siteId: SiteId,
  env: NodeJS.ProcessEnv,
  dependencies: ProvisionDependencies
) {
  const target = resolveSiteTarget(siteId)
  if (siteId !== provisioningSiteId) fail('This workflow provisions only PVD Preview.')
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.CI !== 'true' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    !env.GITHUB_WORKFLOW_REF?.endsWith(provisioningWorkflow)
  )
    fail(
      'Replacement Preview provisioning requires the exact protected main workflow.',
      'Dispatch provision-pornvideodownloaders-replacement-preview.yml from refs/heads/main.'
    )
  if (env.D1_PROTECTED_ENVIRONMENT !== target.protectedEnvironment.preview)
    fail('Protected Preview environment does not match the selected Site.')
  if (env.D1_PREVIEW_PROVISION_CONFIRM !== target.replatform.previewProvisioningConfirmation)
    fail('Exact replacement Preview provisioning confirmation is required.')
  const commitSha = nonempty(env.GITHUB_SHA, 'GITHUB_SHA')
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) fail('GITHUB_SHA must be a full commit SHA.')
  if (dependencies.readGit('status')) fail('Provisioning requires a clean checkout.')
  if (dependencies.readGit('head') !== commitSha) fail('GITHUB_SHA must match checked-out HEAD.')
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
  if (accountId !== expectedAccountId) fail('Cloudflare account IDs do not match.')
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
  const protectedSourcePlacement = nonempty(
    env.CLOUDFLARE_D1_PREVIEW_PLACEMENT,
    'CLOUDFLARE_D1_PREVIEW_PLACEMENT'
  )
  const expectedReplacementName = target.replatform.previewDatabaseName
  if (sourceDatabaseName === expectedReplacementName)
    fail('Source and replacement Preview D1 names must be distinct.')

  const configuredReplacementId = env.CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_ID?.trim() ?? ''
  const configuredReplacementName =
    env.CLOUDFLARE_D1_REPLACEMENT_PREVIEW_DATABASE_NAME?.trim() ?? ''
  if (Boolean(configuredReplacementId) !== Boolean(configuredReplacementName))
    fail('Protected replacement D1 ID and name must be both absent or both present.')
  if (configuredReplacementName && configuredReplacementName !== expectedReplacementName)
    fail('Protected replacement D1 name does not match the Site registry.')
  if (
    configuredReplacementId &&
    uuid(configuredReplacementId, 'Protected replacement D1 ID') === sourceDatabaseId
  )
    fail('Source and replacement Preview D1 IDs must be distinct.')

  parseTokenIdentity(await dependencies.fetchToken(token))
  const account = parseAccountIdentity(await dependencies.fetchAccount(accountId, token))
  if (account.id !== expectedAccountId)
    fail('Observed Cloudflare account does not match the protected account.')

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
    fail(
      'Source Preview D1 identity is missing or ambiguous.',
      'Compare CLOUDFLARE_D1_PREVIEW_DATABASE_ID and CLOUDFLARE_D1_PREVIEW_DATABASE_NAME with the Cloudflare D1 dashboard, then update the protected environment as one exact pair.'
    )
  const source = parseDatabaseIdentity(
    await dependencies.fetchDatabase(accountId, sourceDatabaseId, token),
    'Source Preview D1 identity'
  )
  if (source.uuid !== sourceDatabaseId || source.name !== sourceDatabaseName)
    fail('Observed source Preview D1 does not match protected identity.')
  const sourcePlacement = placement(source, protectedSourcePlacement)

  const worker = parseWorkerIdentity(await dependencies.fetchWorker(accountId, workerName, token))
  if (worker.name !== workerName) fail('Observed Preview Worker does not match protected identity.')

  const sameName = listed.filter(item => item.name === expectedReplacementName)
  if (sameName.length > 1) fail('Replacement Preview D1 name is ambiguous.')
  if (sameName[0]?.uuid === sourceDatabaseId)
    fail('Source and replacement Preview D1 identities alias.')

  const baseEvidence = {
    accountId: expectedAccountId,
    commitSha,
    environment: 'preview',
    protectedEnvironment: target.protectedEnvironment.preview,
    siteId,
    source: {
      jurisdiction: sourcePlacement.jurisdiction,
      name: sourceDatabaseName,
      placementProof: sourcePlacement.proof,
      region: sourcePlacement.region,
      uuid: sourceDatabaseId
    },
    verifiedWorkerName: workerName,
    workflow: 'provision-pornvideodownloaders-replacement-preview'
  }

  if (sameName.length === 1) {
    if (!configuredReplacementId)
      fail(
        'Expected replacement D1 already exists; configure its exact protected ID and name before rerunning.'
      )
    const expectedId = uuid(configuredReplacementId, 'Protected replacement D1 ID')
    if (sameName[0]?.uuid !== expectedId)
      fail('Existing replacement D1 does not match protected expected identity.')
    const existing = parseDatabaseIdentity(
      await dependencies.fetchDatabase(accountId, expectedId, token),
      'Existing replacement Preview D1 identity'
    )
    if (existing.name !== expectedReplacementName || existing.uuid !== expectedId)
      fail('Existing replacement Preview D1 identity changed during verification.')
    verifyObservedPlacement(existing, sourcePlacement)
    return {
      ...baseEvidence,
      action: 'verified-existing',
      replacement: {
        jurisdiction: sourcePlacement.jurisdiction,
        name: existing.name,
        placementProof: sourcePlacement.proof,
        region: sourcePlacement.region,
        uuid: existing.uuid
      },
      verifiedAt: dependencies.now()
    }
  }
  if (configuredReplacementId)
    fail('Protected replacement D1 identity was configured but is not present.')

  const created = parseDatabaseIdentity(
    await dependencies.createDatabase(accountId, token, {
      name: expectedReplacementName,
      ...sourcePlacement.create
    }),
    'Replacement Preview D1 creation'
  )
  if (created.name !== expectedReplacementName || created.uuid === sourceDatabaseId)
    fail('Created replacement Preview D1 has an unexpected identity.')

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
    fail(
      'Created replacement Preview D1 could not be proven unique.',
      'Do not rerun creation. Inspect the Cloudflare D1 list, then store the sole intended UUID and exact registry name as the protected replacement pair before a read-only rerun.'
    )
  const observed = parseDatabaseIdentity(
    await dependencies.fetchDatabase(accountId, created.uuid, token),
    'Created replacement Preview D1 identity'
  )
  if (observed.name !== expectedReplacementName || observed.uuid !== created.uuid)
    fail('Created replacement Preview D1 changed during read-back.')
  verifyObservedPlacement(observed, sourcePlacement)
  return {
    ...baseEvidence,
    action: 'created',
    replacement: {
      jurisdiction: sourcePlacement.jurisdiction,
      name: observed.name,
      placementProof: sourcePlacement.proof,
      region: sourcePlacement.region,
      uuid: observed.uuid
    },
    verifiedAt: dependencies.now()
  }
}

function parseCli(argv: string[]): { output: string; siteId: SiteId } {
  if (argv.length !== 4 || argv[0] !== '--site' || argv[2] !== '--output')
    fail('Usage: d1-preview-provision.ts --site pornvideodownloaders.com --output <path>.')
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
