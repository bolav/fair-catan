// The starting-settlement simulation (TODO §2.5).
//
// Four players, snake draft 1-2-3-4-4-3-2-1. Each player greedily takes the
// location with the highest *marginal* value to them among the positions still
// legal under the distance rule. Because harbours and the distinct-number /
// distinct-resource bonuses are player-specific, the ranking differs per player
// on the second round — that asymmetry is the whole point of the measure.
//
// The model is not ours. It comes from two Board Game Analysis articles:
//   https://www.boardgameanalysis.com/fair-catan-boards-this-time-with-resources/
//   https://www.boardgameanalysis.com/what-is-a-balanced-catan-board/
// See README for what they cover and what had to be reverse-engineered.

import type { ProducingResource } from './board'
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

export interface Road {
  /** The pick whose settlement this road was placed with. */
  pick: number
  player: number
  /** Edge id in `Geometry.edges`. */
  edge: number
  /** The settlement it leaves from, and the junction it runs to. */
  from: number
  to: number
  /** Best settlement site it opens up, or null if it opens none. */
  target: number | null
  /** Common location score of `target`. */
  targetScore: number
}

export interface OpeningHand {
  player: number
  /** The settlement that pays out at setup — by the rules, the second one. */
  node: number
  /** One card per adjacent producing hex; the desert pays nothing. */
  cards: ProducingResource[]
}

export interface DraftResult {
  /** Settlement node ids per player, in the order they were taken. */
  settlements: number[][]
  placements: Placement[]
  /** One road per settlement, in pick order. */
  roads: Road[]
  /** One per player, in player order. */
  openingHands: OpeningHand[]
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

/** node-pair -> edge id, for turning a chosen road direction into an edge. */
function edgeLookup(index: ScoringIndex): Map<number, number> {
  const map = new Map<number, number>()
  const stride = index.geom.nodes.length
  for (const e of index.geom.edges) {
    map.set(Math.min(...e.nodes) * stride + Math.max(...e.nodes), e.id)
  }
  return map
}

/**
 * Where the road that comes with a settlement should go.
 *
 * A setup road is an option on a future settlement, so it is worth what the
 * best site it reaches is worth. From settlement `from` a road to neighbour
 * `to` opens the junctions one further step on — `to` itself is always dead,
 * being one road from a settlement. Sites are judged on common location score
 * and on being legal at the moment the road is placed, which is what a player
 * at the table can see; a later pick may still take the target.
 */
function chooseRoad(
  index: ScoringIndex,
  edges: Map<number, number>,
  occupied: boolean[],
  pick: number,
  player: number,
  from: number,
): Road {
  const stride = index.geom.nodes.length
  let best: Road | null = null

  for (const to of index.geom.nodes[from].nodes) {
    let target: number | null = null
    let targetScore = -Infinity
    for (const beyond of index.geom.nodes[to].nodes) {
      if (beyond === from) continue
      if (!isLegal(index, occupied, beyond)) continue
      const score = index.locationScores[beyond]
      // Lowest node id wins ties, so the draft stays deterministic.
      if (score > targetScore + 1e-12) {
        targetScore = score
        target = beyond
      }
    }
    const candidate: Road = {
      pick,
      player,
      edge: edges.get(Math.min(from, to) * stride + Math.max(from, to))!,
      from,
      to,
      target,
      targetScore: target === null ? 0 : targetScore,
    }
    if (best === null || candidate.targetScore > best.targetScore + 1e-12) best = candidate
  }

  return best!
}

/** One card per adjacent producing hex — what a settlement pays out at setup. */
export function openingCards(index: ScoringIndex, node: number): ProducingResource[] {
  const cards: ProducingResource[] = []
  for (const hi of index.nodeHexes[node]) {
    const hex = index.hexes[hi]
    if (hex.resource === 'desert') continue
    cards.push(hex.resource as ProducingResource)
  }
  return cards.sort()
}

export function runDraft(index: ScoringIndex): DraftResult {
  const nodeCount = index.geom.nodes.length
  const occupied = new Array<boolean>(nodeCount).fill(false)
  const settlements: number[][] = Array.from({ length: PLAYER_COUNT }, () => [])
  const placements: Placement[] = []
  const roads: Road[] = []
  const edges = edgeLookup(index)

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
    // The road goes down with the settlement, so it only sees the board as it
    // stands at this pick.
    roads.push(chooseRoad(index, edges, occupied, pick, player, bestNode))
  })

  // By the rules the second settlement is the one that pays out at setup.
  const openingHands: OpeningHand[] = settlements.map((owned, player) => ({
    player,
    node: owned[1],
    cards: openingCards(index, owned[1]),
  }))

  const scores = settlements.map((owned) => playerScore(index, owned))
  return { settlements, placements, roads, openingHands, scores, totals: scores.map((s) => s.total) }
}
