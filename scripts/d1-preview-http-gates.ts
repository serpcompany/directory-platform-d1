import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { resolveSiteTarget } from './site-targets'

export type HttpGateMode = 'preview' | 'production'

function parseMode(value: string): HttpGateMode {
  if (value === 'preview' || value === 'production') return value
  throw new Error('HTTP gate mode must be exactly preview or production.')
}

function validateBaseUrl(mode: HttpGateMode, siteId: string, value: string): URL {
  const baseUrl = new URL(value)
  if (
    baseUrl.protocol !== 'https:' ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.port ||
    baseUrl.pathname !== '/' ||
    baseUrl.search ||
    baseUrl.hash
  )
    throw new Error(
      `${mode} gates require a clean HTTPS origin with no credentials, port, path, query, or hash.`
    )
  if (mode === 'production' && baseUrl.hostname !== siteId)
    throw new Error(`Production gates require the exact https://${siteId} origin.`)
  if (mode === 'preview' && baseUrl.hostname === siteId)
    throw new Error('Preview gates reject the Production hostname.')
  return baseUrl
}

function routeUrl(baseUrl: URL, path: string): URL {
  const url = new URL(path, baseUrl)
  if (url.origin !== baseUrl.origin || url.username || url.password || url.hash)
    throw new Error(`HTTP gate route ${path} escaped the configured origin.`)
  return url
}

async function expectRoute(mode: HttpGateMode, baseUrl: URL, path: string): Promise<void> {
  const response = await fetch(routeUrl(baseUrl, path), { redirect: 'manual' })
  if (response.status < 200 || response.status >= 300)
    throw new Error(`${mode} route ${path} returned ${response.status}.`)
  if (!(await response.text()).trim())
    throw new Error(`${mode} route ${path} returned an empty body.`)
}

async function expectLegacyRedirect(
  mode: HttpGateMode,
  baseUrl: URL,
  legacyPath: string,
  expectedPath: string
): Promise<void> {
  const response = await fetch(routeUrl(baseUrl, legacyPath), { redirect: 'manual' })
  if (![301, 302, 303, 307, 308].includes(response.status))
    throw new Error(
      `${mode} legacy route ${legacyPath} returned ${response.status}, not a redirect.`
    )
  const location = response.headers.get('location')
  const expected = routeUrl(baseUrl, expectedPath)
  const observed = location ? new URL(location, baseUrl) : undefined
  if (
    !observed ||
    observed.origin !== expected.origin ||
    observed.pathname !== expected.pathname ||
    observed.search !== expected.search ||
    observed.hash !== expected.hash ||
    observed.username ||
    observed.password
  )
    throw new Error(`${mode} legacy route ${legacyPath} did not redirect to ${expectedPath}.`)
}

export async function runHttpGates(
  modeValue: string,
  siteValue: string,
  baseUrlValue: string
): Promise<void> {
  const mode = parseMode(modeValue)
  const target = resolveSiteTarget(siteValue)
  const baseUrl = validateBaseUrl(mode, target.siteId, baseUrlValue)
  const report = parse(readFileSync(resolve(target.parityReportPath), 'utf8')) as {
    parity: { categories: Array<{ slug: string }>; exactSlugSet: string[] }
  }
  const listingSlug = report.parity.exactSlugSet[0]
  const categorySlug = report.parity.categories[0]?.slug
  if (!listingSlug || !categorySlug) throw new Error('Reviewed parity samples are empty.')
  await Promise.all([
    expectRoute(mode, baseUrl, '/'),
    expectRoute(mode, baseUrl, `/categories/${categorySlug}/`),
    expectRoute(mode, baseUrl, `/products/${listingSlug}/`),
    expectRoute(mode, baseUrl, `/api/search?q=${encodeURIComponent(listingSlug)}`),
    expectRoute(mode, baseUrl, '/rss.xml'),
    expectRoute(mode, baseUrl, '/sitemap-index.xml'),
    expectLegacyRedirect(mode, baseUrl, `/${listingSlug}/`, `/products/${listingSlug}/`),
    expectRoute(mode, baseUrl, '/submit/')
  ])
}

export async function runPreviewHttpGates(siteValue: string, baseUrlValue: string): Promise<void> {
  return runHttpGates('preview', siteValue, baseUrlValue)
}

async function main(): Promise<void> {
  const [modeValue, siteValue, baseUrlValue, output] = process.argv.slice(2)
  if (!modeValue || !siteValue || !baseUrlValue)
    throw new Error(
      'Usage: d1-preview-http-gates.ts <preview|production> <site> <clean-https-origin> [output]'
    )
  await runHttpGates(modeValue, siteValue, baseUrlValue)
  if (output)
    writeFileSync(
      resolve(output),
      `${JSON.stringify({ home: true, category: true, detail: true, search: true, rss: true, sitemap: true, legacyRedirect: true, submit: true })}\n`
    )
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
