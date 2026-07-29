import { sql } from 'drizzle-orm'
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

export const sites = sqliteTable('sites', {
  id: text('id').primaryKey()
})

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
  },
  table => [unique('categories_site_slug_unique').on(table.siteId, table.slug)]
)

export const listings = sqliteTable(
  'listings',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    website: text('website').notNull(),
    content: text('content'),
    entityType: text('entity_type'),
    priority: text('priority', { enum: ['high', 'medium', 'low'] }),
    isUnofficial: integer('is_unofficial', { mode: 'boolean' }).notNull().default(false),
    isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    status: text('status', { enum: ['draft', 'review', 'approved', 'rejected'] }).notNull(),
    publishedAt: text('published_at'),
    displayOrder: integer('display_order').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceIdentity: text('source_identity').notNull(),
    checksum: text('checksum').notNull()
  },
  table => [unique('listings_site_slug_unique').on(table.siteId, table.slug)]
)

export const listingCategories = sqliteTable(
  'listing_categories',
  {
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    sortOrder: integer('sort_order').notNull().default(0),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false)
  },
  table => [
    primaryKey({ columns: [table.listingId, table.categoryId] }),
    uniqueIndex('listing_categories_one_primary_idx')
      .on(table.listingId)
      .where(sql`${table.isPrimary} = 1`)
  ]
)

export const listingMedia = sqliteTable('listing_media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listingId: text('listing_id')
    .notNull()
    .references(() => listings.id),
  kind: text('kind', { enum: ['logo', 'image', 'video'] }).notNull(),
  url: text('url').notNull(),
  sortOrder: integer('sort_order').notNull().default(0)
})

export const listingResourceLinks = sqliteTable('listing_resource_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listingId: text('listing_id')
    .notNull()
    .references(() => listings.id),
  label: text('label').notNull(),
  url: text('url').notNull(),
  sortOrder: integer('sort_order').notNull().default(0)
})

export const listingFaqs = sqliteTable('listing_faqs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listingId: text('listing_id')
    .notNull()
    .references(() => listings.id),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  sortOrder: integer('sort_order').notNull().default(0)
})

export const listingSlugRedirects = sqliteTable(
  'listing_slug_redirects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id),
    oldSlug: text('old_slug').notNull(),
    newSlug: text('new_slug').notNull(),
    manifestId: text('manifest_id').notNull(),
    reason: text('reason').notNull(),
    createdAt: text('created_at').notNull()
  },
  table => [unique('listing_slug_redirects_site_old_slug_unique').on(table.siteId, table.oldSlug)]
)

export const publicationState = sqliteTable('publication_state', {
  siteId: text('site_id')
    .primaryKey()
    .references(() => sites.id),
  version: integer('version').notNull(),
  manifestId: text('manifest_id'),
  checksum: text('checksum').notNull(),
  publishedAt: text('published_at').notNull()
})
