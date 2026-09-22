import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import {
  applicationTableNames,
  d1TriggerNames,
  freshMigrationNames,
  materializeFreshLocalConfig,
  requiredIndexNames
} from './d1-drizzle-local'
import { resolveSiteTarget } from './site-targets'

const temporaryDirectories: string[] = []

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { force: true, recursive: true })
})

function runLocal(command: string, siteId: string, stateDirectory: string): string {
  return execFileSync('pnpm', ['tsx', 'scripts/d1-drizzle-local.ts', command, '--site', siteId], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HARNESS_D1_STATE_DIRECTORY: stateDirectory,
      WRANGLER_SEND_METRICS: 'false'
    }
  })
}

const legacyMigrationHashes = {
  '0001_public_catalog.sql': '041c03c75b7f20d74e64ea7bcfa86fc6518b6bc2d06213f00ad9bef0fe824c6a',
  '0002_listing_slug_redirects.sql':
    '7f99476cbf5064294a3fc485824b024fe4baf04cfb13242d53464a039ec63604',
  '0003_publication_run_provenance.sql':
    'c779ae13f3c444720dc9286c37e706b42a32753ef01f1253ed81aa27c2163e48',
  '0004_listing_display_order.sql':
    'ed32d025f2f89a5fd7791edd1b4aa63f403696d2628f0a6e31130873e1d95a64',
  '0005_listing_submissions.sql':
    'c81f10ef8a4cf306edc5b6045804910b5862750d81c4bf218901a192c734f767',
  '0006_submission_rate_limits.sql':
    '4e2342df1e8522ea5e782cae8ba0362bdb434a675151f2a652591fcb37592130',
  '0007_submission_notifications.sql':
    '2f7962566c298c5ef50bd6e34cc1546c2a21dfe70a8a76d831cbabec09282fc7',
  '0008_submission_review_preview.sql':
    '75f4a902a18104a396287ed132c2248cf9149816d5d3c0585b94c725071df09c',
  '0009_related_listing_name_index.sql':
    'cf188292330ed97c1879bb9ad54c4a1556b6f16f39fd505486dcf3f1a2772117'
} as const

describe('fresh Drizzle D1 history', () => {
  it('keeps the released legacy migration lineage byte-for-byte immutable', () => {
    for (const [name, expectedHash] of Object.entries(legacyMigrationHashes)) {
      const actualHash = createHash('sha256')
        .update(readFileSync(resolve('d1/migrations', name)))
        .digest('hex')
      expect(actualHash, name).toBe(expectedHash)
    }
  })

  it('uses a credential-free generator and a separate canonical Wrangler history', () => {
    const config = readFileSync(resolve('drizzle.config.ts'), 'utf8')
    expect(config).toContain("out: './d1/drizzle'")
    expect(config).toContain("schema: './packages/data-ops/src/schema.ts'")
    expect(config).not.toMatch(/accountId|databaseId|token|process\.env/u)
    expect(freshMigrationNames()).toEqual(['0000_remarkable_manta.sql'])

    const migration = readFileSync(resolve('d1/drizzle/0000_remarkable_manta.sql'), 'utf8')
    expect(migration.match(/^CREATE TABLE/gmu)).toHaveLength(applicationTableNames.length)
    expect(migration.match(/^\) STRICT;/gmu)).toHaveLength(applicationTableNames.length)
    for (const trigger of d1TriggerNames) expect(migration).toContain(`CREATE TRIGGER ${trigger}`)
    for (const index of requiredIndexNames) expect(migration).toContain(`\`${index}\``)
    expect(migration).toContain('COLLATE NOCASE')
  })

  it('models every legacy application table, column, and foreign key in the fresh schema', () => {
    const legacy = new DatabaseSync(':memory:')
    const fresh = new DatabaseSync(':memory:')
    legacy.exec('PRAGMA foreign_keys = ON')
    fresh.exec('PRAGMA foreign_keys = ON')
    for (const name of Object.keys(legacyMigrationHashes)) {
      legacy.exec(readFileSync(resolve('d1/migrations', name), 'utf8'))
    }
    fresh.exec(readFileSync(resolve('d1/drizzle/0000_remarkable_manta.sql'), 'utf8'))

    const tableNames = (database: DatabaseSync) =>
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all()
        .map(row => String(row.name))
    expect(tableNames(fresh)).toEqual(tableNames(legacy))

    for (const table of applicationTableNames) {
      const columns = (database: DatabaseSync) =>
        database
          .prepare(`PRAGMA table_info('${table}')`)
          .all()
          .map(row => ({
            name: row.name,
            notNull: row.pk ? 1 : row.notnull,
            primaryKey: row.pk,
            type: row.type
          }))
      const foreignKeys = (database: DatabaseSync) =>
        database
          .prepare(`PRAGMA foreign_key_list('${table}')`)
          .all()
          .map(row => ({
            from: row.from,
            onDelete: row.on_delete,
            table: row.table,
            to: row.to
          }))
          .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      expect(columns(fresh), `${table} columns`).toEqual(columns(legacy))
      expect(foreignKeys(fresh), `${table} foreign keys`).toEqual(foreignKeys(legacy))
    }

    legacy.close()
    fresh.close()
  })

  it.each(['serp.software', 'pornvideodownloaders.com'] as const)(
    'applies %s from empty state and reports no pending migration on the second apply',
    siteId => {
      const stateDirectory = mkdtempSync(join(tmpdir(), `directory-platform-drizzle-${siteId}-`))
      temporaryDirectories.push(stateDirectory)

      const firstApply = runLocal('apply', siteId, stateDirectory)
      expect(firstApply).toContain('0000_remarkable_manta.sql')
      expect(runLocal('verify', siteId, stateDirectory)).toContain('"status":"verified"')
      expect(runLocal('list', siteId, stateDirectory)).toContain('No migrations to apply')

      const secondApply = runLocal('apply', siteId, stateDirectory)
      expect(secondApply).toContain('No migrations to apply')
      expect(runLocal('verify', siteId, stateDirectory)).toContain('"status":"verified"')
    },
    120_000
  )

  it('materializes isolated site-explicit local identities only', () => {
    const serp = materializeFreshLocalConfig(resolveSiteTarget('serp.software'))
    const pvd = materializeFreshLocalConfig(resolveSiteTarget('pornvideodownloaders.com'))
    const serpConfig = readFileSync(serp.configPath, 'utf8')
    const pvdConfig = readFileSync(pvd.configPath, 'utf8')

    expect(serp.databaseName).not.toBe(pvd.databaseName)
    expect(serpConfig).toContain('serp.software')
    expect(pvdConfig).toContain('pornvideodownloaders.com')
    expect(serpConfig).toContain('../../d1/drizzle')
    expect(pvdConfig).toContain('../../d1/drizzle')
    expect(`${serpConfig}\n${pvdConfig}`).not.toMatch(/preview|production|CLOUDFLARE_/u)
  })
})
