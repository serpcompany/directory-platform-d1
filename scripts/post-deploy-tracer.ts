import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCheckedInSiteConfig } from '@serpdirectory/site-contract'
import { parseSitemapLocs } from './audit-sitemaps'
import { resolveSiteTarget, type SiteId } from './site-targets'

type ReleaseMode = 'database-and-worker' | 'worker-only'

interface ReleaseEvidenceContext {
  environment: 'production'
  releaseMode: ReleaseMode
  runUrl: string
  siteId: SiteId
  sourceSha: string
}

export interface PostDeployTracerOptions {
  environment: string
  releaseMode: string
  runUrl: string
  siteId: string
  sourceSha: string
}

interface PageObservation {
  canonical: string
  finalUrl: string
  indexable: boolean
  status: number
}

interface JourneyProgress {
  listingUrl?: string
  observations: {
    home?: PageObservation
    listing?: PageObservation
    sitemap?: { containsListing: boolean; finalUrl: string; status: number }
  }
}

export interface PostDeployTracerResult {
  environment: 'production'
  finishedAt: string
  listingUrl: string
  observations: {
    home: PageObservation
    listing: PageObservation
    sitemap: { containsListing: boolean; finalUrl: string; status: number }
  }
  outcome: 'passed'
  releaseMode: string
  runUrl: string
  siteId: string
  sourceSha: string
  startedAt: string
}

export interface PostDeployTracerFailure {
  attempts: number
  environment: 'production'
  error: { code: 'journey_failed'; message: string }
  finishedAt: string
  listingUrl?: string
  observations: JourneyProgress['observations']
  outcome: 'failed'
  releaseMode: string
  runUrl: string
  siteId: string
  sourceSha: string
  startedAt: string
}

export type PostDeployTracerEvidence = PostDeployTracerResult | PostDeployTracerFailure

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

interface TracerDependencies {
  attempts?: number
  retryDelayMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  timeoutMs?: number
}

function tracerFailure(rule: string, impact: string, remediation: string): Error {
  return new Error(
    `Post-deploy tracer violated ${rule}. ${impact} ${remediation} See docs/DEPLOY_RUNBOOK.md.`
  )
}

function parseReleaseEvidence(options: PostDeployTracerOptions): ReleaseEvidenceContext {
  if (options.environment !== 'production') {
    throw tracerFailure(
      'the production-only environment rule',
      `Received environment "${options.environment}", so the evidence could be attributed to the wrong release target.`,
      'Use local or preview validation for non-production targets and invoke this tracer only after a production deploy.'
    )
  }
  let siteTarget: ReturnType<typeof resolveSiteTarget>
  try {
    siteTarget = resolveSiteTarget(options.siteId)
  } catch {
    throw tracerFailure(
      'the registered executable-Site rule',
      `Received Site "${options.siteId}", which is not an executable release target; probing it could misattribute production evidence.`,
      'Pass an exact Site from scripts/site-targets.ts at the protected workflow call site.'
    )
  }
  if (options.releaseMode !== 'worker-only' && options.releaseMode !== 'database-and-worker') {
    throw tracerFailure(
      'the registered release-mode rule',
      `Received release mode "${options.releaseMode}", so the evidence cannot describe the deployment path.`,
      'Pass worker-only or database-and-worker from the protected deployment workflow.'
    )
  }
  if (!/^[a-f0-9]{40}$/u.test(options.sourceSha)) {
    throw tracerFailure(
      'the exact source-SHA rule',
      'The source revision is not a 40-character lowercase Git SHA, so the observation cannot be correlated with reviewed code.',
      'Pass the workflow github.sha value as POST_DEPLOY_SOURCE_SHA.'
    )
  }
  let runUrl: URL
  try {
    runUrl = new URL(options.runUrl)
  } catch {
    throw tracerFailure(
      'the workflow-run URL rule',
      'The run URL is not absolute, so the observation cannot point back to its release record.',
      'Construct POST_DEPLOY_RUN_URL from github.server_url, github.repository, and github.run_id.'
    )
  }
  if (runUrl.protocol !== 'https:' || !/\/actions\/runs\/\d+\/?$/u.test(runUrl.pathname)) {
    throw tracerFailure(
      'the workflow-run URL rule',
      `Received "${options.runUrl}", which is not an HTTPS GitHub Actions run URL.`,
      'Construct POST_DEPLOY_RUN_URL from github.server_url, github.repository, and github.run_id.'
    )
  }
  return {
    environment: 'production',
    releaseMode: options.releaseMode,
    runUrl: runUrl.href,
    siteId: siteTarget.siteId,
    sourceSha: options.sourceSha
  }
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu'))
  return match?.[1] ?? match?.[2]
}

