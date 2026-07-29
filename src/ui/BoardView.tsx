// The island, its sea frame and the eight simulated starting settlements.
//
// This is a map, not a chart: every hex carries its resource name and number
// token, every harbour its ratio and resource, and every settlement the number
// of the player who took it — so nothing here is identified by colour alone.

import { geometry, pips, type Board, type HarbourKind, type Resource } from '../board'
import type { DraftResult } from '../placement'

const S = 46 // px per hex circumradius
const SEA = 1.0 // width of the sea frame, in the same units
const MARGIN = 36 // px of extra room for the frame-piece letters

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

/** Outlined text stays legible on any terrain fill. */
const outline = {
  paintOrder: 'stroke' as const,
  stroke: 'rgba(0,0,0,0.55)',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
}

export interface BoardViewProps {
  board: Board
  draft: DraftResult
}

export function BoardView({ board, draft }: BoardViewProps) {
  const geom = geometry()

  const ringNodes = geom.coastalRingNodes.map((id) => geom.nodes[id])
  const inner = ringNodes.map((n) => scale(n))
  const outer = ringNodes.map((n) => {
    const d = unit(n)
    return scale({ x: n.x + d.x * SEA, y: n.y + d.y * SEA })
  })

  const xs = outer.map((p) => p.x)
  const ys = outer.map((p) => p.y)
  const minX = Math.min(...xs) - MARGIN
  const minY = Math.min(...ys) - MARGIN
  const width = Math.max(...xs) + MARGIN - minX
  const height = Math.max(...ys) + MARGIN - minY

  const path = (points: Point[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'

  return (
    <svg viewBox={`${minX} ${minY} ${width} ${height}`} role="img" aria-label="Generated Catan board with simulated starting settlements">
      {/* Sea frame: the band between the coast and the outer edge of the pieces. */}
      <path d={`${path(outer)} ${path(inner)}`} fillRule="evenodd" fill="var(--sea)" />

      {/* Frame piece seams and letters. */}
      {board.frame.map((piece, slot) => {
        const seamIn = inner[slot * 5]
        const seamOut = outer[slot * 5]
        const midIndex = slot * 5 + 2
        const a = ringNodes[midIndex]
        const b = ringNodes[(midIndex + 1) % ringNodes.length]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const d = unit(mid)
        const label = scale({ x: mid.x + d.x * (SEA + 0.42), y: mid.y + d.y * (SEA + 0.42) })
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
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={15}
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
        const red = hex.number === 6 || hex.number === 8
        const count = pips(hex.number)
        return (
          <g key={`${hex.q},${hex.r}`}>
            <path d={path(corners)} fill={TERRAIN[hex.resource]}>
              <title>
                {`${hex.resource}${
                  hex.number === null ? ' (desert)' : ` ${hex.number} — ${count} pips`
                }`}
              </title>
            </path>
            <text
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
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const d = unit(mid)
        const at = { x: mid.x + d.x * SEA * S * 0.55, y: mid.y + d.y * SEA * S * 0.55 }
        const fill = harbour.kind === 'generic' ? 'var(--token)' : TERRAIN[harbour.kind]
        const ink = harbour.kind === 'generic' || harbour.kind === 'sheep' || harbour.kind === 'wheat'
        return (
          <g key={`${harbour.slot}`}>
            <line x1={at.x} y1={at.y} x2={a.x} y2={a.y} stroke="var(--sea-line)" strokeWidth={2} />
            <line x1={at.x} y1={at.y} x2={b.x} y2={b.y} stroke="var(--sea-line)" strokeWidth={2} />
            <rect
              x={at.x - 27}
              y={at.y - 11}
              width={54}
              height={22}
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
              fontSize={10}
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
        return (
          <g key={placement.pick}>
            <circle
              cx={p.x}
              cy={p.y}
              r={12}
              fill={PLAYER_COLORS[placement.player]}
              stroke="var(--surface-1)"
              strokeWidth={2}
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
                {`Player ${placement.player + 1}, pick ${placement.pick + 1} of 8 — +${placement.marginal.toFixed(2)} points`}
              </title>
            </text>
          </g>
        )
      })}
    </svg>
  )
}
