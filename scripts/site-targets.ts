export const siteIds = ['pornvideodownloaders.com', 'serp.software'] as const
export type SiteId = (typeof siteIds)[number]

export interface SiteTarget {
  appPackageName: SiteId
  artifactBatchDirectory: string
  confirmation: {
    deploy: {
      preview: string
      production: string
    }
    plan: {
      preview: string
      production: string
    }
    publish: string
    submission: string
  }
  local: {
    configPath: string
    databaseId: string
    databaseName: string
    workerName: string
  }
  parityReportPath: string
  protectedEnvironment: {
    preview: string
    production: string
  }
  remote: {
    previewConfigPath: string
    productionConfigPath: string
  }
  siteId: SiteId
}

export const siteTargets = {
  'pornvideodownloaders.com': {
    appPackageName: 'pornvideodownloaders.com',
    artifactBatchDirectory: 'd1/artifacts/pornvideodownloaders-com-v1-import',
    confirmation: {
      deploy: {
        preview: 'deploy-pornvideodownloaders.com-preview',
        production: 'deploy-pornvideodownloaders.com-production'
      },
      plan: {
        preview: 'plan-pornvideodownloaders.com-preview',
        production: 'plan-pornvideodownloaders.com-production'
      },
      publish: 'publish-pornvideodownloaders.com-production',
      submission: 'approve-pornvideodownloaders.com-submission-production'
    },
    local: {
      configPath: 'configs/wrangler/pornvideodownloaders.com/local.jsonc',
      databaseId: '00000000-0000-0000-0000-000000000003',
      databaseName: 'pornvideodownloaders-local',
      workerName: 'pornvideodownloaders-local'
    },
    parityReportPath: 'd1/artifacts/pornvideodownloaders-com-v1-parity.yaml',
    protectedEnvironment: {
      preview: 'pornvideodownloaders-preview',
      production: 'pornvideodownloaders-production'
    },
    remote: {
      previewConfigPath: 'configs/wrangler/pornvideodownloaders.com/preview.jsonc',
      productionConfigPath: 'configs/wrangler/pornvideodownloaders.com/production.jsonc'
    },
    siteId: 'pornvideodownloaders.com'
  },
  'serp.software': {
    appPackageName: 'serp.software',
    artifactBatchDirectory: 'd1/artifacts/serp-software-v1-import',
    confirmation: {
      deploy: {
        preview: 'deploy-serp.software-preview',
        production: 'deploy-serp.software-production'
      },
      plan: {
        preview: 'plan-serp.software-preview',
        production: 'plan-serp.software-production'
      },
      publish: 'publish-serp.software-production',
      submission: 'approve-serp.software-submission-production'
    },
    local: {
      configPath: 'configs/wrangler/serp.software/local.jsonc',
      databaseId: '00000000-0000-0000-0000-000000000002',
      databaseName: 'serp-software-local',
      workerName: 'serp-software-local'
    },
    parityReportPath: 'd1/artifacts/serp-software-v1-parity.yaml',
    protectedEnvironment: {
      preview: 'preview',
      production: 'production'
    },
    remote: {
      previewConfigPath: 'configs/wrangler/serp.software/preview.jsonc',
      productionConfigPath: 'configs/wrangler/serp.software/production.jsonc'
    },
    siteId: 'serp.software'
  }
} satisfies Record<SiteId, SiteTarget>

export function parseSiteId(value: string | undefined): SiteId {
  if (siteIds.includes(value as SiteId)) return value as SiteId
  throw new Error(`Site must be one of: ${siteIds.join(', ')}.`)
}

export function resolveSiteTarget(value: string | undefined): SiteTarget {
  return siteTargets[parseSiteId(value)]
}
