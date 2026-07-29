// Scratch sanity check for the board graph. Run with `pnpm node src/tools/geometry-check.ts`.
import { geometry, harboursFor, standardFrame, frameArrangements } from '../board'

const g = geometry()
console.log('hexes', g.coords.length)
console.log('nodes', g.nodes.length)
console.log('edges', g.edges.length)
console.log('coastal edges', g.edges.filter((e) => e.hexes.length === 1).length)
console.log('ring length', g.coastalRing.length)
console.log('node degrees', [...new Set(g.nodes.map((n) => n.nodes.length))].sort())
console.log('node hex counts', [...new Set(g.nodes.map((n) => n.hexes.length))].sort())

const start = g.nodes[g.coastalRingNodes[0]]
console.log('ring start node', start.id, start.x.toFixed(3), start.y.toFixed(3))

const h = harboursFor(standardFrame(), g)
console.log(
  'standard harbour slots',
  h.map((x) => x.slot).sort((a, b) => a - b),
)
const slots = h.map((x) => x.slot).sort((a, b) => a - b)
console.log(
  'gaps',
  slots.map((s, i) => (i === 0 ? 30 + s - slots[slots.length - 1] : s - slots[i - 1])),
)

// No settlement position may touch two harbours, for every arrangement.
let worst = 0
for (const frame of frameArrangements()) {
  const hs = harboursFor(frame, g)
  const seen = new Map<number, number>()
  for (const x of hs) for (const n of x.nodes) seen.set(n, (seen.get(n) ?? 0) + 1)
  worst = Math.max(worst, ...seen.values())
}
console.log('arrangements', frameArrangements().length, 'max harbours per node', worst)
