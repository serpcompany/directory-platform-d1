import { assertSiteIdIsNotRemoved } from '@thedaviddias/site-contract/active-site-ids'
import type { LucideIcon } from 'lucide-react'
import {
  Brain,
  Briefcase,
  Code2,
  Cpu,
  Database,
  Download,
  FileText,
  Globe,
  Lock,
  Package,
  ShoppingCart,
  User
} from 'lucide-react'

export interface Category {
  description: string
  icon: LucideIcon
  name: string
  priority: 'high' | 'medium' | 'low'
  slug: string
}

type CategoryPresentation = {
  description?: string
  icon?: LucideIcon
  name?: string
  priority?: Category['priority']
}

const categoryPresentationBySlug: Record<string, CategoryPresentation> = {
  adult: {
    description: 'Browse adult downloader listings and resources.',
    name: 'Adult'
  },
  'agency-services': {
    description: 'Agencies, consultancies, and service providers',
    icon: Briefcase,
    priority: 'low'
  },
  'ai-ml': {
    description: 'AI models, ML tools, LLM platforms, and AI services',
    icon: Brain,
    priority: 'high'
  },
  'business-operations': {
    description: 'Business management, operations, and enterprise tools',
    icon: Briefcase,
    priority: 'low'
  },
  'content-media': {
    description: 'Publishing platforms, content management, and media tools',
    icon: FileText,
    priority: 'low'
  },
  'data-analytics': {
    description: 'Databases, analytics platforms, BI tools, and data processing',
    icon: Database,
    priority: 'high'
  },
  'developer-tools': {
    description: 'APIs, frameworks, libraries, IDEs, and development utilities',
    icon: Code2,
    priority: 'high'
  },
  'ecommerce-retail': {
    description: 'Online stores, marketplaces, and retail platforms',
    icon: ShoppingCart,
    priority: 'low'
  },
  'finance-fintech': {
    description: 'Financial services, payment platforms, and fintech tools',
    icon: Briefcase,
    priority: 'medium'
  },
  international: {
    description: 'Non-English and international websites',
    icon: Globe,
    priority: 'low'
  },
  'infrastructure-cloud': {
    description: 'Cloud platforms, hosting, containers, and DevOps tools',
    icon: Cpu,
    priority: 'high'
  },
  'marketing-sales': {
    description: 'Marketing tools, CRM, sales platforms, and customer engagement',
    icon: User,
    priority: 'medium'
  },
  other: {
    description: "Everything else that doesn't fit other categories",
    icon: Package,
    priority: 'low'
  },
  personal: {
    description: 'Personal websites, portfolios, and blogs',
    icon: User,
    priority: 'low'
  },
  'product-launch-websites': {
    description: 'Product launch directories, launch platforms, and discovery websites',
    icon: Globe,
    name: 'Product Launch Websites',
    priority: 'medium'
  },
  'security-identity': {
    description: 'Security tools, authentication, encryption, and compliance',
    icon: Lock,
    priority: 'high'
  },
  'video-downloaders': {
    description: 'Downloaders, recorders, and browser tools for saving online video',
    icon: Download,
    name: 'Video Downloaders',
    priority: 'medium'
  }
}

const siteCategorySlugs: Record<string, string[]> = {
  'serp.software': ['adult', 'product-launch-websites', 'video-downloaders']
}

export const categoryAliases: Record<string, string> = {
  'automation-workflow': 'video-downloaders',
  'course-platforms': 'course-platform-downloaders',
  'image-downloader': 'image-downloaders',
  'image-hosting': 'image-downloaders',
  'integration-automation': 'video-downloaders',
  livestream: 'livestream-downloaders',
  'movies-and-tv': 'movies-and-tv-downloaders',
  'movies-tv': 'movies-and-tv-downloaders',
  'social-media': 'social-media-downloaders'
}

function buildFallbackDescription(name: string): string {
  return `Browse ${name.toLowerCase()} listings and resources.`
}

function resolveCategoryIcon(slug: string): LucideIcon {
  return categoryPresentationBySlug[slug]?.icon || Package
}

function resolveRuntimeSiteId(): string | undefined {
  return process.env.NEXT_PUBLIC_SITE_ID || process.env.SITE_ID
}

export function normalizeCategorySlug(slug: string): string {
  return categoryAliases[slug] || slug
}

export function resolveCategories(siteId = resolveRuntimeSiteId()): Category[] {
  if (siteId) assertSiteIdIsNotRemoved(siteId)
  const allowedSlugs = siteId ? siteCategorySlugs[siteId] : undefined
  return Object.entries(categoryPresentationBySlug)
    .filter(([slug]) => !allowedSlugs || allowedSlugs.includes(slug))
    .map(([slug, presentation]) => {
      const name =
        presentation.name ||
        slug
          .split('-')
          .map(word => `${word[0]?.toUpperCase() || ''}${word.slice(1)}`)
          .join(' ')
      return {
        description: presentation.description || buildFallbackDescription(name),
        icon: resolveCategoryIcon(slug),
        name,
        priority: presentation.priority || 'low',
        slug
      }
    })
}

export const categories: Category[] = resolveCategories()

export const getCategoryBySlug = (slug: string): Category | undefined => {
  const normalizedSlug = normalizeCategorySlug(slug)
  return categories.find(category => category.slug === normalizedSlug)
}

export const getCategoryLabel = (slug: string): string => {
  return getCategoryBySlug(slug)?.name || normalizeCategorySlug(slug)
}

export const getCategoryIcon = (slug: string): LucideIcon => {
  return categoryPresentationBySlug[normalizeCategorySlug(slug)]?.icon || Package
}
