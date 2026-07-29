import { serpSoftwareSiteConfig } from '../../../sites/serp.software/site-config'
import { assertSiteIdIsSupported } from './active-site-ids'
import { resolveSiteContent } from './site-content'
import type { CheckedInSiteConfig } from './types'

export { resolveSiteContent }
export type { CheckedInSiteConfig } from './types'

export const siteConfigsById: Record<string, CheckedInSiteConfig> = {
  'serp.software': serpSoftwareSiteConfig
}

export function resolveCheckedInSiteConfig(siteId = 'serp.software'): CheckedInSiteConfig {
  assertSiteIdIsSupported(siteId)
  return siteConfigsById[siteId]
}
