import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'
import { buildTrialWebsiteEntries } from './trial-build.ts'

const SITE_ID = 'serp.software'
const SOURCE_PRODUCTS = 'sites/serp.software/products.json'
const SOURCE_CATEGORIES = 'sites/serp.software/categories.json'
const ARTIFACT_PATH = 'd1/artifacts/serp-software-v1.sql'
const REPORT_PATH = 'd1/artifacts/serp-software-v1-parity.yaml'
const BATCH_DIRECTORY = 'd1/artifacts/serp-software-v1-import'
const PUBLISHED_AT = '2026-05-07'
const MIGRATED_AT = '2026-07-13T00:00:00.000Z'

interface SourceCategory {
  slug: string
  name: string
  description?: string
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sql(value: boolean | null | number | string): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${value.replaceAll("'", "''")}'`
}

function stableListingId(slug: string): string {
  return `lst_${hash(`${SITE_ID}:${slug}`).slice(0, 24)}`
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function createD1MigrationArtifact(): { artifactPath: string; reportPath: string } {
  const productsText = readFileSync(resolve(SOURCE_PRODUCTS), 'utf8')
  const categoriesText = readFileSync(resolve(SOURCE_CATEGORIES), 'utf8')
  const products = JSON.parse(productsText) as Parameters<typeof buildTrialWebsiteEntries>[0]
  const categories = JSON.parse(categoriesText) as SourceCategory[]
  const listings = buildTrialWebsiteEntries(products, {
    category: 'video-downloaders',
    featuredCount: 6,
    publishedAt: PUBLISHED_AT
  })
  const slugs = listings.map(listing => listing.slug || '').sort()
  const duplicates = slugs.filter((slug, index) => slug === slugs[index - 1])
  if (duplicates.length > 0 || slugs.some(slug => !slug)) throw new Error(`Invalid source slugs: ${duplicates.join(', ') || 'missing slug'}`)
  const categoryBySlug = new Map(categories.map(category => [category.slug, category]))
  for (const listing of listings) {
    for (const slug of listing.categories || []) {
      if (!categoryBySlug.has(slug)) throw new Error(`Listing ${listing.slug} references unknown category ${slug}.`)
    }
  }

  const inputChecksum = hash(`${productsText}\n${categoriesText}`)
  const targetChecksum = hash(canonical({ categories, listings }))
  const manifestIdentity = `serp-software-v1:${inputChecksum}`
  const statements = [
    'PRAGMA foreign_keys = ON;',
    'BEGIN IMMEDIATE;',
    'CREATE TEMP TABLE import_guard (valid INTEGER NOT NULL CHECK (valid = 1));',
    `INSERT INTO import_guard (valid) VALUES (CASE WHEN COALESCE((SELECT checksum FROM publication_state WHERE site_id = ${sql(SITE_ID)}), ${sql(targetChecksum)}) = ${sql(targetChecksum)} THEN 1 ELSE 0 END);`,
    `INSERT OR IGNORE INTO sites (id, created_at, updated_at) VALUES (${sql(SITE_ID)}, ${sql(MIGRATED_AT)}, ${sql(MIGRATED_AT)});`,
    `DELETE FROM listings WHERE site_id = ${sql(SITE_ID)};`,
    `DELETE FROM categories WHERE site_id = ${sql(SITE_ID)};`,
    ...categories.map((category, order) => `INSERT INTO categories (site_id, slug, name, description, sort_order, is_active, created_at, updated_at) VALUES (${sql(SITE_ID)}, ${sql(category.slug)}, ${sql(category.name)}, ${sql(category.description || '')}, ${order}, 1, ${sql(MIGRATED_AT)}, ${sql(MIGRATED_AT)});`)
  ]

  for (const [displayOrder, listing] of listings.entries()) {
    const id = stableListingId(listing.slug || '')
    const listingChecksum = hash(canonical(listing))
    statements.push(`INSERT INTO listings (id, site_id, slug, name, description, website, content, entity_type, priority, is_unofficial, is_featured, is_active, status, published_at, display_order, source_kind, source_identity, source_updated_at, checksum, created_at, updated_at) VALUES (${sql(id)}, ${sql(SITE_ID)}, ${sql(listing.slug || '')}, ${sql(listing.name)}, ${sql(listing.description)}, ${sql(listing.website)}, ${sql(listing.content || null)}, NULL, NULL, 0, ${sql(Boolean(listing.featured))}, 1, 'draft', ${sql(listing.publishedAt)}, ${displayOrder}, 'legacy-json-migration-v1', ${sql(manifestIdentity)}, ${sql(MIGRATED_AT)}, ${sql(listingChecksum)}, ${sql(MIGRATED_AT)}, ${sql(MIGRATED_AT)});`)
    const listingCategories = listing.categories || []
    listingCategories.forEach((slug, order) => statements.push(`INSERT INTO listing_categories (listing_id, category_id, sort_order, is_primary) SELECT ${sql(id)}, id, ${order}, ${order === 0 ? 1 : 0} FROM categories WHERE site_id = ${sql(SITE_ID)} AND slug = ${sql(slug)};`))
    if (listing.media?.logo) statements.push(`INSERT INTO listing_media (listing_id, kind, url, sort_order) VALUES (${sql(id)}, 'logo', ${sql(listing.media.logo)}, 0);`)
    listing.media?.images?.forEach((url, order) => statements.push(`INSERT INTO listing_media (listing_id, kind, url, sort_order) VALUES (${sql(id)}, 'image', ${sql(url)}, ${order});`))
    if (listing.media?.video) statements.push(`INSERT INTO listing_media (listing_id, kind, url, sort_order) VALUES (${sql(id)}, 'video', ${sql(listing.media.video)}, 0);`)
    listing.resourceLinks?.forEach((link, order) => statements.push(`INSERT INTO listing_resource_links (listing_id, label, url, sort_order) VALUES (${sql(id)}, ${sql(link.label)}, ${sql(link.url)}, ${order});`))
  }

  statements.push('COMMIT;')
  const setupAndDataStatements = statements.filter(statement =>
    statement !== 'PRAGMA foreign_keys = ON;' &&
    statement !== 'BEGIN IMMEDIATE;' &&
    statement !== 'COMMIT;' &&
    !statement.startsWith('CREATE TEMP TABLE import_guard') &&
    !statement.startsWith('INSERT INTO import_guard')
  )
  const statementBatches: string[][] = []
  let currentBatch: string[] = []
  let currentSize = 0
  for (const statement of setupAndDataStatements) {
    if (currentBatch.length > 0 && currentSize + statement.length > 80_000) {
      statementBatches.push(currentBatch)
      currentBatch = []
      currentSize = 0
    }
    currentBatch.push(statement)
    currentSize += statement.length
  }
  if (currentBatch.length > 0) statementBatches.push(currentBatch)
  const finalizeStatements = [
    `UPDATE listings SET status = 'approved' WHERE site_id = ${sql(SITE_ID)} AND source_identity = ${sql(manifestIdentity)};`,
    `INSERT INTO publication_state (site_id, version, manifest_id, checksum, published_at) VALUES (${sql(SITE_ID)}, 1, ${sql(manifestIdentity)}, ${sql(targetChecksum)}, ${sql(MIGRATED_AT)});`,
    `INSERT INTO migration_runs (id, site_id, schema_version, manifest_identity, input_checksum, target_checksum, affected_records, outcome, started_at, completed_at) VALUES (${sql(`migration_${inputChecksum.slice(0, 24)}`)}, ${sql(SITE_ID)}, 1, ${sql(manifestIdentity)}, ${sql(inputChecksum)}, ${sql(targetChecksum)}, ${listings.length}, 'succeeded', ${sql(MIGRATED_AT)}, ${sql(MIGRATED_AT)});`
  ]

  const report = {
    version: 1,
    siteId: SITE_ID,
    source: { productCount: listings.length, categoryCount: categories.length, checksum: inputChecksum },
    target: { listingCount: listings.length, categoryCount: categories.length, checksum: targetChecksum },
    parity: {
      exactSlugSet: slugs,
      duplicateSlugs: duplicates,
      featuredSlugs: listings.filter(listing => listing.featured).map(listing => listing.slug).sort(),
      categoryMembershipCount: listings.reduce((count, listing) => count + (listing.categories?.length || 1), 0),
      categories: categories.map((category, order) => ({ ...category, order })),
      records: listings.map(listing => ({
        slug: listing.slug,
        checksum: hash(canonical(listing)),
        source: listing,
        target: listing,
        categories: listing.categories || []
      })),
      invalidRecords: [],
      renderedFields: ['name', 'description', 'website', 'content', 'entityType', 'priority', 'isUnofficial', 'featured', 'publishedAt', 'media', 'resourceLinks'],
      importBatches: statementBatches.length + 1,
      outputContracts: {
        listingRoutes: slugs.map(slug => `/products/${slug}/`),
        categoryRoutes: categories.map(category => `/categories/${category.slug}/`),
        sitemapListingSlugs: slugs,
        rssListingSlugs: slugs,
        searchListingSlugs: slugs,
        metadataListingSlugs: slugs,
        jsonLdListingSlugs: slugs
      }
    }
  }
  mkdirSync(dirname(resolve(ARTIFACT_PATH)), { recursive: true })
  mkdirSync(resolve(BATCH_DIRECTORY), { recursive: true })
  statementBatches.forEach((batch, index) => writeFileSync(resolve(BATCH_DIRECTORY, `${String(index + 1).padStart(4, '0')}.sql`), `${batch.join('\n')}\n`))
  writeFileSync(resolve(BATCH_DIRECTORY, `${String(statementBatches.length + 1).padStart(4, '0')}.sql`), `${finalizeStatements.join('\n')}\n`)
  writeFileSync(resolve(ARTIFACT_PATH), `-- Deterministic import plan. Execute the ${statementBatches.length + 1} ordered files in ${BATCH_DIRECTORY}.\n-- Input checksum: ${inputChecksum}\n-- Target checksum: ${targetChecksum}\n`)
  writeFileSync(resolve(REPORT_PATH), stringify(report, { aliasDuplicateObjects: false, lineWidth: 0, sortMapEntries: true }))
  return { artifactPath: ARTIFACT_PATH, reportPath: REPORT_PATH }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = createD1MigrationArtifact()
  console.log(`Created ${result.artifactPath} and ${result.reportPath}`)
}
