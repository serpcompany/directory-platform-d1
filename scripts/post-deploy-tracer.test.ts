import { describe, expect, it } from 'vitest'
import { runPostDeployTracer } from './post-deploy-tracer'

const evidence = {
  environment: 'production',
  releaseMode: 'worker-only',
  runUrl: 'https://github.com/serpcompany/directory-platform-d1/actions/runs/123',
  siteId: 'serp.software',
  sourceSha: '0123456789abcdef0123456789abcdef01234567'
}

function response(body: string, status: number, url: string): Response {
  const result = new Response(body, { status })
  Object.defineProperty(result, 'url', { value: url })
  return result
}

const validHome =
  '<html><head><link rel="canonical" href="https://serp.software/">' +
  '<meta name="robots" content="index, follow"></head><body><h1>SERP Software</h1>' +
  '<a href="/products/example-downloader/">Example</a></body></html>'
const validListing =
  '<html><head><link rel="canonical" ' +
  'href="https://serp.software/products/example-downloader/">' +
  '<meta name="robots" content="index, follow"></head><body><h1>Example</h1></body></html>'
const validSitemap =
  '<urlset><url><loc>https://serp.software/products/example-downloader/</loc></url></urlset>'

async function runSerpJourney(
  overrides: Partial<Record<'home' | 'listing' | 'sitemap', Response>>
) {
  return runPostDeployTracer(
    evidence,
    async (input, init) => {
      expect(init?.redirect).toBe('follow')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      const url = String(input)
      if (url === 'https://serp.software/') return overrides.home ?? response(validHome, 200, url)
      if (url === 'https://serp.software/products/example-downloader/')
        return overrides.listing ?? response(validListing, 200, url)
      if (url === 'https://serp.software/listings-sitemap.xml')
        return overrides.sitemap ?? response(validSitemap, 200, url)
      throw new Error(`Unexpected request: ${url}`)
    },
    { attempts: 1 }
  )
}

