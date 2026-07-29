import { describe, expect, it } from 'vitest'
import {
  EDGES_PER_PIECE,
  FRAME_PIECES,
  frameArrangements,
  generateBoard,
  generateFullBoard,
  geometry,
  harboursFor,
  hexCoords,
  makeRng,
  noAdjacentReds,
  NUMBER_POOL,
  standardFrame,
  TILE_POOL,
  TOTAL_PIPS,
} from './board'

describe('generateBoard', () => {
  it('places 19 hexes on the standard layout', () => {
    expect(hexCoords()).toHaveLength(19)
    expect(generateBoard()).toHaveLength(19)
  })

  it('uses the full tile and number pools exactly', () => {
    const board = generateBoard()
    const resources = board.map((h) => h.resource).sort()
    expect(resources).toEqual([...TILE_POOL].sort())
    const numbers = board
      .filter((h) => h.number !== null)
      .map((h) => h.number)
      .sort((a, b) => a! - b!)
    expect(numbers).toEqual([...NUMBER_POOL].sort((a, b) => a - b))
  })

  it('never places 6 and 8 on adjacent hexes', () => {
    for (let i = 0; i < 50; i++) {
      expect(noAdjacentReds(generateBoard())).toBe(true)
    }
  })

  it('leaves the desert without a number token', () => {
    const board = generateBoard()
    const desert = board.find((h) => h.resource === 'desert')!
    expect(desert.number).toBeNull()
  })

  it('counts 58 pips over the 18 numbered tiles', () => {
    expect(TOTAL_PIPS).toBe(58)
  })

  it('is deterministic for a given seed', () => {
    const a = generateFullBoard(makeRng(12345))
    const b = generateFullBoard(makeRng(12345))
    expect(b).toEqual(a)
    expect(generateFullBoard(makeRng(12346))).not.toEqual(a)
  })
})

describe('geometry', () => {
  const geom = geometry()

  it('derives 54 intersections and 72 edges', () => {
    expect(geom.nodes).toHaveLength(54)
    expect(geom.edges).toHaveLength(72)
  })

  it('finds 30 coastal edges and walks them as one ring', () => {
    expect(geom.edges.filter((e) => e.hexes.length === 1)).toHaveLength(30)
    expect(geom.coastalRing).toHaveLength(30)
    expect(new Set(geom.coastalRing).size).toBe(30)
    expect(geom.coastalRing.length).toBe(FRAME_PIECES.length * EDGES_PER_PIECE)
  })

  it('walks the ring as a closed cycle of adjacent edges', () => {
    for (let i = 0; i < geom.coastalRing.length; i++) {
      const here = geom.edges[geom.coastalRing[i]]
      const next = geom.edges[geom.coastalRing[(i + 1) % geom.coastalRing.length]]
      const shared = here.nodes.filter((n) => next.nodes.includes(n))
      expect(shared).toHaveLength(1)
    }
  })

  it('gives every node 2 or 3 neighbours and 1 to 3 hexes', () => {
    for (const node of geom.nodes) {
      expect(node.nodes.length).toBeGreaterThanOrEqual(2)
      expect(node.nodes.length).toBeLessThanOrEqual(3)
      expect(node.hexes.length).toBeGreaterThanOrEqual(1)
      expect(node.hexes.length).toBeLessThanOrEqual(3)
    }
  })

  it('has symmetric node adjacency', () => {
    for (const node of geom.nodes) {
      for (const other of node.nodes) {
        expect(geom.nodes[other].nodes).toContain(node.id)
      }
    }
  })
})

describe('the sea frame', () => {
  it('offers 120 distinct arrangements of the 6 pieces', () => {
    const arrangements = frameArrangements()
    expect(arrangements).toHaveLength(120)
    const keys = arrangements.map((a) => a.map((p) => p.id).join(''))
    expect(new Set(keys).size).toBe(120)
    // Piece A is pinned to slot 0, which is what removes the rotations.
    expect(new Set(arrangements.map((a) => a[0].id))).toEqual(new Set(['A']))
  })

  it('carries 9 harbours: four 3:1 and one 2:1 per resource', () => {
    const harbours = harboursFor(standardFrame())
    expect(harbours).toHaveLength(9)
    const kinds = harbours.map((h) => h.kind).sort()
    expect(kinds).toEqual(['brick', 'generic', 'generic', 'generic', 'generic', 'ore', 'sheep', 'wheat', 'wood'])
  })

  it('reproduces the classic 3-4-3 harbour gaps for the alternating order', () => {
    const slots = harboursFor(standardFrame())
      .map((h) => h.slot)
      .sort((a, b) => a - b)
    expect(slots).toEqual([0, 3, 7, 10, 13, 17, 20, 23, 27])
  })

  it('never lets one settlement position touch two harbours, for any arrangement', () => {
    for (const frame of frameArrangements()) {
      const counts = new Map<number, number>()
      for (const harbour of harboursFor(frame)) {
        for (const node of harbour.nodes) counts.set(node, (counts.get(node) ?? 0) + 1)
      }
      expect(Math.max(...counts.values())).toBe(1)
    }
  })

  it('puts every harbour on a coastal edge', () => {
    const geom = geometry()
    for (const frame of frameArrangements()) {
      for (const harbour of harboursFor(frame)) {
        expect(geom.edges[harbour.edge].hexes).toHaveLength(1)
      }
    }
  })
})
