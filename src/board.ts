// Standard 3-4 player Catan board: tile/number pools, pointy-top geometry,
// intersection ("node") derivation, the coastal ring and the physical sea frame.

export type Resource = 'wood' | 'sheep' | 'wheat' | 'brick' | 'ore' | 'desert'
/** Everything except the desert actually produces cards. */
export type ProducingResource = Exclude<Resource, 'desert'>

export const PRODUCING_RESOURCES: ProducingResource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

export interface Hex {
  q: number // axial column
  r: number // axial row
  resource: Resource
  number: number | null // null for desert
}

export const TILE_POOL: Resource[] = [
  ...Array<Resource>(4).fill('wood'),
  ...Array<Resource>(4).fill('sheep'),
  ...Array<Resource>(4).fill('wheat'),
  ...Array<Resource>(3).fill('brick'),
  ...Array<Resource>(3).fill('ore'),
  'desert',
]

export const NUMBER_POOL = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]

/**
 * Expected card return per 36 rolls ("pips"): the number of dots printed on the
 * number token. The desert returns nothing.
 */
export const PIPS: Readonly<Record<number, number>> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
}

export function pips(number: number | null): number {
  return number === null ? 0 : (PIPS[number] ?? 0)
}

/** Total pips over the 18 numbered tiles. */
export const TOTAL_PIPS = NUMBER_POOL.reduce((sum, n) => sum + PIPS[n], 0) // 58

// ---------------------------------------------------------------------------
// Seeded RNG — boards must be reproducible and shareable.
// ---------------------------------------------------------------------------

/** mulberry32: small, fast, good enough for board sampling. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash an arbitrary seed string to a 32-bit integer (cyrb53-lite). */
export function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ---------------------------------------------------------------------------
// Hex layout
// ---------------------------------------------------------------------------

/** Axial coordinates of the 19 hexes (hexagon of radius 2). */
export function hexCoords(): Array<{ q: number; r: number }> {
  const coords: Array<{ q: number; r: number }> = []
  for (let q = -2; q <= 2; q++) {
    for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
      coords.push({ q, r })
    }
  }
  return coords
}

export function areAdjacent(a: { q: number; r: number }, b: { q: number; r: number }): boolean {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (
    (Math.abs(dq) === 1 && dr === 0) ||
    (dq === 0 && Math.abs(dr) === 1) ||
    (dq === 1 && dr === -1) ||
    (dq === -1 && dr === 1)
  )
}

const SQRT3 = Math.sqrt(3)

/** Pointy-top pixel centre of a hex, in units of the hex circumradius. */
export function hexCenter(q: number, r: number): { x: number; y: number } {
  return { x: SQRT3 * (q + r / 2), y: 1.5 * r }
}

/** Corner `i` (0..5) of a pointy-top hex, clockwise from the upper-right. */
export function hexCorner(q: number, r: number, i: number): { x: number; y: number } {
  const c = hexCenter(q, r)
  const angle = (Math.PI / 180) * (60 * i - 30)
  return { x: c.x + Math.cos(angle), y: c.y + Math.sin(angle) }
}

export interface BoardNode {
  id: number
  x: number
  y: number
  /** Indices into `Geometry.coords` of the (1-3) hexes touching this node. */
  hexes: number[]
  /** Ids of the (2-3) nodes one road away. */
  nodes: number[]
}

export interface BoardEdge {
  id: number
  nodes: [number, number]
  /** Indices of the (1-2) hexes sharing this edge. */
  hexes: number[]
}

export interface Geometry {
  coords: Array<{ q: number; r: number }>
  centers: Array<{ x: number; y: number }>
  nodes: BoardNode[]
  edges: BoardEdge[]
  /** Node ids of each hex's 6 corners, in `hexCorner` order. */
  hexNodes: number[][]
  /** The 30 coastal edge ids, clockwise from the island's top-left apex. */
  coastalRing: number[]
  /** The boundary node the ring is at when entering each coastal edge. */
  coastalRingNodes: number[]
}

function roundCoord(v: number): number {
  const t = Math.round(v * 1e4) / 1e4
  return t === 0 ? 0 : t // normalise -0
}

let cachedGeometry: Geometry | null = null

