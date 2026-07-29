import { getSiteRootListingAliases } from '@thedaviddias/site-contract/site-root-listing-aliases'

describe('site root listing aliases', () => {
  it('does not derive D1-backed root aliases from retired JSON inputs', () => {
    const aliases = getSiteRootListingAliases('serp.software')

    expect(aliases).toEqual([])
  })

  it('derives root-path aliases from listing-json sources too', () => {
    const aliases = getSiteRootListingAliases('default')

    expect(aliases.length).toBeGreaterThan(0)
    expect(aliases).not.toContain('about')
  })
})
