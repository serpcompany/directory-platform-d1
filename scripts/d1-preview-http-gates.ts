import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { resolveSiteTarget } from './site-targets'

async function expectRoute(baseUrl: URL, path: string): Promise<void> {
  const response = await fetch(new URL(path, baseUrl), { redirect: 'manual' })
  if (response.status < 200 || response.status >= 400)
    throw new Error(`Preview route ${path} returned ${response.status}.`)
}

export async function runPreviewHttpGates(siteValue: string, baseUrlValue: string): Promise<void> {
  const target = resolveSiteTarget(siteValue)
  const baseUrl = new URL(baseUrlValue)
  if (baseUrl.protocol !== 'https:' || baseUrl.hostname === target.siteId)
    throw new Error('Preview gates require an HTTPS non-Production hostname.')
  const report = parse(readFileSync(resolve(target.parityReportPath), 'utf8')) as {
    parity: { categories: Array<{ slug: string }>; exactSlugSet: string[] }
  }
  const listingSlug = report.parity.exactSlugSet[0]
  const categorySlug = report.parity.categories[0]?.slug
  if (!listingSlug || !categorySlug) throw new Error('Reviewed parity samples are empty.')
  await Promise.all([
    expectRoute(baseUrl, '/'),
    expectRoute(baseUrl, `/categories/${categorySlug}/`),
    expectRoute(baseUrl, `/products/${listingSlug}/`),
    expectRoute(baseUrl, `/api/search?q=${encodeURIComponent(listingSlug)}`),
    expectRoute(baseUrl, '/rss.xml'),
    expectRoute(baseUrl, '/sitemap-index.xml'),
    expectRoute(baseUrl, `/${listingSlug}/`),
    expectRoute(baseUrl, '/submit/')
  ])
}

async function main(): Promise<void> {
  const [siteValue, baseUrlValue, output] = process.argv.slice(2)
  if (!siteValue || !baseUrlValue)
    throw new Error('Usage: d1-preview-http-gates.ts <site> <https-preview-base-url> [output]')
  await runPreviewHttpGates(siteValue, baseUrlValue)
  if (output)
    writeFileSync(
      resolve(output),
      `${JSON.stringify({ home: true, category: true, detail: true, search: true, rss: true, sitemap: true, legacyRedirect: true })}\n`
    )
}
void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
