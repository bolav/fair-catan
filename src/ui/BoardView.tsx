// The island, its sea frame and the eight simulated starting settlements.
//
// This is a map, not a chart: every hex carries its resource name and number
// token, every harbour its ratio and resource, and every settlement the number
// of the player who took it — so nothing here is identified by colour alone.

import {
  EDGES_PER_PIECE,
  geometry,
  pieceEdgeSlot,
  pips,
  slotForEdge,
  type Board,
  type Geometry,
  type Harbour,
  type HarbourKind,
  type Resource,
} from '../board'
import type { DraftResult } from '../placement'

const S = 46 // px per hex circumradius
/**
 * Width of the sea frame, measured outwards from the island's inscribed
 * hexagon (the line the coastline's outermost nodes sit on). The frame has to
 * be wide enough for a harbour marker to sit clear of both the coast and the
 * frame's outer edge — see HARBOUR_W/H below.
 */
const SEA = 1.25
const MARGIN = 10 // px of slack, over and above the frame-piece letters
const LETTER_GAP = 0.3 // frame-piece letters, this far outside the frame
const LETTER_SIZE = 15

const HARBOUR_W = 50
const HARBOUR_H = 20
const HARBOUR_TEXT = 9.5

const ROAD_W = 7
/** Fractions along the edge: clear of the settlement marker, short of the far junction. */
const ROAD_START = 0.3
const ROAD_END = 0.9

const TERRAIN: Record<Resource, string> = {
  wood: 'var(--terrain-wood)',
  brick: 'var(--terrain-brick)',
  sheep: 'var(--terrain-sheep)',
  wheat: 'var(--terrain-wheat)',
  ore: 'var(--terrain-ore)',
  desert: 'var(--terrain-desert)',
}

export const PLAYER_COLORS = [
  'var(--player-1)',
  'var(--player-2)',
  'var(--player-3)',
  'var(--player-4)',
]

/** Marker fills are dark blue / amber / pink / green; only amber needs ink. */
const PLAYER_INK = ['#ffffff', '#0b0b0b', '#0b0b0b', '#ffffff']

export function harbourLabel(kind: HarbourKind): string {
  return kind === 'generic' ? '3:1 any' : `2:1 ${kind}`
}

interface Point {
  x: number
  y: number
}

const scale = (p: Point): Point => ({ x: p.x * S, y: p.y * S })

function unit(p: Point): Point {
  const len = Math.hypot(p.x, p.y) || 1
  return { x: p.x / len, y: p.y / len }
}

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const mix = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const along = (p: Point, n: Point, d: number): Point => ({ x: p.x + n.x * d, y: p.y + n.y * d })

/**
 * One straight frame piece: the outward normal of its outer edge, and the
 * signed distance from the board centre to that edge.
 */
interface Side {
  normal: Point
  distance: number
  /** Midpoint of the piece's middle coastal edge — its tangential centre. */
  centre: Point
}

/**
 * The physical frame is six straight bars whose inner edge is a five-notch
 * zigzag and whose outer edge is one side of a regular hexagon. Each piece's
 * five coastal edge midpoints are collinear, so that line gives the piece its
 * direction; the outer edge is parallel to it, SEA beyond the furthest point
 * of the whole coastline. Adjacent outer edges meet at the hexagon's corners.
 */
function frameSides(ring: Point[]): Side[] {
  const sides: Side[] = []
  for (let piece = 0; piece < 6; piece++) {
    const mids = Array.from({ length: EDGES_PER_PIECE }, (_, k) => {
      const edge = pieceEdgeSlot(piece, k, ring.length)
      return mix(ring[edge], ring[(edge + 1) % ring.length])
    })
    const run = { x: mids[mids.length - 1].x - mids[0].x, y: mids[mids.length - 1].y - mids[0].y }
    let normal = unit({ x: -run.y, y: run.x })
    if (dot(normal, mids[0]) < 0) normal = { x: -normal.x, y: -normal.y }
    // The coastline's outermost node on this axis is what the frame must clear.
    const reach = Math.max(...ring.map((n) => dot(n, normal)))
    sides.push({ normal, distance: reach + SEA, centre: mids[(EDGES_PER_PIECE - 1) / 2] })
  }
  return sides
}

/** Where two frame edges meet — a corner of the hexagon. */
function meet(a: Side, b: Side): Point {
  const det = a.normal.x * b.normal.y - a.normal.y * b.normal.x
  return {
    x: (b.normal.y * a.distance - a.normal.y * b.distance) / det,
    y: (a.normal.x * b.distance - b.normal.x * a.distance) / det,
  }
}

/** Outlined text stays legible on any terrain fill. */
const outline = {
  paintOrder: 'stroke' as const,
  stroke: 'rgba(0,0,0,0.55)',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
}

