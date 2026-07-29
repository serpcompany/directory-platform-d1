import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectLegacySite } from './migration/preflight.ts'

function sourceFixture(): { root: string; site: string } {
  const root = mkdtempSync(resolve(tmpdir(), 'directory-migration-'))
  const site = 'example.com'
  const siteDirectory = resolve(root, 'sites', site)
  mkdirSync(resolve(siteDirectory, 'assets'), { recursive: true })
  writeFileSync(resolve(siteDirectory, 'README.md'), '# Source\n')
  writeFileSync(resolve(siteDirectory, 'site-config.ts'), 'export const config = {}\n')
  writeFileSync(resolve(siteDirectory, 'site-content.ts'), 'export const content = {}\n')
  writeFileSync(
    resolve(siteDirectory, 'categories.json'),
    JSON.stringify([{ slug: 'video-tools', name: 'Video tools', description: 'Video products.' }])
  )
  writeFileSync(
    resolve(siteDirectory, 'products.json'),
    JSON.stringify({
      'example-tool': {
        product: {
          categories: ['video-tools'],
          productPage: 'https://example.com/tool',
          slug: 'example-tool',
          tagline: 'A complete product description.',
          title: 'Example Tool'
        },
        content: { body: '## Overview\n\nUseful product.' },
        media: { images: ['https://example.com/image.png'] },
        relatedLinks: [{ label: 'Docs', url: 'https://example.com/docs' }]
      }
    })
  )
  return { root, site }
}

describe('legacy migration preflight', () => {
  it('produces a deterministic, read-only inventory for a coherent source', () => {
    const fixture = sourceFixture()
    const report = inspectLegacySite(fixture.root, fixture.site, '2026-07-30T00:00:00.000Z')

    expect(report).toEqual(
      expect.objectContaining({
        categoryCount: 1,
        generatedAt: '2026-07-30T00:00:00.000Z',
        issues: [],
        listingCount: 1,
        readyForMapping: true,
        siteId: 'example.com',
        supportingFiles: {
          assets: true,
          readme: true,
          siteConfig: true,
          siteContent: true
        },
        warnings: []
      })
    )
    expect(report.checksums.categories).toMatch(/^[a-f0-9]{64}$/u)
    expect(report.checksums.products).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('reports mismatched slugs and unresolved category memberships', () => {
    const fixture = sourceFixture()
    writeFileSync(
      resolve(fixture.root, 'sites', fixture.site, 'products.json'),
      JSON.stringify({
        'map-key': {
          product: {
            categories: ['missing-category'],
            productPage: 'not-a-url',
            slug: 'declared-slug',
            tagline: '',
            title: ''
          }
        }
      })
    )

    const report = inspectLegacySite(fixture.root, fixture.site)
    expect(report.readyForMapping).toBe(false)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'Product map-key declares mismatched slug declared-slug.',
        'Product map-key references missing category missing-category.',
        'Product map-key has an invalid productPage URL.',
        'Product map-key has no tagline.',
        'Product map-key has no title.'
      ])
    )
  })
})
