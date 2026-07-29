// Run a TypeScript file through vite-node, which ships with vitest.
//
//   node scripts/run-ts.mjs src/tools/calibrate.ts [args...]
//
// vite-node is a transitive dependency, so it has no bin in node_modules/.bin;
// this resolves its entrypoint instead of hard-coding a version-pinned path.

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// pnpm symlinks node_modules/vitest into the store; vite-node sits beside it
// there, so resolution has to start from the real path, not the link.
const require = createRequire(
  fs.realpathSync(path.join(root, 'node_modules', 'vitest', 'package.json')),
)

let entry
try {
  entry = path.join(path.dirname(require.resolve('vite-node/package.json')), 'vite-node.mjs')
} catch {
  console.error('Could not resolve vite-node. Is `pnpm install` complete?')
  process.exit(1)
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: root,
})
child.on('exit', (code) => process.exit(code ?? 1))
