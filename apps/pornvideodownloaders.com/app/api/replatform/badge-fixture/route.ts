import { getCloudflareContext } from '@opennextjs/cloudflare'
import { BADGE_VERIFIER_USER_AGENT } from '@serpdirectory/web-core/forms/submission-contract'
import { submissionBadgeTargets } from '@/lib/submissions/presentation'

export async function GET(request: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true })
  const workerEnv = env as CloudflareEnv & { REPLATFORM_PREVIEW_CAPABILITY?: string }
  const capability = new URL(request.url).searchParams.get('capability')
  if (
    workerEnv.D1_RUNTIME_ENV !== 'preview' ||
    !workerEnv.REPLATFORM_PREVIEW_CAPABILITY ||
    capability !== workerEnv.REPLATFORM_PREVIEW_CAPABILITY ||
    request.headers.get('user-agent') !== BADGE_VERIFIER_USER_AGENT
  )
    return new Response('Not found', { status: 404 })
  const slug = new URL(request.url).searchParams.get('slug')
  if (!slug || !/^[a-z0-9.-]+$/u.test(slug)) return new Response('Not found', { status: 404 })
  const targets = submissionBadgeTargets(slug)
  const html = `<a href="${targets.listingUrl}"><img src="${targets.badgeUrls[0]}" alt="Featured on pornvideodownloaders.com"></a>`
  return new Response(html, {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' }
  })
}
