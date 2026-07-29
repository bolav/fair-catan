// Everything needed to physically build the generated board on the table.

import { geometry, type Board, type Hex } from '../board'
import type { DraftResult } from '../placement'
import { PLAYER_COLORS } from './BoardView'

export interface SetupSheetProps {
  board: Board
  draft: DraftResult
  seed: number
}

export function SetupSheet({ board, draft, seed }: SetupSheetProps) {
  const geom = geometry()

  // Rows of the island, top to bottom, left to right — the order you lay tiles.
  const rows = [-2, -1, 0, 1, 2].map((r) =>
    board.hexes
      .map((hex, i) => ({ hex, x: geom.centers[i].x }))
      .filter((entry) => entry.hex.r === r)
      .sort((a, b) => a.x - b.x)
      .map((entry) => entry.hex),
  )

  const hexName = (hex: Hex) => (hex.number === null ? 'desert' : `${hex.resource} ${hex.number}`)

  /**
   * There are no coordinates on a Catan board, so an intersection is named by
   * the tiles that meet at it — which is exactly how you find it on the table.
   */
  const cornerName = (node: number) =>
    geom.nodes[node].hexes.map((i) => hexName(board.hexes[i])).join(' + ')

  const harbourAt = (node: number) =>
    board.harbours.find((h) => h.nodes.includes(node))

  return (
    <section className="card sheet">
      <h2>Physical setup sheet</h2>
      <p className="note">
        Build the sea frame first: piece 1 is the top-left edge of the island, then clockwise.
      </p>

      <ol>
        {board.frame.map((piece, slot) => (
          <li key={piece.id}>
            Slot {slot + 1}: piece <code>{piece.id}</code> — {piece.label}
          </li>
        ))}
      </ol>

      <p className="note">Then lay the tiles and their number tokens, row by row.</p>
      <ol>
        {rows.map((row, i) => (
          <li key={i}>
            <span className="row-label">{row.length} tiles — </span>
            {row.map((hex) => hexName(hex)).join(', ')}
          </li>
        ))}
      </ol>

      <p className="note">
        Then the opening placements, in snake order. Each intersection is named by the tiles that
        meet at it, and each road runs from its settlement towards the intersection given.
      </p>
      <ol className="placements">
        {draft.placements.map((placement) => {
          const road = draft.roads[placement.pick]
          const harbour = harbourAt(placement.node)
          return (
            <li key={placement.pick}>
              <span className="swatch round" style={{ background: PLAYER_COLORS[placement.player] }} />
              <strong>Player {placement.player + 1}</strong>{' '}
              <span className="row-label">settles</span> {cornerName(placement.node)}
              {harbour ? <span className="row-label"> (on the {harbour.kind === 'generic' ? '3:1' : `${harbour.kind} 2:1`} harbour)</span> : null}
              <span className="row-label">, road towards</span> {cornerName(road.to)}
            </li>
          )
        })}
      </ol>

      <p className="note">
        The second settlement is the one that pays out, so deal these cards once everything is
        down. They are ringed on the board.
      </p>
      <ul className="placements">
        {draft.openingHands.map((hand) => (
          <li key={hand.player}>
            <span className="swatch round" style={{ background: PLAYER_COLORS[hand.player] }} />
            <strong>Player {hand.player + 1}</strong>{' '}
            {hand.cards.length ? hand.cards.join(', ') : <span className="row-label">nothing — desert corner</span>}
          </li>
        ))}
      </ul>

      <p className="note">
        Seed <code>{seed}</code> — reproduces this exact board, frame included.
      </p>
    </section>
  )
}
