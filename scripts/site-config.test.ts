import { resolveCheckedInSiteCategories } from '@thedaviddias/site-contract/categories'
import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { defaultSiteConfig } from '../sites/site-config.default.ts'
import {
  buildSiteEnvironment,
  loadCheckedInSite,
  resolveResolvedSiteConfig,
  resolveSiteArtifactDir,
  validateCheckedInSiteConfig
} from './site-config.ts'

function cloneDefaultSiteConfig() {
  return structuredClone(defaultSiteConfig)
}

describe('loadCheckedInSite', () => {
  it('loads the checked-in serp.software site config', () => {
    const config = loadCheckedInSite('serp.software')

    expect(config.id).toBe('serp.software')
    expect(config.content.listingSource).toEqual({
      approvedOnly: true,
      binding: 'DB',
      databaseName: 'serp-software-local',
      kind: 'd1-listings',
      mode: 'local-d1',
      outputPath: 'data/listings.json',
      siteId: 'serp.software',
      wranglerConfigPath: 'wrangler.jsonc'
    })
    expect(config.site).toMatchObject({
      domain: 'serp.software',
      name: 'SERP Software',
      publicUrl: 'https://serp.software'
    })
    expect(config.build).toMatchObject({
      appPackageName: 'serp.software',
      appOutDir: 'apps/serp.software/out',
      artifactDir: 'dist/sites/serp.software'
    })
    expect(config.routes.listingBasePath).toBe('products')
    expect(config.copy.listingName).toEqual({
      plural: 'products',
      singular: 'product'
    })
    expect(config.copy.submitLabel).toBe('Submit Yours')
    expect(config.features.showBrands).toBe(true)
    expect(config.networkBrandGroup).toBe('all')
    expect(config.analytics?.gtmId).toBe('GTM-W59GNHXF')
    expect(config.social.githubIssueOwner).toBe('serpcompany')
    expect(config.social.githubIssueRepo).toBe('serp.software')
    expect(config.social.githubIssuesUrl).toBe(
      'https://github.com/serpcompany/serp.software/issues'
    )
    expect(config.deploy).toEqual({
      previewConfigPath: 'wrangler.preview.jsonc',
      productionConfigPath: 'wrangler.production.jsonc',
      strategy: 'opennext-cloudflare-worker'
    })
  })

  it('loads serp.software checked-in categories instead of default categories', () => {
    expect(resolveCheckedInSiteCategories('serp.software')).toEqual([
      {
        description: 'Browse adult downloader listings and resources.',
        name: 'Adult',
        slug: 'adult'
      },
      {
        description: 'Browse product launch website listings and resources.',
        name: 'Product Launch Websites',
        slug: 'product-launch-websites'
      },
      {
        name: 'Video Downloaders',
        slug: 'video-downloaders'
      }
    ])
  })

  it('rejects parked site ids that were removed from the active registry', () => {
    for (const siteId of [
      'extensions.serp.co',
      'browserextensions.io',
      'pornvideodownloaders.com',
      'serp.ai',
      'serp.co',
      'serpdownloaders.com'
    ]) {
      expect(() => loadCheckedInSite(siteId)).toThrow(
        `Site "${siteId}" was removed from this repo. Use a supported checked-in site id instead.`
      )
    }
  })

  it('rejects unknown checked-in site ids instead of silently loading default', () => {
    expect(() => loadCheckedInSite('unknown-site')).toThrow(
      'Site "unknown-site" is not an active checked-in site in this repo. Use "default" or a supported checked-in site id instead.'
    )
  })

  it('loads the checked-in default site config when no site id is provided', () => {
    const config = loadCheckedInSite()

    expect(config.id).toBe('default')
    expect(config.site.domain).toBe('example.com')
    expect(config.content.listingSource.kind).toBe('listing-json')
    expect(config.routes.listingBasePath).toBe('listing')
    expect(config.routes.docsBasePath).toBe('docs')
    expect(config.routes.networkBasePath).toBe('network')
    expect(config.routes.brandsBasePath).toBe('brands')
    expect(config.analytics?.gtmId).toBeUndefined()
    expect(config.copy.listingName.singular).toBe('listing')
    expect(config.copy.brandsLabel).toBe('Brands')
    expect(config.copy.docsLabel).toBe('Docs')
    expect(config.copy.networkLabel).toBe('Network')
    expect(config.features.showBrands).toBe(true)
    expect(config.networkBrandGroup).toBeNull()
  })
})

