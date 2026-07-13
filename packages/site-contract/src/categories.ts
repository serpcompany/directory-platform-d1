import defaultCategories from '../../../sites/default/categories.json'
import serpSoftwareCategories from '../../../sites/serp.software/categories.json'
import { assertSiteIdIsNotRemoved } from './active-site-ids'
import { defaultSiteConfig } from './default-site-config'
import type { SiteCategoryInput } from './types'

const siteCategoriesById: Record<string, SiteCategoryInput[]> = {
  'serp.software': serpSoftwareCategories as SiteCategoryInput[]
}

export const defaultSiteCategories = defaultCategories as SiteCategoryInput[]

export function resolveCheckedInSiteCategories(siteId?: string): SiteCategoryInput[] {
  if (!siteId || siteId === defaultSiteConfig.id) {
    return defaultSiteCategories
  }

  assertSiteIdIsNotRemoved(siteId)

  return siteCategoriesById[siteId] ?? defaultSiteCategories
}
