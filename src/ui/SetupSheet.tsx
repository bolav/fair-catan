// Everything needed to physically build the generated board on the table.

import { geometry, type Board } from '../board'

export function SetupSheet({ board, seed }: { board: Board; seed: number }) {
  const geom = geometry()

  // Rows of the island, top to bottom, left to right — the order you lay tiles.
  const rows = [-2, -1, 0, 1, 2].map((r) =>
    board.hexes
      .map((hex, i) => ({ hex, x: geom.centers[i].x }))
      .filter((entry) => entry.hex.r === r)
      .sort((a, b) => a.x - b.x)
      .map((entry) => entry.hex),
  )

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
            {row
              .map((hex) => (hex.number === null ? 'desert' : `${hex.resource} ${hex.number}`))
              .join(', ')}
          </li>
        ))}
      </ol>

      <p className="note">
        Seed <code>{seed}</code> — reproduces this exact board, frame included.
      </p>
    </section>
  )
}