describe('validateCheckedInSiteConfig', () => {
  it('rejects duplicate public route base paths', () => {
    const invalidConfig = cloneDefaultSiteConfig()
    invalidConfig.routes.listingBasePath = invalidConfig.routes.docsBasePath

    let error: unknown

    try {
      validateCheckedInSiteConfig(invalidConfig)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ZodError)
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'routes.listingBasePath cannot reuse "docs" because routes.docsBasePath already uses it.',
          path: ['routes', 'listingBasePath']
        })
      ])
    )
  })

  it('accepts d1-listings source config with build-time snapshot defaults', () => {
    const config = cloneDefaultSiteConfig()
    config.content.listingSource = {
      exportPath: 'tmp/d1/serpdownloaders.com.snapshot.json',
      kind: 'd1-listings'
    }

    const validatedConfig = validateCheckedInSiteConfig(config)

    expect(validatedConfig.content.listingSource).toEqual({
      approvedOnly: true,
      exportPath: 'tmp/d1/serpdownloaders.com.snapshot.json',
      kind: 'd1-listings',
      mode: 'snapshot',
      outputPath: 'data/listings.json',
      wranglerConfigPath: 'wrangler.jsonc'
    })
  })

  it('rejects local d1-listings source config without a database name', () => {
    const config = cloneDefaultSiteConfig()
    config.content.listingSource = {
      kind: 'd1-listings',
      mode: 'local-d1'
    }

    let error: unknown

    try {
      validateCheckedInSiteConfig(config)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ZodError)
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'content.listingSource.databaseName is required when d1-listings mode is "local-d1".',
          path: ['content', 'listingSource', 'databaseName']
        })
      ])
    )
  })

  it('rejects brands route base paths that collide with other public routes', () => {
    const invalidConfig = cloneDefaultSiteConfig()
    invalidConfig.routes.brandsBasePath = invalidConfig.routes.networkBasePath

    let error: unknown

    try {
      validateCheckedInSiteConfig(invalidConfig)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ZodError)
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'routes.brandsBasePath cannot reuse "network" because routes.networkBasePath already uses it.',
          path: ['routes', 'brandsBasePath']
        })
      ])
    )
  })

  it('rejects reserved public route base paths', () => {
    const invalidConfig = cloneDefaultSiteConfig()
    invalidConfig.routes.networkBasePath = 'tools'

    let error: unknown

    try {
      validateCheckedInSiteConfig(invalidConfig)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ZodError)
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'routes.networkBasePath cannot use "tools". /tools is reserved for future first-party tool pages.',
          path: ['routes', 'networkBasePath']
        })
      ])
    )
  })

  it('rejects listing route base paths that collide with sitemap family names', () => {
    const reservedListingPaths = ['pages', 'sitemap'] as const

    for (const listingBasePath of reservedListingPaths) {
      const invalidConfig = cloneDefaultSiteConfig()
      invalidConfig.routes.listingBasePath = listingBasePath

      let error: unknown

      try {
        validateCheckedInSiteConfig(invalidConfig)
      } catch (caughtError) {
        error = caughtError
      }

      expect(error).toBeInstanceOf(ZodError)
      expect((error as ZodError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['routes', 'listingBasePath']
          })
        ])
      )
    }
  })

  it('rejects invalid GTM container ids', () => {
    const invalidConfig = cloneDefaultSiteConfig()
    invalidConfig.analytics = {
      gtmId: 'UA-INVALID'
    }

    let error: unknown

    try {
      validateCheckedInSiteConfig(invalidConfig)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ZodError)
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['analytics', 'gtmId']
        })
      ])
    )
  })

  it('rejects duplicate sitemap group output paths', () => {
    const invalidConfig = cloneDefaultSiteConfig()
    invalidConfig.sitemap.pathByGroup = {
      listings: '/sitemaps/shared.xml',
      pages: '/sitemaps/shared.xml'
    }

    let error: unknown

    try {
      validateCheckedInSiteConfig(invalidConfig)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ZodError)
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'sitemap.pathByGroup.pages cannot reuse "/sitemaps/shared.xml" because sitemap.pathByGroup.listings already uses it.',
          path: ['sitemap', 'pathByGroup', 'pages']
        })
      ])
    )
  })

  it('rejects reserved canonical sitemap output paths for group files', () => {
    const invalidConfig = cloneDefaultSiteConfig()
    invalidConfig.sitemap.pathByGroup = {
      pages: '/sitemap-index.xml'
    }

    let error: unknown

    try {
      validateCheckedInSiteConfig(invalidConfig)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ZodError)
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'sitemap.pathByGroup.pages cannot use reserved sitemap output path "/sitemap-index.xml".',
          path: ['sitemap', 'pathByGroup', 'pages']
        })
      ])
    )
  })

  it('allows static sitemap page paths to be omitted from sitemap output', () => {
    const validConfig = cloneDefaultSiteConfig()
    validConfig.sitemap.staticPagePaths = ['/', '/search']
    validConfig.sitemap.excludedPaths = ['/search']

    expect(() => validateCheckedInSiteConfig(validConfig)).not.toThrow()
  })

  it('accepts a configured featured category route path', () => {
    const validConfig = cloneDefaultSiteConfig()
    validConfig.sitemap.featuredCategoryPath = '/categories/featured'

    expect(() => validateCheckedInSiteConfig(validConfig)).not.toThrow()
  })

  it('rejects static sitemap page paths that are also artifact-excluded', () => {
    const invalidConfig = cloneDefaultSiteConfig()
    invalidConfig.sitemap.staticPagePaths = ['/', '/search']
    invalidConfig.sitemap.artifactExcludedPaths = ['/search']

    let error: unknown

    try {
      validateCheckedInSiteConfig(invalidConfig)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ZodError)
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'sitemap.staticPagePaths cannot also be artifact-excluded: /search.',
          path: ['sitemap', 'staticPagePaths']
        })
      ])
    )
  })

  it('rejects partially configured GitHub issue targets', () => {
    const invalidConfig = cloneDefaultSiteConfig()
    invalidConfig.social.githubIssueOwner = null

    let error: unknown

    try {
      validateCheckedInSiteConfig(invalidConfig)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ZodError)
    expect((error as ZodError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'GitHub issue target fields must either all be configured or all be null.',
          path: ['social', 'githubIssueOwner']
        })
      ])
    )
  })
})

