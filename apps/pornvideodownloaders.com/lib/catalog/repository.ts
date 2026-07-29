import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { resolveRuntimeSiteId } from '@thedaviddias/site-contract'
import type {
  WebsiteDetailMetadata,
  WebsiteMetadata,
  WebsiteNavigationMetadata,
  WebsiteRelatedCardMetadata
} from '@thedaviddias/web-core/content-query'
import { websiteEntrySchema } from '@thedaviddias/web-core/website-schema'
import { cache } from 'react'

const SITE_ID = resolveRuntimeSiteId()

interface ListingRow {
  id: string
  slug: string
  name: string
  description: string
  website: string
  content: string | null
  entity_type: string | null
  priority: 'high' | 'medium' | 'low' | null
  is_unofficial: number
  is_featured: number
  published_at: string
}

interface CategoryRow {
  listing_id: string
  slug: string
  is_primary: number
  sort_order: number
}

interface MediaRow {
  listing_id: string
  kind: 'image' | 'logo' | 'video'
  url: string
  sort_order: number
}

interface ResourceLinkRow {
  listing_id: string
  label: string
  url: string
  sort_order: number
}

export interface PublishedListingPage {
  items: WebsiteMetadata[]
  page: number
  pageSize: number
  total: number
}

export interface PublishedCategory {
  slug: string
  name: string
  description: string
  order: number
  count: number
}

const runtimeEnvironments = new Set(['local', 'preview', 'production'])

function assertCatalogBinding(env: CloudflareEnv): D1Database {
  if (!env.DB) throw new Error('D1 binding DB is required; catalog reads fail closed.')
  if (!runtimeEnvironments.has(env.D1_RUNTIME_ENV)) {
    throw new Error(`Invalid D1 runtime environment: ${env.D1_RUNTIME_ENV || 'missing'}.`)
  }
  return env.DB
}

async function getDatabase(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true })
  return assertCatalogBinding(env as CloudflareEnv)
}

function publicEligibilitySql(alias = 'l'): string {
  return `${alias}.site_id = ? AND ${alias}.status = 'approved' AND ${alias}.is_active = 1 AND ${alias}.published_at IS NOT NULL AND datetime(${alias}.published_at) <= datetime('now')`
}

async function queryAll<T>(database: D1Database, sql: string, bindings: unknown[]): Promise<T[]> {
  const result = await database
    .prepare(sql)
    .bind(...bindings)
    .all<T>()
  if (!result.success)
    throw new Error(`D1 catalog query failed: ${result.error || 'unknown error'}`)
  return result.results
}

function groupRows<T extends { listing_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) grouped.set(row.listing_id, [...(grouped.get(row.listing_id) || []), row])
  return grouped
}

