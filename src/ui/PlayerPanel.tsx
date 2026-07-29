// What each starting position is worth, and the breakdown behind it.
//
// The bar chart answers "who is ahead"; the table carries every number, which is
// also the relief the light-mode palette requires for its sub-3:1 slots.

import { PRODUCING_RESOURCES, type Board } from '../board'
import type { DraftResult } from '../placement'
import { PLAYER_COLORS, harbourLabel } from './BoardView'

export function PlayerPanel({ board, draft }: { board: Board; draft: DraftResult }) {
  const max = Math.max(...draft.totals)
  const min = Math.min(...draft.totals)
  const axisMax = Math.ceil(max / 5) * 5

  const harboursOf = (player: number) =>
    board.harbours
      .filter((h) => h.nodes.some((n) => draft.settlements[player].includes(n)))
      .map((h) => harbourLabel(h.kind))

  return (
    <section className="card">
      <h2>Starting positions</h2>
      <p className="note">
        Snake draft 1-2-3-4-4-3-2-1, each player greedily taking the best location still legal for
        them. Bars share a zero baseline; the axis runs to {axisMax}.
      </p>

      <div className="bars">
        {draft.totals.map((total, player) => (
          <div className="bar-row" key={player}>
            <span className="bar-label">
              <span className="swatch round" style={{ background: PLAYER_COLORS[player] }} />
              Player {player + 1}
            </span>
            <div className="bar-track" title={`Player ${player + 1}: ${total.toFixed(2)} points`}>
              <div
                className="bar-fill"
                style={{ width: `${(total / axisMax) * 100}%`, background: PLAYER_COLORS[player] }}
              />
            </div>
            <span className="bar-value">{total.toFixed(1)}</span>
          </div>
        ))}
      </div>

      <p className="spread-note">
        Spread {(max - min).toFixed(2)} points between the best and worst starting position.
      </p>

      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              {PRODUCING_RESOURCES.map((r) => (
                <th key={r}>{r}</th>
              ))}
              <th>Numbers</th>
              <th>Resources</th>
              <th>Robber</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {draft.scores.map((score, player) => (
              <tr key={player}>
                <td>
                  <span className="player-cell">
                    <span className="swatch round" style={{ background: PLAYER_COLORS[player] }} />
                    Player {player + 1}
                  </span>
                </td>
                {PRODUCING_RESOURCES.map((r) => (
                  <td key={r} title={score.multipliers[r] > 1 ? `×${score.multipliers[r]} harbour` : undefined}>
                    {score.byResource[r].toFixed(2)}
                    {score.multipliers[r] > 1 ? '*' : ''}
                  </td>
                ))}
                <td>+{score.numberBonus.toFixed(2)}</td>
                <td>+{score.resourceBonus.toFixed(2)}</td>
                <td>−{score.robberTax.toFixed(2)}</td>
                <td className="total">{score.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note" style={{ marginTop: 12 }}>
        * multiplied by a harbour the player settled on.{' '}
        {draft.settlements.map((_, player) => {
          const harbours = harboursOf(player)
          return harbours.length ? `P${player + 1}: ${harbours.join(', ')}. ` : ''
        })}
      </p>
    </section>
  )
}
