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
  pieceEdgeSlot,
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
    // The gaps, not the absolute slots, are what the physical board fixes:
    // PIECE_START_OFFSET rotates the whole set around the coast without
    // changing the spacing.
    const gaps = slots.map((s, i) => (i === 0 ? 30 + s - slots[slots.length - 1] : s - slots[i - 1]))
    expect(gaps.reduce((a, b) => a + b)).toBe(30)
    expect(gaps.sort((a, b) => a - b)).toEqual([3, 3, 3, 3, 3, 3, 4, 4, 4])
    expect(slots).toEqual([2, 6, 9, 12, 16, 19, 22, 26, 29])
  })

  it('cuts every piece out of the coast as a straight bar', () => {
    // A piece's five coastal edges share one midline; that is what makes it a
    // straight bar with a zigzag inner edge. PIECE_START_OFFSET has to keep it.
    const geom = geometry()
    const ring = geom.coastalRingNodes.map((id) => geom.nodes[id])
    for (let slot = 0; slot < 6; slot++) {
      const mids = Array.from({ length: EDGES_PER_PIECE }, (_, k) => {
        const e = pieceEdgeSlot(slot, k, ring.length)
        const a = ring[e]
        const b = ring[(e + 1) % ring.length]
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      })
      const run = { x: mids[4].x - mids[0].x, y: mids[4].y - mids[0].y }
      const len = Math.hypot(run.x, run.y)
      const normal = { x: -run.y / len, y: run.x / len }
      const depths = mids.map((m) => Math.abs(m.x * normal.x + m.y * normal.y))
      for (const d of depths) expect(d).toBeCloseTo(depths[0], 9)
    }
  })

  it('starts each piece on an inner coastal node, as the physical pieces do', () => {
    // Read from the left, a real piece's profile is low, high, low, high,
    // low, high — so its first node is a low one. Depth is measured along the
    // piece's own outward normal; every coastal node is the same distance from
    // the board centre, so radius cannot tell the two apart. See
    // PIECE_START_OFFSET.
    const geom = geometry()
    const ring = geom.coastalRingNodes.map((id) => geom.nodes[id])
    for (let slot = 0; slot < 6; slot++) {
      const at = (k: number) => ring[pieceEdgeSlot(slot, k, ring.length)]
      const run = { x: at(4).x - at(0).x, y: at(4).y - at(0).y }
      const len = Math.hypot(run.x, run.y)
      let normal = { x: -run.y / len, y: run.x / len }
      if (at(0).x * normal.x + at(0).y * normal.y < 0) normal = { x: -normal.x, y: -normal.y }

      const depth = (k: number) => at(k).x * normal.x + at(k).y * normal.y
      const profile = Array.from({ length: 6 }, (_, k) => depth(k))
      const high = Math.max(...profile)
      const low = Math.min(...profile)
      expect(high).toBeGreaterThan(low)
      const mid = (high + low) / 2
      expect(profile.map((d) => d > mid)).toEqual([false, true, false, true, false, true])
    }
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
