import {
  type ActiveCheckedInSiteId,
  assertSiteIdIsSupported
} from '@serpdirectory/site-contract/active-site-ids'
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export interface SiteDatabase {
  database: DrizzleD1Database<typeof schema>
  siteId: ActiveCheckedInSiteId
}

export function createSiteDatabase(
  binding: D1Database,
  siteId: ActiveCheckedInSiteId
): SiteDatabase {
  assertSiteIdIsSupported(siteId)
  return {
    database: drizzle(binding, { schema }),
    siteId
  }
}
