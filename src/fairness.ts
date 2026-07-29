// The Fairness Measure (TODO §2.6), the four CIBI balance sub-metrics (§2.8)
// and the CIBI+ index that combines them (§2.7).
//
//   CIBI+ = ( mean(RPD, RollNumberClustering, ResourceClustering, HarborReturnBalance)
//             + FairnessMeasure ) / 2
//
// Lower is better. The article's best 50 boards land at 0.064-0.069, its worst
// 50 at 0.44-0.62.

import {
  geometry,
  pips,
  PRODUCING_RESOURCES,
  TOTAL_PIPS,
  type Board,
  type Geometry,
  type ProducingResource,
} from './board'
import { buildScoringIndex, type ResourceValues } from './scoring'
import { runDraft, type DraftResult } from './placement'

/**
 * Player scores are compared after rounding to one decimal, and a spread of 15
 * points is treated as maximally unfair.
 *
 * Reverse-engineered from the fair-board image and the unfair-board image, where
 * every Fairness Board Measure is an exact multiple of 1/150 = 0.1/15.
 */
export const FAIRNESS_SPREAD_DIVISOR = 15
export const FAIRNESS_SCORE_PRECISION = 1

/**
 * Each raw balance metric is divided by its largest attainable value, so each
 * lands in 0..1. cibi.txt describes this divisor as "the highest value obtained
 * on a 100 million board run" — for these metrics that run evidently found the
 * true maximum, because two of the four divisors the articles state outright
 * are reproduced exactly by a direct search (`src/tools/maximise.ts`):
 *
 *   roll number clustering  30      <- stated by the article
 *   resource clustering    100      <- implied by the renders quantising at 0.05
 *   resource probability   115.259  = 9336/81, from pips {5,5,5,5} {4,4,4,4}
 *                                     {1,1,2,2} {2,2,3} {3,3,3}
 *   harbor return balance  492.889  = 4436/9
 *
 * A 15M-board random sweep reaches 113.3 / 30 / 95 / 396, i.e. it approaches
 * these from below, as expected. (TODO §2.8 guessed ~39 for the resource
 * probability divisor from render quantisation; that does not survive contact
 * with the metric's actual 1/9 step size, so the attainable maximum is used.)
 */
export const NORMALIZERS = {
  resourceProbabilityDistribution: 9336 / 81,
  rollNumberClustering: 30,
  resourceClustering: 100,
  harbourReturnBalance: 4436 / 9,
} as const

export type BalanceKey = keyof typeof NORMALIZERS

export const BALANCE_LABELS: Record<BalanceKey, string> = {
  resourceProbabilityDistribution: 'Resource probability distribution',
  rollNumberClustering: 'Roll number clustering',
  resourceClustering: 'Resource clustering',
  harbourReturnBalance: 'Harbour return balance',
}

export type Balance = Record<BalanceKey, number>

/** Pips a resource "should" receive: its tile count's share of the 58 pips. */
export function expectedPips(tileCount: number): number {
  return (tileCount * TOTAL_PIPS) / 18
}

const TILE_COUNTS: Record<ProducingResource, number> = {
  wood: 4,
  sheep: 4,
  wheat: 4,
  brick: 3,
  ore: 3,
}

/**
 * Sum of squared deviations of each resource's total pips from its expected
 * share. Never reaches 0, because the expected values are not integers.
 */
export function resourceProbabilityDistribution(board: Board): number {
  const actual: Record<ProducingResource, number> = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }
  for (const hex of board.hexes) {
    if (hex.resource === 'desert') continue
    actual[hex.resource as ProducingResource] += pips(hex.number)
  }
  let score = 0
  for (const r of PRODUCING_RESOURCES) {
    const diff = actual[r] - expectedPips(TILE_COUNTS[r])
    score += diff * diff
  }
  return score
}

