import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectChangedBiomeFiles } from './biome-changed'

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

describe('changed-file Biome policy', () => {
  it('includes supported tracked and untracked changes but ignores unsupported files', () => {
    const root = mkdtempSync(join(tmpdir(), 'biome-changed-'))
    git(root, ['init'])
    git(root, ['config', 'user.name', 'Harness Test'])
    git(root, ['config', 'user.email', 'harness@example.com'])

    writeFileSync(join(root, 'tracked.ts'), 'export const value = 1\n')
    writeFileSync(join(root, 'notes.md'), '# baseline\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'baseline'])

    writeFileSync(join(root, 'tracked.ts'), 'export const value = 2\n')
    writeFileSync(join(root, 'untracked.json'), '{"value":2}\n')
    writeFileSync(join(root, 'notes.md'), '# changed\n')

    expect(collectChangedBiomeFiles(root)).toEqual(['tracked.ts', 'untracked.json'])
  })
})