async function hydrateListings(
  database: D1Database,
  rows: ListingRow[]
): Promise<WebsiteMetadata[]> {
  if (rows.length === 0) return []
  const ids = rows.map(row => row.id)
  const idChunks = Array.from({ length: Math.ceil(ids.length / 80) }, (_, index) =>
    ids.slice(index * 80, (index + 1) * 80)
  )
  const [categoryChunks, mediaChunks, resourceChunks] = await Promise.all([
    Promise.all(
      idChunks.map(chunk =>
        queryAll<CategoryRow>(
          database,
          `SELECT lc.listing_id, c.slug, lc.is_primary, lc.sort_order FROM listing_categories lc JOIN categories c ON c.id = lc.category_id WHERE lc.listing_id IN (${chunk.map(() => '?').join(', ')}) AND c.site_id = ? AND c.is_active = 1 ORDER BY lc.listing_id, lc.is_primary DESC, lc.sort_order, c.slug`,
          [...chunk, SITE_ID]
        )
      )
    ),
    Promise.all(
      idChunks.map(chunk =>
        queryAll<MediaRow>(
          database,
          `SELECT listing_id, kind, url, sort_order FROM listing_media WHERE listing_id IN (${chunk.map(() => '?').join(', ')}) ORDER BY listing_id, sort_order`,
          chunk
        )
      )
    ),
    Promise.all(
      idChunks.map(chunk =>
        queryAll<ResourceLinkRow>(
          database,
          `SELECT listing_id, label, url, sort_order FROM listing_resource_links WHERE listing_id IN (${chunk.map(() => '?').join(', ')}) ORDER BY listing_id, sort_order`,
          chunk
        )
      )
    )
  ])
  const categoryRows = categoryChunks.flat()
  const mediaRows = mediaChunks.flat()
  const resourceRows = resourceChunks.flat()
  const categoriesByListing = groupRows(categoryRows)
  const mediaByListing = groupRows(mediaRows)
  const resourcesByListing = groupRows(resourceRows)

  return rows.map(row => {
    const categoryMemberships = categoriesByListing.get(row.id) || []
    const primary = categoryMemberships.find(category => category.is_primary === 1)
    if (!primary)
      throw new Error(
        `Invalid D1 listing ${row.slug}: exactly one active primary category is required.`
      )
    const mediaRowsForListing = mediaByListing.get(row.id) || []
    const images = mediaRowsForListing
      .filter(media => media.kind === 'image')
      .map(media => media.url)
    const logo = mediaRowsForListing.find(media => media.kind === 'logo')?.url
    const video = mediaRowsForListing.find(media => media.kind === 'video')?.url
    const parsed = websiteEntrySchema.parse({
      categories: categoryMemberships.map(category => category.slug),
      category: primary.slug,
      content: row.content || undefined,
      description: row.description,
      entityType: row.entity_type || undefined,
      featured: Boolean(row.is_featured) || undefined,
      isUnofficial: Boolean(row.is_unofficial) || undefined,
      media:
        images.length || logo || video
          ? { images: images.length ? images : undefined, logo, video }
          : undefined,
      name: row.name,
      priority: row.priority || undefined,
      publishedAt: row.published_at.slice(0, 10),
      resourceLinks: (resourcesByListing.get(row.id) || []).map(resource => ({
        label: resource.label,
        url: resource.url
      })),
      slug: row.slug,
      website: row.website
    })
    return parsed as WebsiteMetadata
  })
}

async function readPublishedListings(): Promise<WebsiteMetadata[]> {
  const database = await getDatabase()
  const rows = await queryAll<ListingRow>(
    database,
    `SELECT id, slug, name, description, website, content, entity_type, priority, is_unofficial, is_featured, published_at FROM listings l WHERE ${publicEligibilitySql()} ORDER BY l.published_at DESC, l.display_order ASC, l.slug ASC`,
    [SITE_ID]
  )
  return hydrateListings(database, rows)
}

export const getPublishedListings = cache(readPublishedListings)

export async function getPublishedListingPage(
  page = 1,
  pageSize = 48
): Promise<PublishedListingPage> {
  const safePage = Math.max(1, page)
  const safePageSize = Math.min(100, Math.max(1, pageSize))
  const database = await getDatabase()
  const [rows, countRow] = await Promise.all([
    queryAll<ListingRow>(
      database,
      `SELECT id, slug, name, description, website, content, entity_type, priority, is_unofficial, is_featured, published_at FROM listings l WHERE ${publicEligibilitySql()} ORDER BY l.published_at DESC, l.display_order ASC, l.slug ASC LIMIT ? OFFSET ?`,
      [SITE_ID, safePageSize, (safePage - 1) * safePageSize]
    ),
    database
      .prepare(`SELECT COUNT(*) AS total FROM listings l WHERE ${publicEligibilitySql()}`)
      .bind(SITE_ID)
      .first<{ total: number }>()
  ])
  if (!countRow || !Number.isSafeInteger(countRow.total))
    throw new Error('Invalid D1 listing count.')
  return {
    items: await hydrateListings(database, rows),
    page: safePage,
    pageSize: safePageSize,
    total: countRow.total
  }
}

export async function getFeaturedListings(limit = 6): Promise<WebsiteMetadata[]> {
  const database = await getDatabase()
  const rows = await queryAll<ListingRow>(
    database,
    `SELECT id, slug, name, description, website, content, entity_type, priority, is_unofficial, is_featured, published_at FROM listings l WHERE ${publicEligibilitySql()} AND l.is_featured = 1 ORDER BY l.published_at DESC, l.display_order ASC, l.slug ASC LIMIT ?`,
    [SITE_ID, Math.min(100, Math.max(1, limit))]
  )
  return hydrateListings(database, rows)
}