describe('resolveSiteArtifactDir', () => {
  it('resolves the configured artifact directory', () => {
    expect(resolveSiteArtifactDir(loadCheckedInSite('serp.software'))).toBe(
      'dist/sites/serp.software'
    )
  })
})

describe('buildSiteEnvironment', () => {
  it('maps a checked-in site config to the minimal app env contract', () => {
    expect(buildSiteEnvironment(loadCheckedInSite('serp.software'))).toEqual({
      LISTING_ROUTE_BASE_PATH: 'products',
      NEXT_PUBLIC_LISTING_ROUTE_BASE_PATH: 'products',
      NEXT_PUBLIC_SITE_ID: 'serp.software',
      SITE_ID: 'serp.software'
    })
  })
})

describe('resolveResolvedSiteConfig', () => {
  it('resolves the checked-in site config into the app-facing shape', () => {
    expect(resolveResolvedSiteConfig(loadCheckedInSite('serp.software'))).toMatchObject({
      copy: {
        listingName: {
          plural: 'products',
          singular: 'product'
        },
        submitLabel: 'Submit Yours'
      },
      description: 'A searchable directory of downloader products from the SERP network.',
      domain: 'serp.software',
      gtmId: 'GTM-W59GNHXF',
      githubIssueOwner: 'serpcompany',
      githubIssueRepo: 'serp.software',
      githubIssuesUrl: 'https://github.com/serpcompany/serp.software/issues',
      id: 'serp.software',
      networkBrandGroup: 'all',
      docsRouteBasePath: 'docs',
      brandsRouteBasePath: 'brands',
      listingRouteBasePath: 'products',
      name: 'SERP Software',
      networkRouteBasePath: 'network',
      publicUrl: 'https://serp.software',
      tagline: 'Downloader software in one searchable directory.'
    })
  })
})
