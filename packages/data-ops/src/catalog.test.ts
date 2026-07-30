import type { ActiveCheckedInSiteId } from '@serpdirectory/site-contract/active-site-ids'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogCacheEvent, CatalogDataCache, CatalogQueryEvent } from './contracts'
import { MemoryCatalogCache, SqliteD1, seedContractFixture } from './test-support'

vi.mock('server-only', () => ({}))

const { createCatalogOperations } = await import('./catalog')

const now = () => new Date('2026-07-30T00:00:00.000Z')

describe('shared catalog data operations', () => {
  let sqlite: SqliteD1

  beforeAll(() => {
    sqlite = new SqliteD1()
    seedContractFixture(sqlite)
  })

  beforeEach(() => {
    sqlite.database.prepare('UPDATE publication_state SET version = 1').run()
  })

  function operations(
    siteId: ActiveCheckedInSiteId,
    cache: CatalogDataCache = new MemoryCatalogCache()
  ) {
    const events: Array<CatalogCacheEvent | CatalogQueryEvent> = []
    return {
      events,
      operations: createCatalogOperations({
        cache,
        clock: now,
        database: sqlite.asD1Database(),
        observe: event => events.push(event),
        siteId
      })
    }
  }

  it('uses one shared implementation while isolating both sites', async () => {
    const serp = operations('serp.software').operations
    const pvd = operations('pornvideodownloaders.com').operations

    const [serpListings, pvdListings] = await Promise.all([
      serp.getPublishedListings(),
      pvd.getPublishedListings()
    ])

    expect(serpListings).toHaveLength(5)
    expect(pvdListings).toHaveLength(5)
    expect(serpListings.every(listing => listing.website.endsWith('.serp.software'))).toBe(true)
    expect(
      pvdListings.every(listing => listing.website.endsWith('.pornvideodownloaders.com'))
    ).toBe(true)
  })

  it('preserves catalog ordering, pagination, and empty pages', async () => {
    const catalog = operations('serp.software').operations
    expect((await catalog.getPublishedListings()).map(item => item.slug)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
      'echo'
    ])
    const page = await catalog.getPublishedListingPage(2, 2)
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 5 })
    expect(page.items.map(item => item.slug)).toEqual(['charlie', 'delta'])
    expect((await catalog.getPublishedListingPage(99, 2)).items).toEqual([])
  })

  it('keeps summary operations away from detail content and relationship tables', async () => {
    const start = sqlite.statements.length
    await operations('serp.software').operations.getPublishedListingPage(1, 3)
    const statements = sqlite.statements.slice(start)
    expect(statements).toHaveLength(2)
    for (const { sql } of statements) {
      expect(sql).not.toContain('listing_resource_links')
      expect(sql).not.toContain('listing_faqs')
      expect(sql).not.toMatch(/\bl\.content\b/u)
    }
    expect(statements[0]?.sql).toContain("m.kind = 'logo'")
  })

  it('loads one detail projection with deterministic related and boundary navigation', async () => {
    const catalog = operations('serp.software').operations
    const detail = await catalog.getListingBySlug('charlie')
    expect(detail).toMatchObject({
      slug: 'charlie',
      content: 'charlie detail content',
      previousWebsite: { slug: 'bravo' },
      nextWebsite: { slug: 'delta' }
    })
    expect(detail?.resourceLinks).toEqual([
      { label: 'Documentation', url: 'https://docs.example/serp-charlie' }
    ])
    expect(detail?.media?.images).toEqual(['https://assets.example/serp-charlie-image.png'])
    expect(detail?.relatedWebsites.map(item => item.slug)).toEqual([
      'alpha',
      'echo',
      'bravo',
      'delta'
    ])
    expect((await catalog.getListingBySlug('alpha'))?.previousWebsite).toBeNull()
    expect((await catalog.getListingBySlug('echo'))?.nextWebsite).toBeNull()
    expect(await catalog.getListingBySlug('future')).toBeNull()
  })

  it('preserves same-site canonical redirects and rejects missing targets', async () => {
    const catalog = operations('pornvideodownloaders.com').operations
    expect(await catalog.getCanonicalSlugForRedirect('old-bravo')).toBe('bravo')
    expect(await catalog.getCanonicalSlugForRedirect('missing')).toBeNull()
  })

  it('keeps search and autocomplete site-bound and summary-only', async () => {
    const { operations: catalog } = operations('serp.software')
    const start = sqlite.statements.length
    const search = await catalog.searchListings('charlie', 10)
    const autocomplete = await catalog.getAutocomplete('br', 8)
    const statements = sqlite.statements.slice(start)

    expect(search.map(item => item.slug)).toEqual(['charlie'])
    expect(autocomplete.map(item => item.slug)).toEqual(['bravo'])
    expect(
      [...search, ...autocomplete].every(item => item.website.endsWith('.serp.software'))
    ).toBe(true)
    for (const { sql } of statements) {
      expect(sql).not.toContain('listing_resource_links')
      expect(sql).not.toContain('listing_faqs')
      expect(sql).not.toContain("m.kind != 'logo'")
    }
  })

  it('caches shell counts by site and publication version', async () => {
    const cache = new MemoryCatalogCache()
    const serp = operations('serp.software', cache)
    const first = await serp.operations.getShellStats()
    const shellQueriesAfterFirst = serp.events.filter(
      event => event.event === 'd1_query' && event.queryShape === 'shell-stats'
    )
    const second = await serp.operations.getShellStats()

    expect(first).toEqual(second)
    expect(first.featuredCount).toBe(2)
    expect(first.categories.map(category => [category.slug, category.count])).toEqual([
      ['primary', 5],
      ['secondary', 3],
      ['empty', 0]
    ])
    expect(shellQueriesAfterFirst).toHaveLength(1)
    expect(
      serp.events.filter(event => event.event === 'd1_query' && event.queryShape === 'shell-stats')
    ).toHaveLength(1)
    expect(serp.events).toContainEqual({
      event: 'catalog_cache',
      operation: 'shell-stats',
      siteId: 'serp.software',
      state: 'hit'
    })

    sqlite.database
      .prepare("UPDATE publication_state SET version = 2 WHERE site_id = 'serp.software'")
      .run()
    const versioned = await serp.operations.getShellStats()
    expect(versioned.publicationVersion).toBe(2)
    expect(
      serp.events.filter(event => event.event === 'd1_query' && event.queryShape === 'shell-stats')
    ).toHaveLength(2)

    const pvd = operations('pornvideodownloaders.com', cache)
    expect((await pvd.operations.getShellStats()).publicationVersion).toBe(1)
    expect([...cache.values.keys()].some(key => key.includes('pornvideodownloaders.com'))).toBe(
      true
    )
  })

  it('falls back to live D1 when cached shell data is corrupt or unavailable', async () => {
    const corrupt = new MemoryCatalogCache()
    corrupt.values.set('catalog-shell:v1:serp.software:1', { featuredCount: 'wrong' })
    const corruptCatalog = operations('serp.software', corrupt)
    expect((await corruptCatalog.operations.getShellStats()).featuredCount).toBe(2)
    expect(corruptCatalog.events).toContainEqual({
      event: 'catalog_cache',
      operation: 'shell-stats',
      siteId: 'serp.software',
      state: 'corrupt'
    })

    const unavailable = {
      async get() {
        throw new Error('cache unavailable')
      },
      async put() {
        throw new Error('cache unavailable')
      }
    }
    const unavailableCatalog = operations('serp.software', unavailable)
    expect((await unavailableCatalog.operations.getShellStats()).featuredCount).toBe(2)
    expect(unavailableCatalog.events).toContainEqual({
      event: 'catalog_cache',
      operation: 'shell-stats',
      siteId: 'serp.software',
      state: 'error'
    })
    expect(unavailableCatalog.events).toContainEqual({
      event: 'catalog_cache',
      operation: 'shell-stats',
      siteId: 'serp.software',
      state: 'write-error'
    })
  })

  it('emits attributable query metadata without SQL, bindings, or visitor data', async () => {
    const { events, operations: catalog } = operations('serp.software')
    await catalog.getPublishedListings()
    const queryEvent = events.find(
      (event): event is CatalogQueryEvent => event.event === 'd1_query'
    )
    expect(queryEvent).toMatchObject({
      event: 'd1_query',
      operation: 'published-summaries',
      queryShape: 'published-summaries',
      rowsWritten: 0,
      siteId: 'serp.software',
      success: true
    })
    expect(queryEvent).not.toHaveProperty('sql')
    expect(queryEvent).not.toHaveProperty('bindings')
    expect(queryEvent).not.toHaveProperty('requestId')
  })
})