/**
 * Where each harbour marker lands, in svg px, and how big it is. Exported so
 * `pnpm render-check` can test the real placement across all 120 frame
 * arrangements instead of a copy of it that goes stale.
 */
export function harbourAnchors(
  harbours: readonly Harbour[],
  geom: Geometry = geometry(),
): { at: Point; width: number; height: number }[] {
  const ring = geom.coastalRingNodes.map((id) => geom.nodes[id])
  const sides = frameSides(ring)
  return harbours.map((harbour) => {
    const side = sides[slotForEdge(harbour.slot, ring.length)]
    const mid = mix(geom.nodes[harbour.nodes[0]], geom.nodes[harbour.nodes[1]])
    return {
      at: scale(along(mid, side.normal, side.distance - SEA / 2 - dot(mid, side.normal))),
      width: HARBOUR_W,
      height: HARBOUR_H,
    }
  })
}

export interface BoardViewProps {
  board: Board
  draft: DraftResult
}

export function BoardView({ board, draft }: BoardViewProps) {
  const geom = geometry()

  const ringNodes = geom.coastalRingNodes.map((id) => geom.nodes[id])
  const inner = ringNodes.map((n) => scale(n))

  const sides = frameSides(ringNodes)
  // Corner `p` is where piece p-1 meets piece p, i.e. the outer end of the
  // seam at ring node p*5.
  const corners = sides.map((side, p) => meet(sides[(p + 5) % 6], side))
  const outer = corners.map(scale)

  // A piece's letter sits outside the middle of its outer edge, which on the
  // flat-topped sides reaches past the hexagon's corners — so the letters, not
  // the corners, can set the bounding box.
  const letters = sides.map((side) =>
    scale(along(side.centre, side.normal, side.distance - dot(side.centre, side.normal) + LETTER_GAP)),
  )

  const pad = LETTER_SIZE / 2 + MARGIN
  const xs = [...outer.map((p) => p.x - MARGIN), ...letters.map((p) => p.x - pad)]
  const ys = [...outer.map((p) => p.y - MARGIN), ...letters.map((p) => p.y - pad)]
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const width = Math.max(...outer.map((p) => p.x + MARGIN), ...letters.map((p) => p.x + pad)) - minX
  const height = Math.max(...outer.map((p) => p.y + MARGIN), ...letters.map((p) => p.y + pad)) - minY

  const path = (points: Point[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'

  return (
    <svg viewBox={`${minX} ${minY} ${width} ${height}`} role="img" aria-label="Generated Catan board with simulated starting settlements">
      {/* Sea frame: the band between the coast and the outer edge of the pieces. */}
      <path d={`${path(outer)} ${path(inner)}`} fillRule="evenodd" fill="var(--sea)" />

      {/* Frame piece seams and letters. */}
      {board.frame.map((piece, slot) => {
        const seamIn = inner[pieceEdgeSlot(slot, 0, inner.length)]
        const seamOut = outer[slot]
        const label = letters[slot]
        return (
          <g key={piece.id}>
            <line
              x1={seamIn.x}
              y1={seamIn.y}
              x2={seamOut.x}
              y2={seamOut.y}
              stroke="var(--sea-line)"
              strokeWidth={2}
            />
            <text
              data-role="frame-letter"
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={LETTER_SIZE}
              fontWeight={600}
              fill="var(--text-secondary)"
            >
              {piece.id}
              <title>{`Frame piece ${piece.id} — ${piece.label} (ring slot ${slot + 1})`}</title>
            </text>
          </g>
        )
      })}

      {/* Land. A 1px inset on every corner leaves the 2px surface gap between hexes. */}
      {board.hexes.map((hex, i) => {
        const center = scale(geom.centers[i])
        const corners = geom.hexNodes[i].map((id) => {
          const p = scale(geom.nodes[id])
          const d = unit({ x: p.x - center.x, y: p.y - center.y })
          return { x: p.x - d.x, y: p.y - d.y }
        })
        const count = pips(hex.number)
        return (
          <path key={`${hex.q},${hex.r}`} d={path(corners)} fill={TERRAIN[hex.resource]}>
            <title>
              {`${hex.resource}${
                hex.number === null ? ' (desert)' : ` ${hex.number} — ${count} pips`
              }`}
            </title>
          </path>
        )
      })}

      {/*
        Roads sit on the hex edges, which run straight through where the
        terrain names are set — so they go down before the names and tokens,
        and read as being on the board rather than over the labelling.
      */}
      {draft.roads.map((road) => {
        const a = scale(geom.nodes[road.from])
        const b = scale(geom.nodes[road.to])
        const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
        const start = at(ROAD_START)
        const end = at(ROAD_END)
        return (
          <g key={`road-${road.pick}`}>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="var(--surface-1)"
              strokeWidth={ROAD_W + 4}
              strokeLinecap="round"
            />
            <line
              data-role="road"
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={PLAYER_COLORS[road.player]}
              strokeWidth={ROAD_W}
              strokeLinecap="round"
            >
              <title>
                {`Player ${road.player + 1}'s road, placed with pick ${road.pick + 1}` +
                  (road.target === null
                    ? ' — no open site beyond it'
                    : ` — opens a ${road.targetScore.toFixed(1)}-point site`)}
              </title>
            </line>
          </g>
        )
      })}

      {/* Terrain names and number tokens. */}
      {board.hexes.map((hex, i) => {
        const center = scale(geom.centers[i])
        const red = hex.number === 6 || hex.number === 8
        const count = pips(hex.number)
        return (
          <g key={`label-${hex.q},${hex.r}`}>
            <text
              data-role="terrain"
              x={center.x}
              y={center.y - 26}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              letterSpacing="0.06em"
              fill="#ffffff"
              {...outline}
            >
              {hex.resource.toUpperCase()}
            </text>
            {hex.number !== null && (
              <g>
                <circle cx={center.x} cy={center.y + 6} r={15} fill="var(--token)" />
                <text
                  x={center.x}
                  y={center.y + 3}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={16}
                  fontWeight={700}
                  fill={red ? '#d03b3b' : '#0b0b0b'}
                >
                  {hex.number}
                </text>
                {Array.from({ length: count }, (_, k) => (
                  <circle
                    key={k}
                    cx={center.x + (k - (count - 1) / 2) * 4}
                    cy={center.y + 14}
                    r={1.4}
                    fill={red ? '#d03b3b' : '#0b0b0b'}
                  />
                ))}
              </g>
            )}
          </g>
        )
      })}

      {/* Harbours, drawn in the sea band with a dock line to each usable corner. */}
      {board.harbours.map((harbour) => {
        const [a, b] = harbour.nodes.map((id) => scale(geom.nodes[id]))
        // Sit the marker on its own piece's normal, halfway between the
        // coastline's furthest reach and the frame's outer edge, so it clears
        // both whatever angle the piece is at.
        const side = sides[slotForEdge(harbour.slot, ringNodes.length)]
        const mid = mix(geom.nodes[harbour.nodes[0]], geom.nodes[harbour.nodes[1]])
        const at = scale(
          along(mid, side.normal, side.distance - SEA / 2 - dot(mid, side.normal)),
        )
        const fill = harbour.kind === 'generic' ? 'var(--token)' : TERRAIN[harbour.kind]
        const ink = harbour.kind === 'generic' || harbour.kind === 'sheep' || harbour.kind === 'wheat'
        return (
          <g key={`${harbour.slot}`}>
            <line x1={at.x} y1={at.y} x2={a.x} y2={a.y} stroke="var(--sea-line)" strokeWidth={2} />
            <line x1={at.x} y1={at.y} x2={b.x} y2={b.y} stroke="var(--sea-line)" strokeWidth={2} />
            <rect
              data-role="harbour"
              x={at.x - HARBOUR_W / 2}
              y={at.y - HARBOUR_H / 2}
              width={HARBOUR_W}
              height={HARBOUR_H}
              rx={6}
              fill={fill}
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
            <text
              x={at.x}
              y={at.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={HARBOUR_TEXT}
              fontWeight={600}
              fill={ink ? '#0b0b0b' : '#ffffff'}
            >
              {harbourLabel(harbour.kind)}
              <title>{`${harbourLabel(harbour.kind)} harbour on frame piece ${harbour.piece}`}</title>
            </text>
          </g>
        )
      })}

      {/* Starting settlements, numbered so identity never rests on colour. */}
      {draft.placements.map((placement) => {
        const p = scale(geom.nodes[placement.node])
        const pays = draft.openingHands.some((h) => h.node === placement.node)
        return (
          <g key={placement.pick}>
            {/* A second ring marks the settlement that pays out at setup. */}
            {pays && (
              <circle
                data-role="payout"
                cx={p.x}
                cy={p.y}
                r={17}
                fill="none"
                stroke={PLAYER_COLORS[placement.player]}
                strokeWidth={2.5}
              />
            )}
            <circle
              data-role="settlement"
              cx={p.x}
              cy={p.y}
              r={12}
              fill={PLAYER_COLORS[placement.player]}
              stroke="var(--surface-1)"
              strokeWidth={pays ? 3 : 2}
            />
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={13}
              fontWeight={700}
              fill={PLAYER_INK[placement.player]}
            >
              {placement.player + 1}
              <title>
                {`Player ${placement.player + 1}, pick ${placement.pick + 1} of 8 — +${placement.marginal.toFixed(2)} points` +
                  (pays ? ' — pays out at setup' : '')}
              </title>
            </text>
          </g>
        )
      })}
    </svg>
  )
}
