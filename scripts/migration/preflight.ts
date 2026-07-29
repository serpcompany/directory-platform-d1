import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface LegacyCategory {
  description?: unknown
  name?: unknown
  slug?: unknown
}

interface LegacyProductRecord {
  content?: { body?: unknown; faq?: unknown }
  featured?: unknown
  media?: { images?: unknown; logo?: unknown; video?: unknown }
  product?: {
    categories?: unknown
    productPage?: unknown
    slug?: unknown
    tagline?: unknown
    title?: unknown
  }
  relatedLinks?: unknown
}

export interface MigrationPreflightReport {
  categoryCount: number
  checksums: Record<string, string>
  generatedAt: string
  issues: string[]
  listingCount: number
  readyForMapping: boolean
  siteId: string
  sourceRoot: string
  sourceSiteDirectory: string
  supportingFiles: Record<string, boolean>
  warnings: string[]
}

const SITE_ID_PATTERN = /^[a-z0-9][a-z0-9.-]+$/u
const SLUG_PATTERN = /^[a-z0-9][a-z0-9.-]*$/u

function checksum(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function parseJson(path: string, label: string, issues: string[]): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    issues.push(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function validateCategories(
  source: unknown,
  issues: string[],
  warnings: string[]
): { count: number; slugs: Set<string> } {
  if (!Array.isArray(source)) {
    issues.push('Category source must be an array.')
    return { count: 0, slugs: new Set() }
  }
  const slugs = new Set<string>()
  source.forEach((raw, index) => {
    const category = raw as LegacyCategory
    if (!isRecord(raw)) {
      issues.push(`Category ${index} must be an object.`)
      return
    }
    if (typeof category.slug !== 'string' || !SLUG_PATTERN.test(category.slug)) {
      issues.push(`Category ${index} has an invalid slug.`)
      return
    }
    if (slugs.has(category.slug)) issues.push(`Duplicate category slug: ${category.slug}`)
    slugs.add(category.slug)
    if (typeof category.name !== 'string' || category.name.trim() === '') {
      issues.push(`Category ${category.slug} has no name.`)
    }
    if (typeof category.description !== 'string' || category.description.trim() === '') {
      warnings.push(`Category ${category.slug} has no description.`)
    }
  })
  return { count: source.length, slugs }
}

function validateProducts(
  source: unknown,
  categorySlugs: Set<string>,
  issues: string[],
  warnings: string[]
): number {
  if (!isRecord(source)) {
    issues.push('Product source must be an object keyed by slug.')
    return 0
  }
  for (const [key, raw] of Object.entries(source)) {
    if (!SLUG_PATTERN.test(key)) issues.push(`Product map key is not a valid slug: ${key}`)
    if (!isRecord(raw)) {
      issues.push(`Product ${key} must be an object.`)
      continue
    }
    const record = raw as LegacyProductRecord
    if (!isRecord(record.product)) {
      issues.push(`Product ${key} has no product metadata object.`)
      continue
    }
    if (record.product.slug !== key) {
      issues.push(`Product ${key} declares mismatched slug ${String(record.product.slug)}.`)
    }
    if (typeof record.product.title !== 'string' || record.product.title.trim() === '') {
      issues.push(`Product ${key} has no title.`)
    }
    if (typeof record.product.tagline !== 'string' || record.product.tagline.trim() === '') {
      issues.push(`Product ${key} has no tagline.`)
    }
    if (!isHttpUrl(record.product.productPage)) {
      issues.push(`Product ${key} has an invalid productPage URL.`)
    }
    if (
      !Array.isArray(record.product.categories) ||
      record.product.categories.length === 0 ||
      record.product.categories.some(category => typeof category !== 'string')
    ) {
      issues.push(`Product ${key} must declare at least one category.`)
    } else {
      const memberships = record.product.categories as string[]
      if (new Set(memberships).size !== memberships.length) {
        issues.push(`Product ${key} repeats a category membership.`)
      }
      for (const category of memberships) {
        if (!categorySlugs.has(category)) {
          issues.push(`Product ${key} references missing category ${category}.`)
        }
      }
    }
    if (!isRecord(record.content) || typeof record.content.body !== 'string') {
      warnings.push(`Product ${key} has no long-form body.`)
    }
    if (record.relatedLinks !== undefined && !Array.isArray(record.relatedLinks)) {
      issues.push(`Product ${key} relatedLinks must be an array.`)
    }
    if (record.media?.images !== undefined && !Array.isArray(record.media.images)) {
      issues.push(`Product ${key} media.images must be an array.`)
    }
  }
  return Object.keys(source).length
}

export function inspectLegacySite(
  sourceRootInput: string,
  siteId: string,
  generatedAt = new Date().toISOString()
): MigrationPreflightReport {
  if (!SITE_ID_PATTERN.test(siteId)) throw new Error(`Invalid site ID: ${siteId}`)
  const sourceRoot = realpathSync(resolve(sourceRootInput))
  const sourceSiteDirectory = resolve(sourceRoot, 'sites', siteId)
  const currentRoot = realpathSync(resolve('.'))
  if (sourceSiteDirectory.startsWith(`${currentRoot}/`)) {
    throw new Error('Migration source must be external to this D1 repository.')
  }

  const productPath = resolve(sourceSiteDirectory, 'products.json')
  const categoryPath = resolve(sourceSiteDirectory, 'categories.json')
  const issues: string[] = []
  const warnings: string[] = []
  if (!existsSync(productPath)) issues.push(`Missing source file: ${productPath}`)
  if (!existsSync(categoryPath)) issues.push(`Missing source file: ${categoryPath}`)

  const supportingFiles = {
    assets: existsSync(resolve(sourceSiteDirectory, 'assets')),
    readme: existsSync(resolve(sourceSiteDirectory, 'README.md')),
    siteConfig: existsSync(resolve(sourceSiteDirectory, 'site-config.ts')),
    siteContent: existsSync(resolve(sourceSiteDirectory, 'site-content.ts'))
  }
  for (const [name, present] of Object.entries(supportingFiles)) {
    if (!present) warnings.push(`Supporting source ${name} is absent.`)
  }

  let categoryCount = 0
  let listingCount = 0
  const checksums: Record<string, string> = {}
  if (existsSync(categoryPath)) {
    checksums.categories = checksum(categoryPath)
    const validated = validateCategories(
      parseJson(categoryPath, 'Category source', issues),
      issues,
      warnings
    )
    categoryCount = validated.count
    if (existsSync(productPath)) {
      checksums.products = checksum(productPath)
      listingCount = validateProducts(
        parseJson(productPath, 'Product source', issues),
        validated.slugs,
        issues,
        warnings
      )
    }
  }
  for (const [name, relativePath] of [
    ['siteConfig', 'site-config.ts'],
    ['siteContent', 'site-content.ts']
  ] as const) {
    const path = resolve(sourceSiteDirectory, relativePath)
    if (existsSync(path)) checksums[name] = checksum(path)
  }

  return {
    categoryCount,
    checksums,
    generatedAt,
    issues: [...new Set(issues)].sort(),
    listingCount,
    readyForMapping: issues.length === 0,
    siteId,
    sourceRoot,
    sourceSiteDirectory,
    supportingFiles,
    warnings: [...new Set(warnings)].sort()
  }
}

interface CliOptions {
  output?: string
  siteId: string
  sourceRoot: string
}

function parseArguments(args: string[]): CliOptions {
  const values = args.filter(value => value !== '--')
  const valueFor = (flag: string): string | undefined => {
    const index = values.indexOf(flag)
    return index === -1 ? undefined : values[index + 1]
  }
  const sourceRoot = valueFor('--source-root')
  const siteId = valueFor('--site-id')
  if (!sourceRoot || !siteId) {
    throw new Error(
      'Usage: pnpm migration:preflight -- --source-root /absolute/json-directory --site-id example.com [--output report.json]'
    )
  }
  return { sourceRoot, siteId, output: valueFor('--output') }
}

function main(): void {
  const options = parseArguments(process.argv.slice(2))
  const report = inspectLegacySite(options.sourceRoot, options.siteId)
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (options.output) {
    const outputPath = resolve(options.output)
    if (!existsSync(dirname(outputPath))) {
      throw new Error(`Output directory does not exist: ${dirname(outputPath)}`)
    }
    writeFileSync(outputPath, output)
    console.log(outputPath)
  } else {
    process.stdout.write(output)
  }
  if (!report.readyForMapping) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
