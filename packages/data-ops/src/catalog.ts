import 'server-only'

import type {
  CatalogOperation,
  CatalogOperations,
  CatalogOperationsConfig,
  CatalogQueryEvent,
  CatalogQueryShape,
  CatalogShellStats,
  ListingDetail,
  ListingNavigation,
  ListingPage,
  ListingResourceLink,
  ListingSummary,
  PublishedCategory,
  RelatedListing
} from './contracts'

const SHELL_CACHE_SCHEMA = 'v1'
const SHELL_CACHE_TTL_SECONDS = 60
const PUBLICATION_ORDER = 'l.published_at DESC, l.display_order ASC, l.slug ASC'
const runtimePriorities = new Set(['high', 'medium', 'low'])

interface QueryMeta {
  duration?: number
  rows_read?: number
  rows_written?: number
}

interface SummaryRow {
  categories: string | null
  category: string
  description: string
  display_order: number
  id: string
  is_featured: number
  is_unofficial: number
  logo: string | null
  name: string
  published_at: string
  slug: string
  website: string
}

interface DetailRow extends SummaryRow {
  content: string | null
  entity_type: string | null
  images: string
  priority: string | null
  resource_links: string
  video: string | null
}

interface NavigationRow {
  logo: string | null
  name: string
  slug: string
  website: string
}

interface RelatedCandidateRow {
  listing_id: string
}

interface RelatedLogoRow {
  listing_id: string
  url: string
}

interface ShellRow {
  categories: string
  featured_count: number
}

function finiteMetric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function publicEligibilitySql(alias = 'l'): string {
  return `${alias}.site_id = ? AND ${alias}.status = 'approved' AND ${alias}.is_active = 1 AND ${alias}.published_at IS NOT NULL AND ${alias}.published_at <= ?`
}

const summaryColumns = `
  l.id,
  l.slug,
  l.name,
  l.description,
  l.website,
  l.display_order,
  l.is_unofficial,
  l.is_featured,
  l.published_at,
  (
    SELECT c.slug
    FROM listing_categories lc
    JOIN categories c ON c.id = lc.category_id
    WHERE lc.listing_id = l.id AND lc.is_primary = 1 AND c.site_id = l.site_id AND c.is_active = 1
    LIMIT 1
  ) AS category,
  (
    SELECT group_concat(ordered.slug, char(31))
    FROM (
      SELECT c.slug
      FROM listing_categories lc
      JOIN categories c ON c.id = lc.category_id
      WHERE lc.listing_id = l.id AND c.site_id = l.site_id AND c.is_active = 1
      ORDER BY lc.is_primary DESC, lc.sort_order ASC, c.slug ASC
    ) ordered
  ) AS categories,
  (
    SELECT m.url
    FROM listing_media m
    WHERE m.listing_id = l.id AND m.kind = 'logo'
    ORDER BY m.sort_order ASC
    LIMIT 1
  ) AS logo`

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid D1 ${field}.`)
  return value
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Invalid D1 ${field}.`)
  return value as number
}

function parseJsonArray(value: string, field: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  throw new Error(`Invalid D1 ${field}.`)
}

function mapSummary(row: SummaryRow): ListingSummary {
  const category = requireString(row.category, 'primary category')
  const categories = (row.categories || '')
    .split(String.fromCharCode(31))
    .filter(Boolean)
    .map(value => requireString(value, 'category slug'))
  if (!categories.includes(category))
    throw new Error(`Invalid D1 listing ${row.slug}: primary category is missing.`)

  return {
    categories,
    category,
    description: requireString(row.description, 'listing description'),
    featured: row.is_featured === 1 || undefined,
    isUnofficial: row.is_unofficial === 1 || undefined,
    media: row.logo ? { logo: requireString(row.logo, 'listing logo') } : undefined,
    name: requireString(row.name, 'listing name'),
    publishedAt: requireString(row.published_at, 'publication date').slice(0, 10),
    slug: requireString(row.slug, 'listing slug'),
    website: requireString(row.website, 'listing website')
  }
}

function mapNavigation(row: NavigationRow | undefined): ListingNavigation | null {
  if (!row) return null
  return {
    media: row.logo ? { logo: requireString(row.logo, 'navigation logo') } : undefined,
    name: requireString(row.name, 'navigation name'),
    slug: requireString(row.slug, 'navigation slug'),
    website: requireString(row.website, 'navigation website')
  }
}

