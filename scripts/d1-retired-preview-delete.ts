import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseCloudflareHttpFailure, verifyCredentialIdentity } from './d1-database-provision'
import { parseSiteId, type SiteId } from './site-targets'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const workflowName = 'delete-retired-preview-d1'

export const retiredPreviewTargets = {
  'pornvideodownloaders.com': {
    active: {
      databaseId: '16ede356-3caa-4cea-93f3-69f5b208b1d7',
      databaseName: 'pornvideodownloaders-replatform-preview',
      workerName: 'pornvideodownloaders-preview'
    },
    confirmation: 'delete-retired-pornvideodownloaders.com-preview-d1',
    protectedEnvironment: 'pornvideodownloaders-preview',
    retired: {
      databaseId: 'f92694b0-af7d-4c13-91f2-ee0393af9bdd',
      databaseName: 'pornvideo-downloaders-preview'
    }
  },
  'serp.software': {
    active: {
      databaseId: '29c0a6ed-e824-459c-b088-6098fdbf1abf',
      databaseName: 'serp-software-replatform-preview',
      workerName: 'serp-software-replatform-preview'
    },
    confirmation: 'delete-retired-serp.software-preview-d1',
    protectedEnvironment: 'serp-software-preview',
    retired: {
      databaseId: '5e96a9f0-e11a-4c60-8dd3-02299c032466',
      databaseName: 'serp-software-replatform-source-preview'
    }
  }
} as const satisfies Record<
  SiteId,
  {
    active: { databaseId: string; databaseName: string; workerName: string }
    confirmation: string
    protectedEnvironment: string
    retired: { databaseId: string; databaseName: string }
  }
>

export interface D1Identity {
  name: string
  uuid: string
}

export function wranglerExportPlan(databaseIdentity: D1Identity, output: string) {
  const configPath = `${output}.wrangler.json`
  return {
    args: [
      'exec',
      'wrangler',
      'd1',
      'export',
      databaseIdentity.name,
      '--config',
      configPath,
      '--remote',
      '--skip-confirmation',
      '--output',
      output
    ],
    config: {
      compatibility_date: '2026-09-25',
      d1_databases: [
        {
          binding: 'DB',
          database_id: databaseIdentity.uuid,
          database_name: databaseIdentity.name
        }
      ],
      name: 'retired-preview-d1-export'
    },
    configPath
  }
}

export interface RetiredPreviewDeleteDependencies {
  deleteDatabase(accountId: string, databaseId: string, token: string): Promise<unknown>
  exportDatabase(database: D1Identity, output: string, env: NodeJS.ProcessEnv): void
  fetchAccount(accountId: string, token: string): Promise<unknown>
  fetchDatabase(accountId: string, databaseId: string, token: string): Promise<unknown>
  fetchDatabases(accountId: string, token: string): Promise<unknown[]>
  fetchDeployments(accountId: string, workerName: string, token: string): Promise<unknown>
  fetchToken(token: string): Promise<unknown>
  fetchUser(token: string): Promise<unknown>
  fetchWorkerVersion(
    accountId: string,
    workerName: string,
    versionId: string,
    token: string
  ): Promise<unknown>
  fetchWorkers(accountId: string, token: string): Promise<unknown[]>
  now(): string
  readGit(command: 'head' | 'status'): string
}

