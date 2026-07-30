import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const biomePathspecs = ['*.js', '*.jsx', '*.ts', '*.tsx', '*.json', '*.jsonc', '*.css']

function gitPaths(root: string, args: string[]): string[] {
  const output = execFileSync('git', [...args, '-z', '--', ...biomePathspecs], {
    cwd: root,
    encoding: 'buffer'
  })

  return output.toString('utf8').split('\0').filter(Boolean)
}

function hasOriginMain(root: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], {
    cwd: root,
    stdio: 'ignore'
  })
  return result.status === 0
}

export function collectChangedBiomeFiles(root: string): string[] {
  const paths = new Set<string>()

  if (hasOriginMain(root)) {
    for (const path of gitPaths(root, [
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      'origin/main...HEAD'
    ])) {
      paths.add(path)
    }
  }

  for (const path of gitPaths(root, ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'])) {
    paths.add(path)
  }

  for (const path of gitPaths(root, ['ls-files', '--others', '--exclude-standard'])) {
    paths.add(path)
  }

  return [...paths].sort()
}

export function runChangedBiomeCheck(root = resolve('.')): void {
  const files = collectChangedBiomeFiles(root)

  if (files.length === 0) {
    console.log('No Biome-supported files changed; skipping.')
    return
  }

  console.log(`Checking ${files.length} changed Biome-supported file(s).`)
  const result = spawnSync(
    'pnpm',
    ['exec', 'biome', 'check', '--no-errors-on-unmatched', ...files],
    {
      cwd: root,
      stdio: 'inherit'
    }
  )

  if (result.status !== 0) {
    process.exitCode = result.status || 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runChangedBiomeCheck()
}
