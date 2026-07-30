// Location valuation.
//
// A location's *common* value is the pip-weighted sum of its adjacent hexes.
// A location's value *to a particular player* additionally depends on what that
// player already owns — harbours, distinct numbers, distinct resources — which
// is why the greedy draft has to re-rank the board for every pick.
//
// The model is not ours. It comes from two Board Game Analysis articles:
//   https://www.boardgameanalysis.com/fair-catan-boards-this-time-with-resources/
//   https://www.boardgameanalysis.com/what-is-a-balanced-catan-board/
// See README for what they cover and what had to be reverse-engineered.

import {
  geometry,
  pips,
  type Board,
  type Geometry,
  type HarbourKind,
  type Hex,
  type ProducingResource,
  type Resource,
  PRODUCING_RESOURCES,
} from './board'

/**
 * Average expected cost of the top 50 fastest victories, from the resource
 * values table in "Fair Catan Boards, this time with resources!" (see README).
 * Exported as a single constant so it is easy to retune from the UI.
 */
export const RESOURCE_VALUES: Readonly<Record<Resource, number>> = {
  wheat: 1.35,
  ore: 1.329,
  wood: 0.781,
  brick: 0.781,
  sheep: 0.76,
  desert: 0,
}

/** Settling on a 2:1 harbour multiplies the player's score for that resource. */
export const HARBOUR_2_1_MULTIPLIER = 1.4
/** Settling on a 3:1 harbour multiplies the player's score for every resource. */
export const HARBOUR_3_1_MULTIPLIER = 1.1
/** Per distinct roll number the player has settled (max +0.9 per settlement). */
export const NUMBER_BONUS = 0.3
/** Per distinct resource the player has settled (max +0.93 per settlement). */
export const RESOURCE_BONUS = 0.31
/** Fraction of the player's highest expected card return lost to the robber. */
export const ROBBER_TAX_FRACTION = 0.5

export type ResourceValues = Readonly<Record<Resource, number>>

/**
 * Everything about the valuation that a player might reasonably disagree with,
 * in one object. Both articles publish the resource values and invite argument
 * about them; the robber fraction is our own reading (see README), which is all
 * the more reason to be able to turn it.
 */
export interface Tuning {
  values: ResourceValues
  /** Score multiplier for production matching a settled 2:1 harbour. */
  harbour2To1: number
  /** Score multiplier for all production when settled on a 3:1 harbour. */
  harbour3To1: number
  /** Fraction of the highest-paying hex's return lost to the robber. */
  robberTax: number
}

export const DEFAULT_TUNING: Tuning = {
  values: RESOURCE_VALUES,
  harbour2To1: HARBOUR_2_1_MULTIPLIER,
  harbour3To1: HARBOUR_3_1_MULTIPLIER,
  robberTax: ROBBER_TAX_FRACTION,
}

/** Per-board lookup tables, built once and reused across all 8 draft picks. */
export interface ScoringIndex {
  geom: Geometry
  hexes: Hex[]
  hexPips: number[]
  values: ResourceValues
  harbour2To1: number
  harbour3To1: number
  robberTax: number
  /** node id -> adjacent hex indices */
  nodeHexes: number[][]
  /** node id -> harbour kinds reachable from it (0 or 1 in practice) */
  nodeHarbours: HarbourKind[][]
  /** node id -> common (player-independent) location score */
  locationScores: number[]
}

export function buildScoringIndex(board: Board, tuning: Partial<Tuning> = {}): ScoringIndex {
  const {
    values = RESOURCE_VALUES,
    harbour2To1 = HARBOUR_2_1_MULTIPLIER,
    harbour3To1 = HARBOUR_3_1_MULTIPLIER,
    robberTax = ROBBER_TAX_FRACTION,
  } = tuning
  const geom = geometry()
  const hexPips = board.hexes.map((h) => pips(h.number))
  const nodeHexes = geom.nodes.map((n) => n.hexes)

  const nodeHarbours: HarbourKind[][] = geom.nodes.map(() => [])
  for (const h of board.harbours) {
    for (const n of h.nodes) nodeHarbours[n].push(h.kind)
  }

  const locationScores = geom.nodes.map((n) => {
    let total = 0
    for (const hi of n.hexes) total += hexPips[hi] * values[board.hexes[hi].resource]
    return total
  })

  return {
    geom,
    hexes: board.hexes,
    hexPips,
    values,
    harbour2To1,
    harbour3To1,
    robberTax,
    nodeHexes,
    nodeHarbours,
    locationScores,
  }
}

/** Common location score — the article's static right-hand list. */
export function locationScore(index: ScoringIndex, node: number): number {
  return index.locationScores[node]
}

export interface PlayerScore {
  total: number
  /** Post-multiplier contribution of each resource. */
  byResource: Record<ProducingResource, number>
  /** Sum of `byResource`. */
  base: number
  numberBonus: number
  resourceBonus: number
  /** Positive number that has already been subtracted from `total`. */
  robberTax: number
  multipliers: Record<ProducingResource, number>
  distinctNumbers: number
  distinctResources: number
}

function emptyByResource(): Record<ProducingResource, number> {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }
}

/**
 * Score a player's settlements.
 *
 * Harbour multipliers apply to the player's whole portfolio of that resource;
 * when several harbours cover the same resource the best one wins rather than
 * compounding. The robber tax only bites once the player has placed their
 * second settlement.
 */
export function playerScore(index: ScoringIndex, settlements: readonly number[]): PlayerScore {
  const multipliers: Record<ProducingResource, number> = {
    wood: 1,
    brick: 1,
    sheep: 1,
    wheat: 1,
    ore: 1,
  }

  for (const node of settlements) {
    for (const kind of index.nodeHarbours[node]) {
      if (kind === 'generic') {
        for (const r of PRODUCING_RESOURCES) {
          multipliers[r] = Math.max(multipliers[r], index.harbour3To1)
        }
      } else {
        multipliers[kind] = Math.max(multipliers[kind], index.harbour2To1)
      }
    }
  }

  const byResource = emptyByResource()
  const numbers = new Set<number>()
  const resources = new Set<ProducingResource>()
  let highestReturn = 0

  for (const node of settlements) {
    for (const hi of index.nodeHexes[node]) {
      const hex = index.hexes[hi]
      if (hex.resource === 'desert') continue
      const resource = hex.resource as ProducingResource
      const p = index.hexPips[hi]
      byResource[resource] += p * index.values[resource]
      resources.add(resource)
      if (hex.number !== null) numbers.add(hex.number)
      if (p > highestReturn) highestReturn = p
    }
  }

  let base = 0
  for (const r of PRODUCING_RESOURCES) {
    byResource[r] *= multipliers[r]
    base += byResource[r]
  }

  const numberBonus = NUMBER_BONUS * numbers.size
  const resourceBonus = RESOURCE_BONUS * resources.size
  const robberTax = settlements.length >= 2 ? index.robberTax * highestReturn : 0

  return {
    total: base + numberBonus + resourceBonus - robberTax,
    byResource,
    base,
    numberBonus,
    resourceBonus,
    robberTax,
    multipliers,
    distinctNumbers: numbers.size,
    distinctResources: resources.size,
  }
}

/**
 * Marginal value of adding `candidate` to a player who already holds
 * `settlements` — the quantity the greedy draft maximises.
 */
export function marginalScore(
  index: ScoringIndex,
  settlements: readonly number[],
  candidate: number,
): number {
  const before = settlements.length === 0 ? 0 : playerScore(index, settlements).total
  return playerScore(index, [...settlements, candidate]).total - before
}
