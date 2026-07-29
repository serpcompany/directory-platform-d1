import { describe, expect, it } from 'vitest'
import { scanFeaturedBadge } from './badge-verifier'

const expected = {
  badgeUrls: [
    'https://serp.software/badge/featured-on-serp.software-light.svg',
    'https://serp.software/badge/featured-on-serp.software-dark.svg'
  ],
  listingUrl: 'https://serp.software/products/example.com'
}

describe('badge scanner', () => {
  it('requires the expected image inside a dofollow listing link', () => {
    expect(
      scanFeaturedBadge(
        '<a href="https://serp.software/products/example.com"><img src="https://serp.software/badge/featured-on-serp.software-light.svg"></a>',
        expected
      )
    ).toEqual({ ok: true })
    expect(
      scanFeaturedBadge(
        '<a rel="nofollow" href="https://serp.software/products/example.com"><img src="https://serp.software/badge/featured-on-serp.software-light.svg"></a>',
        expected
      )
    ).toEqual({ ok: false, code: 'nofollow' })
  })

  it('rejects the wrong destination and absent badge', () => {
    expect(
      scanFeaturedBadge(
        '<a href="https://serp.software/"><img src="https://serp.software/badge/featured-on-serp.software-light.svg"></a>',
        expected
      )
    ).toEqual({ ok: false, code: 'wrong_destination' })
    expect(scanFeaturedBadge('<p>No badge</p>', expected)).toEqual({
      ok: false,
      code: 'badge_missing'
    })
  })
})
