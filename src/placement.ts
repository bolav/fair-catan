// The starting-settlement simulation (TODO §2.5).
//
// Four players, snake draft 1-2-3-4-4-3-2-1. Each player greedily takes the
// location with the highest *marginal* value to them among the positions still
// legal under the distance rule. Because harbours and the distinct-number /
// distinct-resource bonuses are player-specific, the ranking differs per player
// on the second round — that asymmetry is the whole point of the measure.

import { playerScore, type PlayerScore, type ScoringIndex } from './scoring'

export const PLAYER_COUNT = 4
export const DRAFT_ORDER = [0, 1, 2, 3, 3, 2, 1, 0]

export interface Placement {
  /** 0-based pick index, 0..7. */
  pick: number
  player: number
  node: number
  /** Increase in the player's total score from taking this node. */
  marginal: number
}

export interface DraftResult {
  /** Settlement node ids per player, in the order they were taken. */
  settlements: number[][]
  placements: Placement[]
  scores: PlayerScore[]
  /** Convenience: `scores[i].total`. */
  totals: number[]
}

/** True if `node` is free and no settlement sits one road away. */
export function isLegal(index: ScoringIndex, occupied: boolean[], node: number): boolean {
  if (occupied[node]) return false
  for (const n of index.geom.nodes[node].nodes) {
    if (occupied[n]) return false
  }
  return true
}

export function legalNodes(index: ScoringIndex, occupied: boolean[]): number[] {
  const out: number[] = []
  for (let n = 0; n < occupied.length; n++) {
    if (isLegal(index, occupied, n)) out.push(n)
  }
  return out
}

export function runDraft(index: ScoringIndex): DraftResult {
  const nodeCount = index.geom.nodes.length
  const occupied = new Array<boolean>(nodeCount).fill(false)
  const settlements: number[][] = Array.from({ length: PLAYER_COUNT }, () => [])
  const placements: Placement[] = []

  DRAFT_ORDER.forEach((player, pick) => {
    const owned = settlements[player]
    const before = owned.length === 0 ? 0 : playerScore(index, owned).total

    let bestNode = -1
    let bestMarginal = -Infinity
    for (let node = 0; node < nodeCount; node++) {
      if (!isLegal(index, occupied, node)) continue
      const marginal = playerScore(index, [...owned, node]).total - before
      // Lowest node id wins ties, so the draft is deterministic.
      if (marginal > bestMarginal + 1e-12) {
        bestMarginal = marginal
        bestNode = node
      }
    }

    occupied[bestNode] = true
    owned.push(bestNode)
    placements.push({ pick, player, node: bestNode, marginal: bestMarginal })
  })

  const scores = settlements.map((owned) => playerScore(index, owned))
  return { settlements, placements, scores, totals: scores.map((s) => s.total) }
}