export async function getFeaturedListingCount(): Promise<number> {
  const database = await getDatabase()
  const row = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM listings l WHERE ${publicEligibilitySql()} AND l.is_featured = 1`
    )
    .bind(SITE_ID)
    .first<{ total: number }>()
  if (!row || !Number.isSafeInteger(row.total) || row.total < 0)
    throw new Error('Invalid D1 featured listing count.')
  return row.total
}

export async function getLatestListings(limit = 12): Promise<WebsiteMetadata[]> {
  return (await getPublishedListingPage(1, limit)).items
}

export async function getListingBySlug(slug: string): Promise<WebsiteDetailMetadata | null> {
  const database = await getDatabase()
  const rows = await queryAll<ListingRow>(
    database,
    `SELECT id, slug, name, description, website, content, entity_type, priority, is_unofficial, is_featured, published_at FROM listings l WHERE ${publicEligibilitySql()} AND l.slug = ? LIMIT 1`,
    [SITE_ID, slug]
  )
  const [listing] = await hydrateListings(database, rows)
  if (!listing || !rows[0]) return null
  const currentId = rows[0].id
  const relatedRows = await queryAll<ListingRow>(
    database,
    `SELECT l.id, l.slug, l.name, l.description, l.website, l.content, l.entity_type, l.priority, l.is_unofficial, l.is_featured, l.published_at FROM listings l JOIN listing_categories candidate ON candidate.listing_id = l.id JOIN listing_categories current ON current.category_id = candidate.category_id AND current.listing_id = ? WHERE ${publicEligibilitySql()} AND l.id != ? GROUP BY l.id ORDER BY COUNT(*) DESC, l.name LIMIT 4`,
    [currentId, SITE_ID, currentId]
  )
  const adjacent = await queryAll<{ previous_id: string | null; next_id: string | null }>(
    database,
    `WITH ordered AS (SELECT id, slug, LAG(id) OVER (ORDER BY published_at DESC, display_order ASC, slug ASC) AS previous_id, LEAD(id) OVER (ORDER BY published_at DESC, display_order ASC, slug ASC) AS next_id FROM listings l WHERE ${publicEligibilitySql()}) SELECT previous_id, next_id FROM ordered WHERE slug = ?`,
    [SITE_ID, slug]
  )
  const adjacentIds = [adjacent[0]?.previous_id, adjacent[0]?.next_id].filter((id): id is string =>
    Boolean(id)
  )
  const adjacentRows = adjacentIds.length
    ? await queryAll<ListingRow>(
        database,
        `SELECT id, slug, name, description, website, content, entity_type, priority, is_unofficial, is_featured, published_at FROM listings l WHERE ${publicEligibilitySql()} AND id IN (${adjacentIds.map(() => '?').join(', ')})`,
        [SITE_ID, ...adjacentIds]
      )
    : []
  const [relatedListings, adjacentListings] = await Promise.all([
    hydrateListings(database, relatedRows),
    hydrateListings(database, adjacentRows)
  ])
  const relatedWebsites: WebsiteRelatedCardMetadata[] = relatedListings.map(item => ({
    slug: item.slug,
    name: item.name,
    description: item.description,
    website: item.website,
    isUnofficial: item.isUnofficial,
    media: item.media?.logo ? { logo: item.media.logo } : undefined
  }))
  function navigation(id: string | null | undefined): WebsiteNavigationMetadata | null {
    const item = adjacentListings.find(
      candidate => adjacentRows.find(row => row.id === id)?.slug === candidate.slug
    )
    return item
      ? {
          slug: item.slug,
          name: item.name,
          website: item.website,
          media: item.media?.logo ? { logo: item.media.logo } : undefined
        }
      : null
  }
  return {
    ...listing,
    relatedWebsites,
    previousWebsite: navigation(adjacent[0]?.previous_id),
    nextWebsite: navigation(adjacent[0]?.next_id)
  }
}

export async function getCanonicalSlugForRedirect(oldSlug: string): Promise<string | null> {
  const database = await getDatabase()
  const row = await database
    .prepare(
      `SELECT l.slug FROM listing_slug_redirects r JOIN listings l ON l.id = r.listing_id WHERE r.site_id = ? AND r.old_slug = ? AND ${publicEligibilitySql()} LIMIT 1`
    )
    .bind(SITE_ID, oldSlug, SITE_ID)
    .first<{ slug: string }>()
  return row?.slug || null
}

export async function getActiveCategories(): Promise<PublishedCategory[]> {
  const database = await getDatabase()
  return queryAll<PublishedCategory>(
    database,
    `SELECT c.slug, c.name, c.description, c.sort_order AS [order], COUNT(l.id) AS count FROM categories c LEFT JOIN listing_categories lc ON lc.category_id = c.id LEFT JOIN listings l ON l.id = lc.listing_id AND ${publicEligibilitySql('l')} WHERE c.site_id = ? AND c.is_active = 1 GROUP BY c.id ORDER BY c.sort_order, c.name`,
    [SITE_ID, SITE_ID]
  )
}

export async function getCategoryBySlug(slug: string): Promise<PublishedCategory | null> {
  const database = await getDatabase()
  const row = await database
    .prepare(
      `SELECT c.slug, c.name, c.description, c.sort_order AS [order], COUNT(l.id) AS count FROM categories c LEFT JOIN listing_categories lc ON lc.category_id = c.id LEFT JOIN listings l ON l.id = lc.listing_id AND ${publicEligibilitySql('l')} WHERE c.site_id = ? AND c.slug = ? AND c.is_active = 1 GROUP BY c.id`
    )
    .bind(SITE_ID, SITE_ID, slug)
    .first<PublishedCategory>()
  return row || null
}

export async function getListingsByCategory(slug: string): Promise<WebsiteMetadata[]> {
  const database = await getDatabase()
  const rows = await queryAll<ListingRow>(
    database,
    `SELECT l.id, l.slug, l.name, l.description, l.website, l.content, l.entity_type, l.priority, l.is_unofficial, l.is_featured, l.published_at FROM listings l JOIN listing_categories lc ON lc.listing_id = l.id JOIN categories c ON c.id = lc.category_id WHERE ${publicEligibilitySql()} AND c.site_id = ? AND c.slug = ? AND c.is_active = 1 ORDER BY l.published_at DESC, l.display_order ASC, l.slug ASC`,
    [SITE_ID, SITE_ID, slug]
  )
  return hydrateListings(database, rows)
}

export async function searchListings(query: string, limit = 50): Promise<WebsiteMetadata[]> {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return []
  const database = await getDatabase()
  const terms = normalized.split(/\s+/).filter(Boolean)
  const patterns = terms.map(
    term => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  )
  const termClause = `(lower(l.name) LIKE ? ESCAPE '\\' OR lower(l.description) LIKE ? ESCAPE '\\' OR lower(l.website) LIKE ? ESCAPE '\\' OR lower(l.slug) LIKE ? ESCAPE '\\' OR lower(COALESCE(l.content, '')) LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM listing_categories lc JOIN categories c ON c.id = lc.category_id WHERE lc.listing_id = l.id AND (lower(c.slug) LIKE ? ESCAPE '\\' OR lower(c.name) LIKE ? ESCAPE '\\')))`
  const searchClause = terms.map(() => termClause).join(' AND ')
  const searchBindings = patterns.flatMap(pattern => Array(7).fill(pattern))
  const rows = await queryAll<ListingRow>(
    database,
    `SELECT l.id, l.slug, l.name, l.description, l.website, l.content, l.entity_type, l.priority, l.is_unofficial, l.is_featured, l.published_at FROM listings l WHERE ${publicEligibilitySql()} AND ${searchClause} ORDER BY CASE WHEN lower(l.name) = ? THEN 0 WHEN lower(l.name) LIKE ? ESCAPE '\\' THEN 1 WHEN lower(l.name) LIKE ? ESCAPE '\\' THEN 2 ELSE 3 END, l.name, l.slug LIMIT ?`,
    [
      SITE_ID,
      ...searchBindings,
      normalized,
      `${normalized.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`,
      `%${normalized.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`,
      Math.min(1000, Math.max(1, limit))
    ]
  )
  return hydrateListings(database, rows)
}

export async function getAutocomplete(query: string, limit = 8): Promise<WebsiteMetadata[]> {
  return (await searchListings(query, limit)).map(listing => ({
    ...listing,
    content: undefined,
    resourceLinks: undefined
  }))
}

export async function getPublicationVersion(): Promise<number> {
  const database = await getDatabase()
  const row = await database
    .prepare('SELECT version FROM publication_state WHERE site_id = ?')
    .bind(SITE_ID)
    .first<{ version: number }>()
  if (!row || !Number.isSafeInteger(row.version) || row.version < 0)
    throw new Error(`Missing or invalid publication state for ${SITE_ID}.`)
  return row.version
}

export async function getSitemapListings(): Promise<WebsiteMetadata[]> {
  return getPublishedListings()
}

export const catalogSiteId = SITE_ID