function canonicalFromHtml(html: string, baseUrl: string): string | undefined {
  for (const match of html.matchAll(/<link\b[^>]*>/giu)) {
    const tag = match[0]
    if (attribute(tag, 'rel')?.toLowerCase().split(/\s+/u).includes('canonical')) {
      const href = attribute(tag, 'href')
      if (!href) return undefined
      try {
        return new URL(href, baseUrl).href
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

function robotsDirectivesFromHtml(html: string): string[] {
  const directives: string[] = []
  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    const tag = match[0]
    const name = attribute(tag, 'name')?.toLowerCase()
    if (name === 'robots' || name === 'googlebot') directives.push(attribute(tag, 'content') ?? '')
  }
  return directives
}

function isIndexable(html: string, response: Response): boolean {
  const directives = [
    ...robotsDirectivesFromHtml(html),
    ...(response.headers.get('x-robots-tag')?.split(';') ?? [])
  ]
    .flatMap(value => value.toLowerCase().split(/[\s,]+/u))
    .filter(Boolean)
  return !directives.includes('noindex') && !directives.includes('none')
}

function hasSiteHeading(html: string, siteName: string): boolean {
  const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<h1\\b[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/h1>`, 'iu').test(html)
}

function listingUrlFromHtml(
  html: string,
  origin: string,
  listingBasePath: string
): string | undefined {
  const listingPattern = new RegExp(`^/${listingBasePath.replace(/^\/+|\/+$/gu, '')}/[^/]+/$`, 'u')
  for (const match of html.matchAll(/<a\b[^>]*>/giu)) {
    const href = attribute(match[0], 'href')
    if (!href) continue
    try {
      const candidate = new URL(href, origin)
      if (candidate.origin === origin && listingPattern.test(candidate.pathname))
        return candidate.href
    } catch {}
  }
  return undefined
}

function pageObservation(response: Response, requestedUrl: string, html: string): PageObservation {
  const finalUrl = response.url || requestedUrl
  return {
    canonical: canonicalFromHtml(html, finalUrl) ?? '',
    finalUrl,
    indexable: isIndexable(html, response),
    status: response.status
  }
}

function assertExpectedOrigin(value: string, origin: string, label: string): void {
  if (new URL(value).origin !== origin) {
    throw tracerFailure(
      'the same-origin response rule',
      `${label} ended at ${value}, outside ${origin}; this could expose cross-Site or redirected evidence.`,
      'Inspect the deployed route and canonical routing before rerunning the authorized release.'
    )
  }
}

async function fetchText(
  fetcher: Fetcher,
  url: string,
  timeoutMs: number
): Promise<{
  response: Response
  text: string
}> {
  const response = await fetcher(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs)
  })
  return { response, text: await response.text() }
}

async function observeJourney(
  release: ReleaseEvidenceContext,
  fetcher: Fetcher,
  timeoutMs: number,
  progress: JourneyProgress
): Promise<Omit<PostDeployTracerResult, 'finishedAt' | 'startedAt'>> {
  const siteConfig = resolveCheckedInSiteConfig(release.siteId)
  const origin = new URL(siteConfig.site.publicUrl).origin
  const homeUrl = `${origin}/`
  const homeFetch = await fetchText(fetcher, homeUrl, timeoutMs)
  const home = pageObservation(homeFetch.response, homeUrl, homeFetch.text)
  progress.observations.home = home
  assertExpectedOrigin(home.finalUrl, origin, 'Home response')
  if (
    home.status !== 200 ||
    home.finalUrl !== homeUrl ||
    home.canonical !== homeUrl ||
    !home.indexable ||
    !hasSiteHeading(homeFetch.text, siteConfig.site.name)
  ) {
    throw tracerFailure(
      'the public home contract',
      `The ${release.siteId} home response was not a 200, same-origin, indexable document with its configured H1 and canonical; Visitors or crawlers may not reach the selected Site correctly.`,
      'Inspect the home response, deployment logs, canonical metadata, and robots directives before rerunning the release.'
    )
  }
  const listingUrl = listingUrlFromHtml(homeFetch.text, origin, siteConfig.routes.listingBasePath)
  if (!listingUrl)
    throw tracerFailure(
      'the home-to-Listing discovery rule',
      `The ${release.siteId} home page exposed no same-origin Listing link under its configured route, so a Visitor discovery path is missing.`,
      'Inspect the deployed home catalog and Listing-link rendering before rerunning the release.'
    )
  progress.listingUrl = listingUrl

  const listingFetch = await fetchText(fetcher, listingUrl, timeoutMs)
  const listing = pageObservation(listingFetch.response, listingUrl, listingFetch.text)
  progress.observations.listing = listing
  assertExpectedOrigin(listing.finalUrl, origin, 'Listing response')
  if (listing.status !== 200 || listing.canonical !== listing.finalUrl || !listing.indexable) {
    throw tracerFailure(
      'the public Listing contract',
      `${listingUrl} was not a 200, same-origin, indexable document with a canonical matching its final URL; Visitors or crawlers may see an invalid Listing.`,
      'Inspect the selected Listing response, redirect, canonical metadata, and robots directives before rerunning the release.'
    )
  }
  const sitemapUrl = `${origin}/listings-sitemap.xml`
  const sitemapFetch = await fetchText(fetcher, sitemapUrl, timeoutMs)
  const sitemapFinalUrl = sitemapFetch.response.url || sitemapUrl
  assertExpectedOrigin(sitemapFinalUrl, origin, 'Listing sitemap response')
  const containsListing = parseSitemapLocs(sitemapFetch.text).includes(listing.canonical)
  progress.observations.sitemap = {
    containsListing,
    finalUrl: sitemapFinalUrl,
    status: sitemapFetch.response.status
  }
  if (sitemapFetch.response.status !== 200 || !containsListing) {
    throw tracerFailure(
      'the Listing sitemap-membership contract',
      `The Listing sitemap did not return 200 with ${listing.canonical} as an exact decoded location, so crawler discovery disagrees with the Visitor journey.`,
      'Inspect the deployed Listing sitemap and Publication eligibility before rerunning the release.'
    )
  }

  return {
    environment: 'production',
    listingUrl,
    observations: {
      home,
      listing,
      sitemap: { containsListing, finalUrl: sitemapFinalUrl, status: sitemapFetch.response.status }
    },
    outcome: 'passed',
    releaseMode: release.releaseMode,
    runUrl: release.runUrl,
    siteId: release.siteId,
    sourceSha: release.sourceSha
  }
}

export async function runPostDeployTracer(
  options: PostDeployTracerOptions,
  fetcher: Fetcher = fetch,
  dependencies: TracerDependencies = {}
): Promise<PostDeployTracerEvidence> {
  const release = parseReleaseEvidence(options)
  const startedAt = new Date().toISOString()
  const attempts = dependencies.attempts ?? 3
  const retryDelayMs = dependencies.retryDelayMs ?? 5_000
  const sleep =
    dependencies.sleep ?? (milliseconds => new Promise(done => setTimeout(done, milliseconds)))
  const timeoutMs = dependencies.timeoutMs ?? 10_000
  let lastError: unknown
  let lastProgress: JourneyProgress = { observations: {} }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const progress: JourneyProgress = { observations: {} }
    try {
      return {
        ...(await observeJourney(release, fetcher, timeoutMs, progress)),
        finishedAt: new Date().toISOString(),
        startedAt
      }
    } catch (error) {
      lastError = error
      lastProgress = progress
      if (attempt < attempts) await sleep(retryDelayMs)
    }
  }
  const lastMessage = lastError instanceof Error ? lastError.message : String(lastError)
  return {
    attempts,
    environment: 'production',
    error: { code: 'journey_failed', message: lastMessage.slice(0, 500) },
    finishedAt: new Date().toISOString(),
    listingUrl: lastProgress.listingUrl,
    observations: lastProgress.observations,
    outcome: 'failed',
    releaseMode: release.releaseMode,
    runUrl: release.runUrl,
    siteId: release.siteId,
    sourceSha: release.sourceSha,
    startedAt
  }
}

function valueFor(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

function requireEvidenceValue(value: string | undefined, name: string): string {
  if (value?.trim()) return value
  throw tracerFailure(
    `the required ${name} boundary`,
    'Missing release metadata prevents the observation from being attributed to an exact protected deployment.',
    'Supply the documented non-secret workflow input before invoking the tracer.'
  )
}

export function parsePostDeployTracerOptions(
  args: string[],
  environment: NodeJS.ProcessEnv
): PostDeployTracerOptions {
  return {
    environment: requireEvidenceValue(valueFor(args, '--environment'), '--environment'),
    releaseMode: requireEvidenceValue(
      environment.POST_DEPLOY_RELEASE_MODE,
      'POST_DEPLOY_RELEASE_MODE'
    ),
    runUrl: requireEvidenceValue(environment.POST_DEPLOY_RUN_URL, 'POST_DEPLOY_RUN_URL'),
    siteId: requireEvidenceValue(valueFor(args, '--site'), '--site'),
    sourceSha: requireEvidenceValue(environment.POST_DEPLOY_SOURCE_SHA, 'POST_DEPLOY_SOURCE_SHA')
  }
}

function summaryFor(result: PostDeployTracerEvidence): string {
  const common = [
    '## Post-deployment Visitor tracer',
    '',
    `- Outcome: ${result.outcome}`,
    `- Site: ${result.siteId}`,
    `- Environment: ${result.environment}`,
    `- Source SHA: ${result.sourceSha}`,
    `- Release mode: ${result.releaseMode}`,
    `- Workflow run: ${result.runUrl}`,
    `- Observation window: ${result.startedAt} to ${result.finishedAt}`
  ]
  if (result.outcome === 'failed') {
    return [
      ...common,
      `- Attempts: ${result.attempts}`,
      ...(result.listingUrl ? [`- Listing: ${result.listingUrl}`] : []),
      ...(result.observations.home
        ? [
            `- Home: HTTP ${result.observations.home.status}, canonical ${result.observations.home.canonical}`
          ]
        : []),
      ...(result.observations.listing
        ? [
            `- Listing: HTTP ${result.observations.listing.status}, canonical ${result.observations.listing.canonical}`
          ]
        : []),
      ...(result.observations.sitemap
        ? [
            `- Sitemap: HTTP ${result.observations.sitemap.status}, Listing present ${result.observations.sitemap.containsListing}`
          ]
        : []),
      `- Failure: ${result.error.code}: ${result.error.message}`,
      '',
      'Investigate the deployed release using `docs/DEPLOY_RUNBOOK.md`. Do not automatically roll back or restore D1.',
      ''
    ].join('\n')
  }
  return [
    ...common,
    `- Listing: ${result.listingUrl}`,
    `- Home: HTTP ${result.observations.home.status}, canonical ${result.observations.home.canonical}`,
    `- Listing: HTTP ${result.observations.listing.status}, canonical ${result.observations.listing.canonical}`,
    `- Sitemap: HTTP ${result.observations.sitemap.status}, Listing present ${result.observations.sitemap.containsListing}`,
    ''
  ].join('\n')
}

async function main(): Promise<void> {
  const result = await runPostDeployTracer(
    parsePostDeployTracerOptions(
      process.argv.slice(2).filter(value => value !== '--'),
      process.env
    )
  )
  console.log(JSON.stringify(result))
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryFor(result))
  if (result.outcome === 'failed') {
    console.error(
      `Post-deploy Visitor tracer failed after ${result.attempts} attempts. Investigate the deployed release and follow docs/DEPLOY_RUNBOOK.md; do not automatically roll back or restore D1.`
    )
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
