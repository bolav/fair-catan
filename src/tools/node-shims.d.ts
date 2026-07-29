// Minimal ambient types for the node-only scripts in this folder.
// Delete this file if `@types/node` is ever added to devDependencies.

declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>
  export function writeFile(path: string, data: string): Promise<void>
}