/** +5 for every edge shared by two hexes carrying the same number. */
export function rollNumberClustering(board: Board, geom: Geometry = geometry()): number {
  let score = 0
  for (const edge of geom.edges) {
    if (edge.hexes.length !== 2) continue
    const a = board.hexes[edge.hexes[0]]
    const b = board.hexes[edge.hexes[1]]
    if (a.number !== null && a.number === b.number) score += 5
  }
  return score
}

/** +5 for every edge shared by two hexes of the same resource. */
export function resourceClustering(board: Board, geom: Geometry = geometry()): number {
  let score = 0
  for (const edge of geom.edges) {
    if (edge.hexes.length !== 2) continue
    const a = board.hexes[edge.hexes[0]]
    const b = board.hexes[edge.hexes[1]]
    if (a.resource === b.resource) score += 5
  }
  return score
}

/**
 * Per harbour, take the better of its two settlement positions, where a
 * position is worth the pips of its adjacent hexes with hexes matching the
 * harbour's resource counted double. The metric is the sum of squared
 * deviations of those 9 values from their mean (the article keeps the sum, not
 * the variance).
 */
export function harbourReturnBalance(board: Board, geom: Geometry = geometry()): number {
  const scores = board.harbours.map((harbour) => {
    let best = 0
    for (const node of harbour.nodes) {
      let total = 0
      for (const hi of geom.nodes[node].hexes) {
        const hex = board.hexes[hi]
        const p = pips(hex.number)
        total += hex.resource === harbour.kind ? p * 2 : p
      }
      if (total > best) best = total
    }
    return best
  })

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  return scores.reduce((sum, s) => sum + (s - mean) ** 2, 0)
}

export function rawBalance(board: Board, geom: Geometry = geometry()): Balance {
  return {
    resourceProbabilityDistribution: resourceProbabilityDistribution(board),
    rollNumberClustering: rollNumberClustering(board, geom),
    resourceClustering: resourceClustering(board, geom),
    harbourReturnBalance: harbourReturnBalance(board, geom),
  }
}

export function normalizeBalance(raw: Balance): Balance {
  return {
    resourceProbabilityDistribution:
      raw.resourceProbabilityDistribution / NORMALIZERS.resourceProbabilityDistribution,
    rollNumberClustering: raw.rollNumberClustering / NORMALIZERS.rollNumberClustering,
    resourceClustering: raw.resourceClustering / NORMALIZERS.resourceClustering,
    harbourReturnBalance: raw.harbourReturnBalance / NORMALIZERS.harbourReturnBalance,
  }
}

/** Spread between the best- and worst-off starting player, normalised. */
export function fairnessMeasure(totals: readonly number[]): number {
  const factor = 10 ** FAIRNESS_SCORE_PRECISION
  const rounded = totals.map((t) => Math.round(t * factor) / factor)
  const spread = Math.max(...rounded) - Math.min(...rounded)
  return Math.min(1, Math.max(0, spread / FAIRNESS_SPREAD_DIVISOR))
}

export function cibiPlus(balance: Balance, fairness: number): number {
  const keys = Object.keys(NORMALIZERS) as BalanceKey[]
  const mean = keys.reduce((sum, k) => sum + balance[k], 0) / keys.length
  return (mean + fairness) / 2
}

export interface BoardEvaluation {
  board: Board
  draft: DraftResult
  raw: Balance
  balance: Balance
  fairness: number
  /** Raw point spread between the best and worst starting position. */
  spread: number
  cibiPlus: number
}

export function evaluateBoard(board: Board, values?: ResourceValues): BoardEvaluation {
  const geom = geometry()
  const index = buildScoringIndex(board, values)
  const draft = runDraft(index)
  const raw = rawBalance(board, geom)
  const balance = normalizeBalance(raw)
  const fairness = fairnessMeasure(draft.totals)
  return {
    board,
    draft,
    raw,
    balance,
    fairness,
    spread: Math.max(...draft.totals) - Math.min(...draft.totals),
    cibiPlus: cibiPlus(balance, fairness),
  }
}
