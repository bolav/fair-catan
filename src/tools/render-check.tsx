// Static-render the board and check the SVG layout numerically — the stand-in
// for eyeballing it, in a container with no browser.
//
//   pnpm render-check
//
// Writes dist-preview/board.svg so the markup can also be opened by hand.

import { renderToStaticMarkup } from 'react-dom/server'
import { frameArrangements, geometry, harboursFor, makeRng, generateFullBoard } from '../board'
import { buildScoringIndex } from '../scoring'
import { runDraft } from '../placement'
import { BoardView } from '../ui/BoardView'

declare const process: { argv: string[]; exitCode?: number }

const board = generateFullBoard(makeRng(Number(process.argv[2] ?? 4242)))
const draft = runDraft(buildScoringIndex(board))
const svg = renderToStaticMarkup(<BoardView board={board} draft={draft} />)

const count = (pattern: RegExp) => svg.match(pattern)?.length ?? 0
const fail: string[] = []
const check = (label: string, actual: number, expected: number) => {
  const ok = actual === expected
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(28)} ${actual} (expected ${expected})`)
  if (!ok) fail.push(label)
}

console.log('markup:')
check('hex tiles', count(/<title>(wood|brick|sheep|wheat|ore|desert)/g), 19)
check('number tokens', count(/<circle[^>]*r="15"/g), 18)
check('harbour markers', count(/<rect/g), 9)
check('settlement markers', count(/<circle[^>]*r="12"/g), 8)
check('frame piece letters', count(/Frame piece/g), 6)

// --- marker collisions, across every arrangement the generator can pick -----
const S = 46
const SEA = 1.0
const geom = geometry()
const unit = (p: { x: number; y: number }) => {
  const len = Math.hypot(p.x, p.y) || 1
  return { x: p.x / len, y: p.y / len }
}

let closest = Infinity
let closestWhere = ''
for (const frame of frameArrangements()) {
  const centres = harboursFor(frame, geom).map((harbour) => {
    const [a, b] = harbour.nodes.map((id) => geom.nodes[id])
    const mid = { x: ((a.x + b.x) / 2) * S, y: ((a.y + b.y) / 2) * S }
    const d = unit(mid)
    return { x: mid.x + d.x * SEA * S * 0.55, y: mid.y + d.y * SEA * S * 0.55 }
  })
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      // Two 54x22 rects clear each other if either gap exceeds the half-sums.
      const dx = Math.abs(centres[i].x - centres[j].x)
      const dy = Math.abs(centres[i].y - centres[j].y)
      const clearance = Math.max(dx - 54, dy - 22)
      if (clearance < closest) {
        closest = clearance
        closestWhere = frame.map((p) => p.id).join('')
      }
    }
  }
}

console.log('\nharbour marker clearance across all 120 arrangements:')
console.log(`  worst gap ${closest.toFixed(1)}px (arrangement ${closestWhere})`)
if (closest < 4) {
  fail.push('harbour markers overlap')
  console.log('  FAIL overlapping harbour labels')
} else {
  console.log('  ok   no overlapping harbour labels')
}

const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? ''
console.log(`\nviewBox ${viewBox}`)

// Light-mode values of the tokens styles.css defines, so the standalone file
// can be rasterised by a renderer that does not resolve CSS custom properties.
const LIGHT_TOKENS: Record<string, string> = {
  '--surface-1': '#fcfcfb',
  '--text-secondary': '#52514e',
  '--sea': '#e4eef4',
  '--sea-line': '#b9d0dd',
  '--token': '#f6f3e9',
  '--terrain-wood': '#2e7d3d',
  '--terrain-brick': '#c05a2b',
  '--terrain-sheep': '#9dc44d',
  '--terrain-wheat': '#e0a521',
  '--terrain-ore': '#4f80b8',
  '--terrain-desert': '#d9cfae',
  '--player-1': '#2a78d6',
  '--player-2': '#eda100',
  '--player-3': '#e87ba4',
  '--player-4': '#008300',
}

const flat = svg.replace(/var\((--[a-z0-9-]+)\)/g, (whole, name: string) => LIGHT_TOKENS[name] ?? whole)
const remaining = flat.match(/var\(--[a-z0-9-]+\)/g)
if (remaining) {
  fail.push('unmapped tokens')
  console.log(`  FAIL unmapped tokens: ${[...new Set(remaining)].join(', ')}`)
}

const fs = await import('node:fs/promises')
await fs.mkdir('dist-preview', { recursive: true })
await fs.writeFile('dist-preview/board.svg', svg)
await fs.writeFile(
  'dist-preview/board-flat.svg',
  flat.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'),
)
console.log('wrote dist-preview/board.svg and dist-preview/board-flat.svg')

if (fail.length) {
  console.log(`\nFAILED: ${fail.join(', ')}`)
  process.exitCode = 1
}
