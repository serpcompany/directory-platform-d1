import { getSiteRootListingAliases } from '@thedaviddias/site-contract/site-root-listing-aliases'

describe('site root listing aliases', () => {
  it('returns root-path aliases for all serp.software product slugs', () => {
    const aliases = getSiteRootListingAliases('serp.software')

    expect(aliases).toContain('instagram-downloader')
    expect(aliases).toContain('getty-images-downloader')
    expect(aliases).toContain('teachable-video-downloader')
    expect(aliases).not.toContain('about')
  })

  it('derives root-path aliases from listing-json sources too', () => {
    const aliases = getSiteRootListingAliases('default')

    expect(aliases.length).toBeGreaterThan(0)
    expect(aliases).not.toContain('about')
  })
})