/** The board graph. Static — it does not depend on how the tiles are shuffled. */
export function geometry(): Geometry {
  if (cachedGeometry) return cachedGeometry

  const coords = hexCoords()
  const centers = coords.map((c) => hexCenter(c.q, c.r))

  const nodes: BoardNode[] = []
  const hexNodes: number[][] = []
  const nodeByKey = new Map<string, number>()

  coords.forEach((c, hexIndex) => {
    const ids: number[] = []
    for (let i = 0; i < 6; i++) {
      const p = hexCorner(c.q, c.r, i)
      const x = roundCoord(p.x)
      const y = roundCoord(p.y)
      const key = `${x},${y}`
      let id = nodeByKey.get(key)
      if (id === undefined) {
        id = nodes.length
        nodeByKey.set(key, id)
        nodes.push({ id, x, y, hexes: [], nodes: [] })
      }
      nodes[id].hexes.push(hexIndex)
      ids.push(id)
    }
    hexNodes.push(ids)
  })

  const edges: BoardEdge[] = []
  const edgeByKey = new Map<string, number>()

  hexNodes.forEach((ids, hexIndex) => {
    for (let i = 0; i < 6; i++) {
      const a = ids[i]
      const b = ids[(i + 1) % 6]
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const key = `${lo}-${hi}`
      let id = edgeByKey.get(key)
      if (id === undefined) {
        id = edges.length
        edgeByKey.set(key, id)
        edges.push({ id, nodes: [lo, hi], hexes: [] })
      }
      edges[id].hexes.push(hexIndex)
    }
  })

  for (const e of edges) {
    nodes[e.nodes[0]].nodes.push(e.nodes[1])
    nodes[e.nodes[1]].nodes.push(e.nodes[0])
  }

  // --- coastal ring, walked as a single cycle ------------------------------
  const coastal = edges.filter((e) => e.hexes.length === 1)
  const coastalByNode = new Map<number, number[]>()
  for (const e of coastal) {
    for (const n of e.nodes) {
      const list = coastalByNode.get(n)
      if (list) list.push(e.id)
      else coastalByNode.set(n, [e.id])
    }
  }

  const other = (edgeId: number, node: number): number => {
    const [a, b] = edges[edgeId].nodes
    return a === node ? b : a
  }

  // Canonical start: the island's topmost, then leftmost, boundary node.
  let start = coastal[0].nodes[0]
  for (const n of coastalByNode.keys()) {
    const a = nodes[n]
    const b = nodes[start]
    if (a.y < b.y || (a.y === b.y && a.x < b.x)) start = n
  }

  const coastalRing: number[] = []
  const coastalRingNodes: number[] = []
  let current = start
  let previousEdge = -1
  for (let step = 0; step < coastal.length; step++) {
    const options = coastalByNode.get(current)!.filter((id) => id !== previousEdge)
    // First step sets the direction: head right, i.e. clockwise on screen.
    const chosen =
      step === 0
        ? options.reduce((best, id) =>
            nodes[other(id, current)].x > nodes[other(best, current)].x ? id : best,
          )
        : options[0]
    coastalRing.push(chosen)
    coastalRingNodes.push(current)
    previousEdge = chosen
    current = other(chosen, current)
  }

  cachedGeometry = { coords, centers, nodes, edges, hexNodes, coastalRing, coastalRingNodes }
  return cachedGeometry
}

// ---------------------------------------------------------------------------
// The physical sea frame (TODO §3.1)
// ---------------------------------------------------------------------------

export type HarbourKind = ProducingResource | 'generic'

export interface FramePiece {
  id: string
  label: string
  /** Harbour positions as an offset into the piece's 5 coastal edges. */
  harbours: Array<{ local: number; kind: HarbourKind }>
}

/** Each of the 6 frame pieces spans 5 of the 30 coastal edges. */
export const EDGES_PER_PIECE = 5

/**
 * Which coastal ring edge a frame piece starts on, relative to `slot * 5`.
 *
 * The coastal ring is walked clockwise from the island's topmost-then-leftmost
 * node, which is a node the land pushes *out* to. A run of six consecutive
 * coastal edges shares one straight midline, and a five-edge piece can be cut
 * out of that run in two ways — starting on the outer node or one step earlier
 * on the inner one. Both give a straight bar, so the geometry alone does not
 * decide it.
 *
 * The user's physical pieces do: read from the left, a piece's inner profile
 * runs low, high, low, high, low, high. That is the -1 cut. (TODO §3.1, the
 * question NEXT_STEPS step 3 was holding open.)
 */
export const PIECE_START_OFFSET = -1

/** The coastal ring edge carrying local edge `local` of the piece in `slot`. */
export function pieceEdgeSlot(slot: number, local: number, ringLength: number): number {
  return (slot * EDGES_PER_PIECE + local + PIECE_START_OFFSET + ringLength) % ringLength
}

/** The inverse: which frame slot covers a given coastal ring edge. */
export function slotForEdge(edge: number, ringLength: number): number {
  return Math.floor(((edge - PIECE_START_OFFSET + ringLength) % ringLength) / EDGES_PER_PIECE)
}