function compareSqliteBinary(left: string, right: string): number {
  const encoder = new TextEncoder()
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  const length = Math.min(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftBytes[index] || 0) - (rightBytes[index] || 0)
    if (difference !== 0) return difference
  }
  return leftBytes.length - rightBytes.length
}

function mapDetail(
  row: DetailRow
): Omit<ListingDetail, 'nextWebsite' | 'previousWebsite' | 'relatedWebsites'> {
  const summary = mapSummary(row)
  const imageValues = parseJsonArray(row.images, 'listing images')
  const resourceValues = parseJsonArray(row.resource_links, 'listing resource links')
  const images = imageValues.map((value, index) =>
    requireString(value, `listing image ${index + 1}`)
  )
  const resources: ListingResourceLink[] = resourceValues.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`Invalid D1 resource ${index + 1}.`)
    const resource = value as Record<string, unknown>
    return {
      label: requireString(resource.label, `resource ${index + 1} label`),
      url: requireString(resource.url, `resource ${index + 1} URL`)
    }
  })
  const priority =
    typeof row.priority === 'string' && runtimePriorities.has(row.priority)
      ? (row.priority as 'high' | 'low' | 'medium')
      : undefined
  const logo = summary.media?.logo
  const video = row.video || undefined

  return {
    ...summary,
    content: row.content || undefined,
    entityType: row.entity_type || undefined,
    media:
      logo || video || images.length
        ? {
            logo,
            images: images.length ? images : undefined,
            video
          }
        : undefined,
    priority,
    resourceLinks: resources.length ? resources : undefined
  }
}

function isShellStats(value: unknown, publicationVersion: number): value is CatalogShellStats {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CatalogShellStats>
  return (
    candidate.publicationVersion === publicationVersion &&
    Number.isSafeInteger(candidate.featuredCount) &&
    (candidate.featuredCount as number) >= 0 &&
    Array.isArray(candidate.categories) &&
    candidate.categories.every(
      category =>
        category &&
        typeof category.slug === 'string' &&
        typeof category.name === 'string' &&
        typeof category.description === 'string' &&
        Number.isSafeInteger(category.order) &&
        Number.isSafeInteger(category.count) &&
        category.count >= 0
    )
  )
}