function fail(message: string): never {
  throw new Error(
    `${message} Remediation: Review docs/D1_CUTOVER.md and retry the protected workflow without changing resource identities.`
  )
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be nonempty text.`)
  return value
}

function uuid(value: unknown, label: string): string {
  const parsed = text(value, label)
  if (!uuidPattern.test(parsed)) fail(`${label} must be a UUID.`)
  return parsed
}

function result(value: unknown, label: string): unknown {
  const envelope = object(value, label)
  if (envelope.success !== true) fail(`${label} was not successful.`)
  return envelope.result
}

function database(value: unknown, label: string): D1Identity {
  const item = object(value, label)
  return { name: text(item.name, `${label}.name`), uuid: uuid(item.uuid, `${label}.uuid`) }
}

function databaseResult(value: unknown, label: string): D1Identity {
  return database(result(value, label), `${label}.result`)
}

async function cloudflareRequest(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000)
  })
  const body = await response.json()
  if (!response.ok) throw parseCloudflareHttpFailure(response.status, body)
  return body
}

export const defaultRetiredPreviewDeleteDependencies: RetiredPreviewDeleteDependencies = {
  deleteDatabase(accountId, databaseId, token) {
    return cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}`,
      token,
      { method: 'DELETE' }
    )
  },
  exportDatabase(databaseIdentity, output, env) {
    const plan = wranglerExportPlan(databaseIdentity, output)
    writeFileSync(plan.configPath, `${JSON.stringify(plan.config)}\n`, { mode: 0o600 })
    try {
      const execution = spawnSync('pnpm', plan.args, {
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'inherit', 'inherit']
      })
      if (execution.status !== 0) fail('Wrangler did not complete the pre-delete SQL export.')
    } finally {
      if (existsSync(plan.configPath)) unlinkSync(plan.configPath)
    }
  },
  fetchAccount: (accountId, token) =>
    cloudflareRequest(`/accounts/${encodeURIComponent(accountId)}`, token),
  fetchDatabase: (accountId, databaseId, token) =>
    cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}`,
      token
    ),
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
        fail('Cloudflare D1 list was malformed.')
      databases.push(...response.result)
      const info = object(response.result_info, 'Cloudflare D1 list.result_info')
      const totalCount = info.total_count
      const responsePage = info.page
      const perPage = info.per_page
      if (
        typeof totalCount !== 'number' ||
        !Number.isInteger(totalCount) ||
        totalCount < 0 ||
        responsePage !== page ||
        typeof perPage !== 'number' ||
        !Number.isInteger(perPage) ||
        perPage < 1 ||
        perPage > 100
      )
        fail('Cloudflare D1 list returned invalid or unbounded pagination metadata.')
      if (databases.length >= totalCount) return databases
    }
    fail('Cloudflare D1 list exceeded the bounded page limit.')
  },
  fetchDeployments: (accountId, workerName, token) =>
    cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/deployments`,
      token
    ),
  fetchToken: token => cloudflareRequest('/user/tokens/verify', token),
  fetchUser: token => cloudflareRequest('/user', token),
  fetchWorkerVersion: (accountId, workerName, versionId, token) =>
    cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/versions/${encodeURIComponent(versionId)}`,
      token
    ),
  async fetchWorkers(accountId, token) {
    const response = object(
      await cloudflareRequest(`/accounts/${encodeURIComponent(accountId)}/workers/scripts`, token),
      'Cloudflare Worker list'
    )
    if (response.success !== true || !Array.isArray(response.result))
      fail('Cloudflare Worker list was malformed.')
    if (response.result.length > 1_000)
      fail('Cloudflare Worker list exceeded the bounded inventory size.')
    return response.result
  },
  now: () => new Date().toISOString(),
  readGit(command) {
    const execution = spawnSync(
      'git',
      command === 'head' ? ['rev-parse', 'HEAD'] : ['status', '--porcelain'],
      {
        encoding: 'utf8'
      }
    )
    if (execution.status !== 0) fail('Unable to verify the checked-out commit.')
    return execution.stdout.trim()
  }
}

function assertWorkflow(
  siteId: SiteId,
  env: NodeJS.ProcessEnv,
  deps: RetiredPreviewDeleteDependencies
) {
  const target = retiredPreviewTargets[siteId]
  if (
    env.CI !== 'true' ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    !env.GITHUB_WORKFLOW_REF?.endsWith(`/.github/workflows/${workflowName}.yml@refs/heads/main`)
  )
    fail('Retired Preview deletion requires the exact main-only protected workflow.')
  if (env.D1_PROTECTED_ENVIRONMENT !== target.protectedEnvironment)
    fail('Protected Preview environment does not match the selected Site.')
  if (env.D1_RETIRED_PREVIEW_DELETE_CONFIRM !== target.confirmation)
    fail('Exact retired Preview D1 deletion confirmation is required.')
  const commitSha = text(env.GITHUB_SHA, 'GITHUB_SHA')
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) fail('GITHUB_SHA must be a full commit SHA.')
  if (deps.readGit('status')) fail('Retired Preview deletion requires a clean checkout.')
  if (deps.readGit('head') !== commitSha) fail('GITHUB_SHA must match checked-out HEAD.')
  return { commitSha, target }
}

function assertExactDatabaseInventory(inventory: unknown[], expected: D1Identity, label: string) {
  const parsed = inventory.map((item, index) => database(item, `D1 inventory[${index}]`))
  const byId = parsed.filter(item => item.uuid === expected.uuid)
  const byName = parsed.filter(item => item.name === expected.name)
  if (
    byId.length !== 1 ||
    byName.length !== 1 ||
    byId[0]?.name !== expected.name ||
    byName[0]?.uuid !== expected.uuid
  )
    fail(`${label} D1 identity is missing, ambiguous, or mismatched.`)
}

async function activeVersionBinding(
  accountId: string,
  workerName: string,
  token: string,
  deps: RetiredPreviewDeleteDependencies
) {
  const deployments = object(
    result(await deps.fetchDeployments(accountId, workerName, token), `${workerName} deployments`),
    `${workerName} deployments.result`
  )
  if (!Array.isArray(deployments.deployments) || deployments.deployments.length < 1)
    fail(`${workerName} has no active deployment.`)
  const active = object(deployments.deployments[0], `${workerName} active deployment`)
  if (!Array.isArray(active.versions) || active.versions.length !== 1)
    fail(`${workerName} active deployment is missing or split.`)
  const traffic = object(active.versions[0], `${workerName} active version`)
  if (traffic.percentage !== 100)
    fail(`${workerName} active deployment is not solely at 100 percent.`)
  const versionId = text(traffic.version_id, `${workerName} active version ID`)
  const version = object(
    result(
      await deps.fetchWorkerVersion(accountId, workerName, versionId, token),
      `${workerName} version`
    ),
    `${workerName} version.result`
  )
  const resources = object(version.resources, `${workerName} version resources`)
  if (!Array.isArray(resources.bindings)) fail(`${workerName} active bindings are missing.`)
  const databaseIds = resources.bindings
    .map((binding, index) => object(binding, `${workerName} binding[${index}]`))
    .filter(binding => binding.type === 'd1')
    .map(binding => uuid(binding.database_id ?? binding.id, `${workerName} D1 binding ID`))
  return { databaseIds, versionId }
}

async function workerInventoryProof(
  accountId: string,
  token: string,
  retiredDatabaseId: string,
  deps: RetiredPreviewDeleteDependencies
) {
  const workers = (await deps.fetchWorkers(accountId, token)).map((value, index) => {
    const worker = object(value, `Worker inventory[${index}]`)
    return text(worker.id ?? worker.name, `Worker inventory[${index}].id`)
  })
  if (new Set(workers).size !== workers.length)
    fail('Cloudflare Worker inventory contains duplicate names.')
  const bindings: Array<{ databaseIds: string[]; versionId: string; workerName: string }> = []
  for (const workerName of workers) {
    const active = await activeVersionBinding(accountId, workerName, token, deps)
    bindings.push({ ...active, workerName })
  }
  const offenders = bindings.filter(item => item.databaseIds.includes(retiredDatabaseId))
  if (offenders.length)
    fail(`Retired Preview D1 remains bound to active Worker ${offenders[0]?.workerName}.`)
  return bindings
}

async function inspect(
  siteId: SiteId,
  env: NodeJS.ProcessEnv,
  deps: RetiredPreviewDeleteDependencies
) {
  const { commitSha, target } = assertWorkflow(siteId, env, deps)
  const accountId = text(env.CLOUDFLARE_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID')
  if (accountId !== text(env.CLOUDFLARE_EXPECTED_ACCOUNT_ID, 'CLOUDFLARE_EXPECTED_ACCOUNT_ID'))
    fail('Cloudflare account IDs do not match.')
  const token = text(env.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN')
  const credentialIdentity = await verifyCredentialIdentity(token, deps)
  const account = object(
    result(await deps.fetchAccount(accountId, token), 'Cloudflare account'),
    'Account identity'
  )
  if (account.id !== accountId) fail('Observed Cloudflare account identity differs.')
  const inventory = await deps.fetchDatabases(accountId, token)
  assertExactDatabaseInventory(
    inventory,
    { name: target.retired.databaseName, uuid: target.retired.databaseId },
    'Retired Preview'
  )
  assertExactDatabaseInventory(
    inventory,
    { name: target.active.databaseName, uuid: target.active.databaseId },
    'Active replacement Preview'
  )
  const retired = databaseResult(
    await deps.fetchDatabase(accountId, target.retired.databaseId, token),
    'Retired Preview D1'
  )
  const active = databaseResult(
    await deps.fetchDatabase(accountId, target.active.databaseId, token),
    'Active replacement Preview D1'
  )
  assertExactDatabaseInventory(
    [retired],
    { name: target.retired.databaseName, uuid: target.retired.databaseId },
    'Retired Preview'
  )
  assertExactDatabaseInventory(
    [active],
    { name: target.active.databaseName, uuid: target.active.databaseId },
    'Active replacement Preview'
  )
  const workers = await workerInventoryProof(accountId, token, target.retired.databaseId, deps)
  const selected = workers.filter(item => item.workerName === target.active.workerName)
  if (
    selected.length !== 1 ||
    selected[0]?.databaseIds.length !== 1 ||
    selected[0]?.databaseIds[0] !== target.active.databaseId
  )
    fail('Selected active Preview Worker is not bound solely to the exact replacement D1.')
  return {
    accountId,
    active,
    commitSha,
    credentialIdentity,
    retired,
    selectedWorker: selected[0],
    siteId,
    target,
    token,
    workerCount: workers.length
  }
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export async function preflightRetiredPreviewDeletion(
  siteId: SiteId,
  output: string,
  sqlExport: string,
  env: NodeJS.ProcessEnv,
  deps: RetiredPreviewDeleteDependencies = defaultRetiredPreviewDeleteDependencies
) {
  const proof = await inspect(siteId, env, deps)
  deps.exportDatabase(proof.retired, sqlExport, env)
  if (!existsSync(sqlExport) || statSync(sqlExport).size === 0)
    fail('Pre-delete SQL export is missing or empty.')
  const receipt = {
    action: 'preflight-complete',
    accountId: proof.accountId,
    active: proof.active,
    commitSha: proof.commitSha,
    credentialIdentity: proof.credentialIdentity,
    export: { bytes: statSync(sqlExport).size, sha256: sha256(sqlExport) },
    observedAt: deps.now(),
    retired: proof.retired,
    selectedWorker: proof.selectedWorker,
    siteId,
    workerCount: proof.workerCount
  }
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
  return receipt
}

export async function deleteRetiredPreviewDatabase(
  siteId: SiteId,
  preflightReceiptPath: string,
  sqlExport: string,
  output: string,
  env: NodeJS.ProcessEnv,
  deps: RetiredPreviewDeleteDependencies = defaultRetiredPreviewDeleteDependencies
) {
  const before = await inspect(siteId, env, deps)
  const receipt = object(
    JSON.parse(readFileSync(preflightReceiptPath, 'utf8')),
    'Preflight receipt'
  )
  const exportProof = object(receipt.export, 'Preflight receipt export')
  if (
    receipt.action !== 'preflight-complete' ||
    receipt.siteId !== siteId ||
    receipt.commitSha !== before.commitSha ||
    object(receipt.retired, 'Preflight retired D1').uuid !== before.retired.uuid ||
    !existsSync(sqlExport) ||
    statSync(sqlExport).size === 0 ||
    exportProof.sha256 !== sha256(sqlExport)
  )
    fail('Preflight receipt or retained SQL export does not match this exact deletion.')
  const attemptReceipt = {
    action: 'delete-attempt',
    accountId: before.accountId,
    active: before.active,
    commitSha: before.commitSha,
    credentialIdentity: before.credentialIdentity,
    observedAt: deps.now(),
    retired: before.retired,
    selectedWorker: before.selectedWorker,
    siteId,
    sqlExportSha256: exportProof.sha256
  }
  writeFileSync(output, `${JSON.stringify(attemptReceipt, null, 2)}\n`, { mode: 0o600 })
  result(
    await deps.deleteDatabase(before.accountId, before.retired.uuid, before.token),
    'Cloudflare D1 deletion'
  )
  const acceptedReceipt = {
    ...attemptReceipt,
    action: 'delete-request-accepted',
    observedAt: deps.now()
  }
  writeFileSync(output, `${JSON.stringify(acceptedReceipt, null, 2)}\n`, { mode: 0o600 })
  try {
    const inventory = await deps.fetchDatabases(before.accountId, before.token)
    const parsed = inventory.map((item, index) =>
      database(item, `Post-delete D1 inventory[${index}]`)
    )
    if (parsed.some(item => item.uuid === before.retired.uuid || item.name === before.retired.name))
      fail('Retired Preview D1 is still present after deletion.')
    assertExactDatabaseInventory(parsed, before.active, 'Active replacement Preview')
    const active = databaseResult(
      await deps.fetchDatabase(before.accountId, before.active.uuid, before.token),
      'Post-delete active replacement Preview D1'
    )
    assertExactDatabaseInventory([active], before.active, 'Active replacement Preview')
    const workers = await workerInventoryProof(
      before.accountId,
      before.token,
      before.retired.uuid,
      deps
    )
    const selected = workers.filter(item => item.workerName === before.target.active.workerName)
    if (
      selected.length !== 1 ||
      selected[0]?.databaseIds.length !== 1 ||
      selected[0]?.databaseIds[0] !== before.active.uuid
    )
      fail('Active Preview Worker binding changed during deletion.')
    const finalReceipt = {
      ...acceptedReceipt,
      action: 'deleted',
      active,
      deleted: before.retired,
      observedAt: deps.now(),
      selectedWorker: selected[0]
    }
    writeFileSync(output, `${JSON.stringify(finalReceipt, null, 2)}\n`, { mode: 0o600 })
    return finalReceipt
  } catch (error) {
    const failedReceipt = {
      ...acceptedReceipt,
      action: 'post-delete-verification-error',
      observedAt: deps.now(),
      verification: 'incomplete; inspect the protected workflow log and Cloudflare inventory'
    }
    writeFileSync(output, `${JSON.stringify(failedReceipt, null, 2)}\n`, { mode: 0o600 })
    throw error
  }
}

function parseCli(argv: string[]) {
  if (
    argv.length !== 9 ||
    !['preflight', 'delete'].includes(argv[0] ?? '') ||
    argv[1] !== '--site' ||
    argv[3] !== '--receipt' ||
    argv[5] !== '--export' ||
    argv[7] !== '--output'
  )
    fail(
      'Usage: d1-retired-preview-delete.ts <preflight|delete> --site <site-id> --receipt <path> --export <path> --output <path>.'
    )
  return {
    command: argv[0] as 'preflight' | 'delete',
    exportPath: resolve(text(argv[6], '--export')),
    output: resolve(text(argv[8], '--output')),
    receipt: resolve(text(argv[4], '--receipt')),
    siteId: parseSiteId(argv[2])
  }
}

async function main() {
  const cli = parseCli(process.argv.slice(2))
  if (cli.command === 'preflight')
    await preflightRetiredPreviewDeletion(cli.siteId, cli.output, cli.exportPath, process.env)
  else
    await deleteRetiredPreviewDatabase(
      cli.siteId,
      cli.receipt,
      cli.exportPath,
      cli.output,
      process.env
    )
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain)
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
