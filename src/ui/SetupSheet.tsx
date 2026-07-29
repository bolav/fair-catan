// Everything needed to physically build the generated board on the table.

import { geometry, type Board, type Hex } from '../board'
import { encodeBoardCode } from '../code'
import type { DraftResult } from '../placement'
import { PLAYER_COLORS } from './BoardView'

export interface SetupSheetShow {
  settlements: boolean
  roads: boolean
  cards: boolean
}

export const SHEET_SHOW_ALL: SetupSheetShow = { settlements: true, roads: true, cards: true }

export interface SetupSheetProps {
  board: Board
  draft: DraftResult
  seed: number
  show?: SetupSheetShow
}

export function SetupSheet({ board, draft, seed, show = SHEET_SHOW_ALL }: SetupSheetProps) {
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

      {(show.settlements || show.roads) && (
        <>
          <p className="note">
            Then the opening placements, in snake order. Each intersection is named by the tiles
            that meet at it
            {show.roads ? ', and each road runs from its settlement towards the one given' : ''}.
          </p>
          <ol className="placements">
            {draft.placements.map((placement) => {
              const road = draft.roads[placement.pick]
              const harbour = harbourAt(placement.node)
              return (
                <li key={placement.pick}>
                  <span
                    className="swatch round"
                    style={{ background: PLAYER_COLORS[placement.player] }}
                  />
                  <strong>Player {placement.player + 1}</strong>{' '}
                  {show.settlements && (
                    <>
                      <span className="row-label">settles</span> {cornerName(placement.node)}
                      {harbour ? (
                        <span className="row-label">
                          {' '}
                          (on the{' '}
                          {harbour.kind === 'generic' ? '3:1' : `${harbour.kind} 2:1`} harbour)
                        </span>
                      ) : null}
                    </>
                  )}
                  {show.roads && (
                    <>
                      <span className="row-label">
                        {show.settlements ? ', road towards' : 'road from'}
                      </span>{' '}
                      {show.settlements ? cornerName(road.to) : (
                        <>
                          {cornerName(road.from)}{' '}
                          <span className="row-label">towards</span> {cornerName(road.to)}
                        </>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}

      {show.cards && (
        <>
          <p className="note">
            The second settlement is the one that pays out, so deal these cards once everything is
            down.{show.settlements ? ' They are ringed on the board.' : ''}
          </p>
          <ul className="placements">
            {draft.openingHands.map((hand) => (
              <li key={hand.player}>
                <span className="swatch round" style={{ background: PLAYER_COLORS[hand.player] }} />
                <strong>Player {hand.player + 1}</strong>{' '}
                {hand.cards.length ? (
                  hand.cards.join(', ')
                ) : (
                  <span className="row-label">nothing — desert corner</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="note board-code">
        Board code <code>{encodeBoardCode(seed)}</code>
        <button
          className="link"
          onClick={() => void navigator.clipboard?.writeText(encodeBoardCode(seed))}
        >
          copy
        </button>
        — paste it back into Board code to rebuild this exact island, frame included.
      </p>
    </section>
  )
}