export function createCatalogOperations(config: CatalogOperationsConfig): CatalogOperations {
  const { cache, clock, database, observe, siteId } = config

  async function queryAll<T>(
    operation: CatalogOperation,
    queryShape: CatalogQueryShape,
    sql: string,
    bindings: unknown[]
  ): Promise<T[]> {
    const startedAt = performance.now()
    let eventEmitted = false
    try {
      const result = await database
        .prepare(sql)
        .bind(...bindings)
        .all<T>()
      const meta = result.meta as QueryMeta
      const event: CatalogQueryEvent = {
        d1DurationMs: finiteMetric(meta?.duration),
        event: 'd1_query',
        operation,
        queryShape,
        resultRows: result.results.length,
        rowsRead: finiteMetric(meta?.rows_read),
        rowsWritten: finiteMetric(meta?.rows_written),
        siteId,
        success: result.success,
        wallDurationMs: performance.now() - startedAt
      }
      observe(event)
      eventEmitted = true
      if (!result.success) throw new Error('D1 catalog query failed.')
      return result.results
    } catch (error) {
      if (!eventEmitted) {
        observe({
          d1DurationMs: null,
          event: 'd1_query',
          operation,
          queryShape,
          resultRows: 0,
          rowsRead: null,
          rowsWritten: null,
          siteId,
          success: false,
          wallDurationMs: performance.now() - startedAt
        })
      }
      throw error
    }
  }

  function operationTime(): string {
    const value = clock()
    if (Number.isNaN(value.getTime())) throw new Error('Catalog clock returned an invalid date.')
    return value.toISOString()
  }

  async function summaries(
    operation: CatalogOperation,
    queryShape: CatalogQueryShape,
    extraWhere: string,
    extraBindings: unknown[],
    orderBy: string,
    limit?: number,
    offset?: number
  ): Promise<ListingSummary[]> {
    const asOf = operationTime()
    const pagination =
      limit === undefined ? '' : ` LIMIT ?${offset === undefined ? '' : ' OFFSET ?'}`
    const rows = await queryAll<SummaryRow>(
      operation,
      queryShape,
      `SELECT ${summaryColumns} FROM listings l WHERE ${publicEligibilitySql()}${extraWhere} ORDER BY ${orderBy}${pagination}`,
      [
        siteId,
        asOf,
        ...extraBindings,
        ...(limit === undefined ? [] : [limit]),
        ...(offset === undefined ? [] : [offset])
      ]
    )
    return rows.map(mapSummary)
  }

  async function getPublicationVersion(): Promise<number> {
    const rows = await queryAll<{ version: number }>(
      'publication-version',
      'publication-version',
      'SELECT version FROM publication_state WHERE site_id = ? LIMIT 1',
      [siteId]
    )
    return requireNonNegativeInteger(rows[0]?.version, `publication state for ${siteId}`)
  }

  async function getShellStats(): Promise<CatalogShellStats> {
    const publicationVersion = await getPublicationVersion()
    const cacheKey = `catalog-shell:${SHELL_CACHE_SCHEMA}:${siteId}:${publicationVersion}`
    try {
      const cached = await cache.get(cacheKey)
      if (cached !== null) {
        if (isShellStats(cached, publicationVersion)) {
          observe({ event: 'catalog_cache', operation: 'shell-stats', siteId, state: 'hit' })
          return cached
        }
        observe({ event: 'catalog_cache', operation: 'shell-stats', siteId, state: 'corrupt' })
      } else {
        observe({ event: 'catalog_cache', operation: 'shell-stats', siteId, state: 'miss' })
      }
    } catch {
      observe({ event: 'catalog_cache', operation: 'shell-stats', siteId, state: 'error' })
    }

    const asOf = operationTime()
    const rows = await queryAll<ShellRow>(
      'shell-stats',
      'shell-stats',
      `SELECT
        COALESCE((
          SELECT json_group_array(json_object(
            'slug', counts.slug,
            'name', counts.name,
            'description', counts.description,
            'order', counts.sort_order,
            'count', counts.listing_count
          ))
          FROM (
            SELECT
              c.slug,
              c.name,
              c.description,
              c.sort_order,
              (
                SELECT COUNT(*)
                FROM listing_categories lc
                JOIN listings l ON l.id = lc.listing_id
                WHERE lc.category_id = c.id AND ${publicEligibilitySql()}
              ) AS listing_count
            FROM categories c
            WHERE c.site_id = ? AND c.is_active = 1
            ORDER BY c.sort_order ASC, c.name ASC
          ) counts
        ), '[]') AS categories,
        (
          SELECT COUNT(*)
          FROM listings l
          WHERE ${publicEligibilitySql()} AND l.is_featured = 1
        ) AS featured_count`,
      [siteId, asOf, siteId, siteId, asOf]
    )
    const row = rows[0]
    if (!row) throw new Error('Missing D1 shell statistics.')
    const categories: PublishedCategory[] = parseJsonArray(row.categories, 'shell categories').map(
      (value, index) => {
        if (!value || typeof value !== 'object')
          throw new Error(`Invalid D1 shell category ${index + 1}.`)
        const category = value as Record<string, unknown>
        return {
          count: requireNonNegativeInteger(category.count, `category ${index + 1} count`),
          description: typeof category.description === 'string' ? category.description : '',
          name: requireString(category.name, `category ${index + 1} name`),
          order: requireNonNegativeInteger(category.order, `category ${index + 1} order`),
          slug: requireString(category.slug, `category ${index + 1} slug`)
        }
      }
    )
    const stats: CatalogShellStats = {
      categories,
      featuredCount: requireNonNegativeInteger(row.featured_count, 'featured count'),
      publicationVersion
    }
    try {
      await cache.put(cacheKey, stats, SHELL_CACHE_TTL_SECONDS)
      observe({ event: 'catalog_cache', operation: 'shell-stats', siteId, state: 'written' })
    } catch {
      observe({ event: 'catalog_cache', operation: 'shell-stats', siteId, state: 'write-error' })
    }
    return stats
  }

  async function navigation(
    current: Pick<SummaryRow, 'display_order' | 'published_at' | 'slug'>,
    asOf: string,
    direction: 'next' | 'previous'
  ): Promise<ListingNavigation | null> {
    const isPrevious = direction === 'previous'
    const branches = isPrevious
      ? [
          {
            bindings: [current.published_at, current.display_order, current.slug],
            order: 'l.slug DESC',
            predicate: 'l.published_at = ? AND l.display_order = ? AND l.slug < ?',
            shape: 'navigation-previous-slug' as const
          },
          {
            bindings: [current.published_at, current.display_order],
            order: 'l.display_order DESC, l.slug DESC',
            predicate: 'l.published_at = ? AND l.display_order < ?',
            shape: 'navigation-previous-display' as const
          },
          {
            bindings: [current.published_at],
            order: 'l.published_at ASC, l.display_order DESC, l.slug DESC',
            predicate: 'l.published_at > ?',
            shape: 'navigation-previous-publication' as const
          }
        ]
      : [
          {
            bindings: [current.published_at, current.display_order, current.slug],
            order: 'l.slug ASC',
            predicate: 'l.published_at = ? AND l.display_order = ? AND l.slug > ?',
            shape: 'navigation-next-slug' as const
          },
          {
            bindings: [current.published_at, current.display_order],
            order: 'l.display_order ASC, l.slug ASC',
            predicate: 'l.published_at = ? AND l.display_order > ?',
            shape: 'navigation-next-display' as const
          },
          {
            bindings: [current.published_at],
            order: PUBLICATION_ORDER,
            predicate: 'l.published_at < ?',
            shape: 'navigation-next-publication' as const
          }
        ]

    for (const branch of branches) {
      const rows = await queryAll<NavigationRow>(
        'listing-detail',
        branch.shape,
        `SELECT
        l.slug,
        l.name,
        l.website,
        (
          SELECT m.url FROM listing_media m
          WHERE m.listing_id = l.id AND m.kind = 'logo'
          ORDER BY m.sort_order ASC LIMIT 1
        ) AS logo
      FROM listings l
      WHERE ${publicEligibilitySql()} AND ${branch.predicate}
      ORDER BY ${branch.order}
      LIMIT 1`,
        [siteId, asOf, ...branch.bindings]
      )
      if (rows[0]) return mapNavigation(rows[0])
    }
    return null
  }

  async function getListingBySlug(slug: string): Promise<ListingDetail | null> {
    const asOf = operationTime()
    const rows = await queryAll<DetailRow>(
      'listing-detail',
      'listing-detail',
      `SELECT
        ${summaryColumns},
        l.content,
        l.entity_type,
        l.priority,
        COALESCE((
          SELECT json_group_array(ordered.url)
          FROM (
            SELECT m.url FROM listing_media m
            WHERE m.listing_id = l.id AND m.kind = 'image'
            ORDER BY m.sort_order ASC
          ) ordered
        ), '[]') AS images,
        (
          SELECT m.url FROM listing_media m
          WHERE m.listing_id = l.id AND m.kind = 'video'
          ORDER BY m.sort_order ASC LIMIT 1
        ) AS video,
        COALESCE((
          SELECT json_group_array(json_object('label', ordered.label, 'url', ordered.url))
          FROM (
            SELECT r.label, r.url FROM listing_resource_links r
            WHERE r.listing_id = l.id
            ORDER BY r.sort_order ASC
          ) ordered
        ), '[]') AS resource_links
      FROM listings l
      WHERE ${publicEligibilitySql()} AND l.slug = ?
      LIMIT 1`,
      [siteId, asOf, slug]
    )
    const row = rows[0]
    if (!row) return null

    const relatedRows: SummaryRow[] = []
    const sharedCategoryCount = (row.categories || '')
      .split(String.fromCharCode(31))
      .filter(Boolean).length
    if (sharedCategoryCount === 1) {
      relatedRows.push(
        ...(await queryAll<SummaryRow>(
          'listing-detail',
          'related-single-category',
          `SELECT
             l.id,
             l.slug,
             l.name,
             l.description,
             l.website,
             l.display_order,
             l.is_unofficial,
             l.is_featured,
             l.published_at,
             '' AS category,
             NULL AS categories,
             NULL AS logo
           FROM listings l INDEXED BY listings_related_name_idx
           WHERE ${publicEligibilitySql()}
             AND l.id != ?
             AND EXISTS (
               SELECT 1
               FROM listing_categories shared
               WHERE shared.listing_id = l.id
                 AND shared.category_id = (
                   SELECT current.category_id
                   FROM listing_categories current
                   WHERE current.listing_id = ?
                   LIMIT 1
                 )
             )
           ORDER BY l.name ASC, l.slug ASC
           LIMIT 4`,
          [siteId, asOf, row.id, row.id]
        ))
      )
    }
    for (
      let score = sharedCategoryCount;
      sharedCategoryCount > 1 && score >= 1 && relatedRows.length < 4;
      score -= 1
    ) {
      const candidateRows = await queryAll<RelatedCandidateRow>(
        'listing-detail',
        'related-candidates',
        `SELECT shared.listing_id
         FROM listing_categories shared
         WHERE shared.category_id IN (
           SELECT current.category_id
           FROM listing_categories current
           WHERE current.listing_id = ?
         )
           AND shared.listing_id != ?
         GROUP BY shared.listing_id
         HAVING COUNT(*) = ?`,
        [row.id, row.id, score]
      )
      const candidateIds = candidateRows.map(candidate =>
        requireString(candidate.listing_id, 'related candidate id')
      )
      const chunks = Array.from({ length: Math.ceil(candidateIds.length / 80) }, (_, index) =>
        candidateIds.slice(index * 80, (index + 1) * 80)
      )
      const scoreRows = (
        await Promise.all(
          chunks.map(chunk =>
            queryAll<SummaryRow>(
              'listing-detail',
              'related-hydration',
              `WITH candidate_ids(id) AS (
                VALUES ${chunk.map(() => '(?)').join(', ')}
              )
              SELECT
                l.id,
                l.slug,
                l.name,
                l.description,
                l.website,
                l.display_order,
                l.is_unofficial,
                l.is_featured,
                l.published_at,
                '' AS category,
                NULL AS categories,
                NULL AS logo
              FROM candidate_ids
              CROSS JOIN listings l
              WHERE l.id = candidate_ids.id
                AND ${publicEligibilitySql()}`,
              [...chunk, siteId, asOf]
            )
          )
        )
      )
        .flat()
        .sort(
          (left, right) =>
            compareSqliteBinary(left.name, right.name) || compareSqliteBinary(left.slug, right.slug)
        )
        .slice(0, 4 - relatedRows.length)
      relatedRows.push(...scoreRows)
    }
    const relatedIds = relatedRows.map(related => related.id)
    const logoRows = relatedIds.length
      ? await queryAll<RelatedLogoRow>(
          'listing-detail',
          'related-logos',
          `SELECT listing_id, url
           FROM listing_media
           WHERE listing_id IN (${relatedIds.map(() => '?').join(', ')})
             AND kind = 'logo'
           ORDER BY listing_id ASC, sort_order ASC`,
          relatedIds
        )
      : []
    const logos = new Map<string, string>()
    for (const logo of logoRows) {
      if (!logos.has(logo.listing_id)) logos.set(logo.listing_id, logo.url)
    }
    const relatedWebsites: RelatedListing[] = relatedRows.map(related => ({
      description: requireString(related.description, 'related description'),
      isUnofficial: related.is_unofficial === 1 || undefined,
      media: logos.has(related.id)
        ? { logo: requireString(logos.get(related.id), 'related logo') }
        : undefined,
      name: requireString(related.name, 'related name'),
      slug: requireString(related.slug, 'related slug'),
      website: requireString(related.website, 'related website')
    }))
    const [previousWebsite, nextWebsite] = await Promise.all([
      navigation(row, asOf, 'previous'),
      navigation(row, asOf, 'next')
    ])
    return {
      ...mapDetail(row),
      nextWebsite,
      previousWebsite,
      relatedWebsites
    }
  }

  async function getPublishedListingPage(page = 1, pageSize = 48): Promise<ListingPage> {
    const safePage = Math.max(1, Math.trunc(page))
    const safePageSize = Math.min(100, Math.max(1, Math.trunc(pageSize)))
    const asOf = operationTime()
    const [rows, countRows] = await Promise.all([
      queryAll<SummaryRow>(
        'listing-page',
        'listing-page-items',
        `SELECT ${summaryColumns} FROM listings l WHERE ${publicEligibilitySql()} ORDER BY ${PUBLICATION_ORDER} LIMIT ? OFFSET ?`,
        [siteId, asOf, safePageSize, (safePage - 1) * safePageSize]
      ),
      queryAll<{ total: number }>(
        'listing-page',
        'listing-page-count',
        `SELECT COUNT(*) AS total FROM listings l WHERE ${publicEligibilitySql()}`,
        [siteId, asOf]
      )
    ])
    return {
      items: rows.map(mapSummary),
      page: safePage,
      pageSize: safePageSize,
      total: requireNonNegativeInteger(countRows[0]?.total, 'listing count')
    }
  }

  async function searchListings(query: string, limit = 50): Promise<ListingSummary[]> {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return []
    const terms = normalized.split(/\s+/u).filter(Boolean)
    const patterns = terms.map(
      term => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    )
    const termClause = `(lower(l.name) LIKE ? ESCAPE '\\' OR lower(l.description) LIKE ? ESCAPE '\\' OR lower(l.website) LIKE ? ESCAPE '\\' OR lower(l.slug) LIKE ? ESCAPE '\\' OR lower(COALESCE(l.content, '')) LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM listing_categories lc JOIN categories c ON c.id = lc.category_id WHERE lc.listing_id = l.id AND (lower(c.slug) LIKE ? ESCAPE '\\' OR lower(c.name) LIKE ? ESCAPE '\\')))`
    const escaped = normalized
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_')
    return summaries(
      'search-summaries',
      'search-summaries',
      ` AND ${terms.map(() => termClause).join(' AND ')}`,
      [
        ...patterns.flatMap(pattern => Array(7).fill(pattern)),
        normalized,
        `${escaped}%`,
        `%${escaped}%`
      ],
      `CASE WHEN lower(l.name) = ? THEN 0 WHEN lower(l.name) LIKE ? ESCAPE '\\' THEN 1 WHEN lower(l.name) LIKE ? ESCAPE '\\' THEN 2 ELSE 3 END, l.name ASC, l.slug ASC`,
      Math.min(1000, Math.max(1, Math.trunc(limit)))
    )
  }

  return {
    async getActiveCategories() {
      return (await getShellStats()).categories
    },
    async getAutocomplete(query, limit = 8) {
      return searchListings(query, limit)
    },
    async getCanonicalSlugForRedirect(oldSlug) {
      const asOf = operationTime()
      const rows = await queryAll<{ slug: string }>(
        'canonical-redirect',
        'canonical-redirect',
        `SELECT l.slug
         FROM listing_slug_redirects r
         JOIN listings l ON l.id = r.listing_id
         WHERE r.site_id = ? AND r.old_slug = ? AND ${publicEligibilitySql()}
         LIMIT 1`,
        [siteId, oldSlug, siteId, asOf]
      )
      return rows[0]?.slug || null
    },
    async getCategoryBySlug(slug) {
      return (await getShellStats()).categories.find(category => category.slug === slug) || null
    },
    async getFeaturedListingCount() {
      return (await getShellStats()).featuredCount
    },
    async getFeaturedListings(limit = 6) {
      return summaries(
        'featured-summaries',
        'featured-summaries',
        ' AND l.is_featured = 1',
        [],
        PUBLICATION_ORDER,
        Math.min(100, Math.max(1, Math.trunc(limit)))
      )
    },
    async getLatestListings(limit = 12) {
      return (await getPublishedListingPage(1, limit)).items
    },
    getListingBySlug,
    async getListingsByCategory(slug) {
      return summaries(
        'category-summaries',
        'category-summaries',
        ` AND EXISTS (
          SELECT 1
          FROM listing_categories category_membership
          JOIN categories category ON category.id = category_membership.category_id
          WHERE category_membership.listing_id = l.id
            AND category.site_id = ?
            AND category.slug = ?
            AND category.is_active = 1
        )`,
        [siteId, slug],
        PUBLICATION_ORDER
      )
    },
    getPublicationVersion,
    getPublishedListingPage,
    async getPublishedListings() {
      return summaries('published-summaries', 'published-summaries', '', [], PUBLICATION_ORDER)
    },
    getShellStats,
    async getSitemapListings() {
      return summaries('published-summaries', 'published-summaries', '', [], PUBLICATION_ORDER)
    },
    searchListings
  }
}