/**
 * The user's actual frame, read off a photo of them. All six pieces share
 * the same notch/tab profile, so any piece fits any of the 6 ring slots.
 * Two-harbour pieces carry their harbours 3 edges apart at local {0, 3};
 * one-harbour pieces carry theirs centred at local {2}.
 */
export const FRAME_PIECES: FramePiece[] = [
  { id: 'A', label: 'wood 2:1', harbours: [{ local: 2, kind: 'wood' }] },
  {
    id: 'B',
    label: '3:1 + wheat 2:1',
    harbours: [
      { local: 0, kind: 'generic' },
      { local: 3, kind: 'wheat' },
    ],
  },
  {
    id: 'C',
    label: '3:1 + brick 2:1',
    harbours: [
      { local: 0, kind: 'generic' },
      { local: 3, kind: 'brick' },
    ],
  },
  { id: 'D', label: 'ore 2:1', harbours: [{ local: 2, kind: 'ore' }] },
  {
    id: 'E',
    label: '3:1 + sheep 2:1',
    harbours: [
      { local: 0, kind: 'generic' },
      { local: 3, kind: 'sheep' },
    ],
  },
  { id: 'F', label: '3:1', harbours: [{ local: 2, kind: 'generic' }] },
]

export interface Harbour {
  kind: HarbourKind
  /** Edge id in `Geometry.edges`. */
  edge: number
  /** Index into `Geometry.coastalRing` (0-29). */
  slot: number
  /** The two settlement positions that can use this harbour. */
  nodes: [number, number]
  /** Id of the frame piece carrying it. */
  piece: string
}

/** Place the 9 harbours implied by a given left-to-right order of frame pieces. */
export function harboursFor(order: FramePiece[], geom: Geometry = geometry()): Harbour[] {
  const harbours: Harbour[] = []
  order.forEach((piece, slotIndex) => {
    for (const h of piece.harbours) {
      const slot = pieceEdgeSlot(slotIndex, h.local, geom.coastalRing.length)
      const edgeId = geom.coastalRing[slot]
      harbours.push({
        kind: h.kind,
        edge: edgeId,
        slot,
        nodes: [...geom.edges[edgeId].nodes] as [number, number],
        piece: piece.id,
      })
    }
  })
  return harbours
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  const out: T[][] = []
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) out.push([item, ...p])
  })
  return out
}

/**
 * The 120 meaningfully distinct frame configurations: 6! piece orders modulo
 * whole-ring rotation (which tile randomisation already covers), realised by
 * pinning piece A to slot 0.
 */
export function frameArrangements(): FramePiece[][] {
  const [first, ...rest] = FRAME_PIECES
  return permutations(rest).map((p) => [first, ...p])
}

export function randomFrame(random: () => number = Math.random): FramePiece[] {
  const [first, ...rest] = FRAME_PIECES
  return [first, ...shuffle(rest, random)]
}

/** The standard alternating 2-1-2-1-2-1 order, giving the classic 3-4-3 gaps. */
export function standardFrame(): FramePiece[] {
  const byId = new Map(FRAME_PIECES.map((p) => [p.id, p]))
  return ['B', 'A', 'C', 'D', 'E', 'F'].map((id) => byId.get(id)!)
}

// ---------------------------------------------------------------------------
// Board generation
// ---------------------------------------------------------------------------

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** True if no two red numbers (6 or 8) sit on adjacent hexes. */
export function noAdjacentReds(hexes: Hex[]): boolean {
  const reds = hexes.filter((h) => h.number === 6 || h.number === 8)
  for (let i = 0; i < reds.length; i++) {
    for (let j = i + 1; j < reds.length; j++) {
      if (areAdjacent(reds[i], reds[j])) return false
    }
  }
  return true
}

/** Generate a random board, rejecting layouts with adjacent 6/8 tokens. */
export function generateBoard(random: () => number = Math.random): Hex[] {
  for (;;) {
    const resources = shuffle(TILE_POOL, random)
    const numbers = shuffle(NUMBER_POOL, random)
    let n = 0
    const hexes = hexCoords().map(({ q, r }, i) => ({
      q,
      r,
      resource: resources[i],
      number: resources[i] === 'desert' ? null : numbers[n++],
    }))
    if (noAdjacentReds(hexes)) return hexes
  }
}

/** A complete physical setup: land tiles plus the sea frame around them. */
export interface Board {
  hexes: Hex[]
  frame: FramePiece[]
  harbours: Harbour[]
}

export function generateFullBoard(random: () => number = Math.random): Board {
  const hexes = generateBoard(random)
  const frame = randomFrame(random)
  return { hexes, frame, harbours: harboursFor(frame) }
}