describe('post-deployment Visitor tracer', () => {
  it('rejects an unknown Site before making a request', async () => {
    let requested = false
    await expect(
      runPostDeployTracer(
        {
          environment: 'production',
          releaseMode: 'worker-only',
          runUrl: 'https://github.com/serpcompany/directory-platform-d1/actions/runs/123',
          siteId: 'example.com',
          sourceSha: '0123456789abcdef0123456789abcdef01234567'
        },
        async () => {
          requested = true
          return new Response('', { status: 200 })
        }
      )
    ).rejects.toThrow('registered executable-Site rule')
    expect(requested).toBe(false)
  })

  it('rejects a non-production environment before making a request', async () => {
    let requested = false

    await expect(
      runPostDeployTracer(
        {
          environment: 'preview' as never,
          releaseMode: 'worker-only',
          runUrl: 'https://github.com/serpcompany/directory-platform-d1/actions/runs/123',
          siteId: 'serp.software',
          sourceSha: '0123456789abcdef0123456789abcdef01234567'
        },
        async () => {
          requested = true
          return new Response('', { status: 200 })
        }
      )
    ).rejects.toThrow('production-only environment rule')
    expect(requested).toBe(false)
  })

  it('retries a transient home failure before proving the journey', async () => {
    let homeAttempts = 0
    const result = await runPostDeployTracer(
      {
        environment: 'production',
        releaseMode: 'database-and-worker',
        runUrl: 'https://github.com/serpcompany/directory-platform-d1/actions/runs/456',
        siteId: 'pornvideodownloaders.com',
        sourceSha: 'abcdef0123456789abcdef0123456789abcdef01'
      },
      async input => {
        const url = String(input)
        if (url === 'https://pornvideodownloaders.com/') {
          homeAttempts += 1
          if (homeAttempts === 1) return new Response('unavailable', { status: 503 })
          return new Response(
            '<html><head><link rel="canonical" href="https://pornvideodownloaders.com/">' +
              '<meta name="robots" content="index, follow"></head><body>' +
              '<h1>Porn Video Downloaders</h1>' +
              '<a href="/products/example-video-downloader/">Example</a></body></html>',
            { status: 200 }
          )
        }
        if (url === 'https://pornvideodownloaders.com/products/example-video-downloader/') {
          return new Response(
            '<html><head><link rel="canonical" ' +
              'href="https://pornvideodownloaders.com/products/example-video-downloader/">' +
              '<meta name="robots" content="index, follow"></head></html>',
            { status: 200 }
          )
        }
        if (url === 'https://pornvideodownloaders.com/listings-sitemap.xml') {
          return new Response(
            '<urlset><url><loc>https://pornvideodownloaders.com/products/' +
              'example-video-downloader/</loc></url></urlset>',
            { status: 200 }
          )
        }
        throw new Error(`Unexpected request: ${url}`)
      },
      { sleep: async () => undefined }
    )

    expect(result.outcome).toBe('passed')
    expect(homeAttempts).toBe(2)
  })

  it('fails after the bounded retry count when the deployed home remains unavailable', async () => {
    let attempts = 0
    const result = await runPostDeployTracer(
      {
        environment: 'production',
        releaseMode: 'worker-only',
        runUrl: 'https://github.com/serpcompany/directory-platform-d1/actions/runs/789',
        siteId: 'serp.software',
        sourceSha: '0123456789abcdef0123456789abcdef01234567'
      },
      async () => {
        attempts += 1
        return new Response('unavailable', { status: 503 })
      },
      { attempts: 3, retryDelayMs: 0, sleep: async () => undefined }
    )
    expect(result).toMatchObject({
      attempts: 3,
      error: { code: 'journey_failed', message: expect.stringContaining('public home contract') },
      outcome: 'failed'
    })
    expect(attempts).toBe(3)
  })

  it('rejects a noindex home before requesting a Listing', async () => {
    const requests: string[] = []
    const result = await runPostDeployTracer(
      {
        environment: 'production',
        releaseMode: 'worker-only',
        runUrl: 'https://github.com/serpcompany/directory-platform-d1/actions/runs/999',
        siteId: 'serp.software',
        sourceSha: '0123456789abcdef0123456789abcdef01234567'
      },
      async input => {
        requests.push(String(input))
        return new Response(
          '<html><head><link rel="canonical" href="https://serp.software/">' +
            '<meta name="googlebot" content="noindex, follow"></head><body>' +
            '<h1>SERP Software</h1><a href="https://outside.example/products/wrong/">Wrong</a>' +
            '</body></html>',
          { status: 200 }
        )
      },
      { attempts: 1 }
    )
    expect(result).toMatchObject({
      error: { code: 'journey_failed', message: expect.stringContaining('public home contract') },
      outcome: 'failed'
    })
    expect(requests).toEqual(['https://serp.software/'])
  })

  it.each([
    {
      name: 'missing Listing link',
      overrides: {
        home: response(
          validHome.replace(
            '/products/example-downloader/',
            'https://outside.example/products/wrong/'
          ),
          200,
          'https://serp.software/'
        )
      },
      rule: 'home-to-Listing discovery rule'
    },
    {
      name: 'Listing failure',
      overrides: {
        listing: response('unavailable', 503, 'https://serp.software/products/example-downloader/')
      },
      rule: 'public Listing contract'
    },
    {
      name: 'cross-origin Listing redirect',
      overrides: {
        listing: response(validListing, 200, 'https://outside.example/products/example-downloader/')
      },
      rule: 'same-origin response rule'
    },
    {
      name: 'Listing canonical mismatch',
      overrides: {
        listing: response(
          validListing.replace('example-downloader/', 'different-downloader/'),
          200,
          'https://serp.software/products/example-downloader/'
        )
      },
      rule: 'public Listing contract'
    },
    {
      name: 'Listing noindex',
      overrides: {
        listing: response(
          validListing.replace('index, follow', 'noindex, follow'),
          200,
          'https://serp.software/products/example-downloader/'
        )
      },
      rule: 'public Listing contract'
    },
    {
      name: 'missing sitemap membership',
      overrides: {
        sitemap: response(
          '<urlset><url><loc>https://serp.software/products/other/</loc></url></urlset>',
          200,
          'https://serp.software/listings-sitemap.xml'
        )
      },
      rule: 'Listing sitemap-membership contract'
    }
  ])('records bounded failure evidence for $name', async ({ overrides, rule }) => {
    const result = await runSerpJourney(overrides)
    expect(result.outcome).toBe('failed')
    if (result.outcome !== 'failed') throw new Error('Expected failed evidence')
    expect(result.error.message).toContain(rule)
    expect(result.error.message.length).toBeLessThanOrEqual(500)
    expect(JSON.stringify(result)).not.toContain('unavailable')
  })

  it('proves a live home to Listing to sitemap journey for the selected Site', async () => {
    const responses = new Map<string, Response>([
      [
        'https://serp.software/',
        new Response(
          '<html><head><link rel="canonical" href="https://serp.software/">' +
            '<meta name="robots" content="index, follow"></head><body>' +
            '<h1>SERP Software</h1><a href="/products/example-downloader/">Example</a>' +
            '</body></html>',
          { status: 200 }
        )
      ],
      [
        'https://serp.software/products/example-downloader/',
        new Response(
          '<html><head><link rel="canonical" ' +
            'href="https://serp.software/products/example-downloader/">' +
            '<meta name="robots" content="index, follow"></head><body>' +
            '<h1>Example Downloader</h1></body></html>',
          { status: 200 }
        )
      ],
      [
        'https://serp.software/listings-sitemap.xml',
        new Response(
          '<?xml version="1.0"?><urlset><url><loc>' +
            'https://serp.software/products/example-downloader/</loc></url></urlset>',
          { status: 200 }
        )
      ]
    ])

    const result = await runPostDeployTracer(
      {
        environment: 'production',
        releaseMode: 'worker-only',
        runUrl: 'https://github.com/serpcompany/directory-platform-d1/actions/runs/123',
        siteId: 'serp.software',
        sourceSha: '0123456789abcdef0123456789abcdef01234567'
      },
      async input => {
        const url = String(input)
        const response = responses.get(url)
        if (!response) throw new Error(`Unexpected request: ${url}`)
        return response.clone()
      }
    )

    expect(result).toMatchObject({
      environment: 'production',
      listingUrl: 'https://serp.software/products/example-downloader/',
      outcome: 'passed',
      releaseMode: 'worker-only',
      runUrl: 'https://github.com/serpcompany/directory-platform-d1/actions/runs/123',
      siteId: 'serp.software',
      sourceSha: '0123456789abcdef0123456789abcdef01234567',
      observations: {
        home: {
          canonical: 'https://serp.software/',
          finalUrl: 'https://serp.software/',
          indexable: true,
          status: 200
        },
        listing: {
          canonical: 'https://serp.software/products/example-downloader/',
          finalUrl: 'https://serp.software/products/example-downloader/',
          indexable: true,
          status: 200
        },
        sitemap: {
          containsListing: true,
          finalUrl: 'https://serp.software/listings-sitemap.xml',
          status: 200
        }
      }
    })
    expect(Date.parse(result.startedAt)).not.toBeNaN()
    expect(Date.parse(result.finishedAt)).not.toBeNaN()
  })
})
