// Sweep random boards, score each with CIBI+, and keep the best (or worst).
//
// Every candidate is derived from a single 32-bit board seed, so any board the
// sweep surfaces can be reproduced — and shared — as a short seed string.

import { generateFullBoard, makeRng, type Board } from './board'
import { evaluateBoard, type Balance, type BoardEvaluation } from './fairness'
import type { ResourceValues } from './scoring'

export type SweepMode = 'best' | 'worst'

export interface SweepOptions {
  /** How many random boards to examine. */
  boards: number
  /** Master seed; the same seed always examines the same boards. */
  seed: number
  mode?: SweepMode
  /** How many boards to return. */
  keep?: number
  values?: ResourceValues
  /** Called every `progressEvery` boards with the number examined so far. */
  onProgress?: (examined: number, total: number) => void
  progressEvery?: number
  /** Return early — used by the worker to honour a cancel. */
  shouldStop?: () => boolean
}

export interface SweepStats {
  examined: number
  cibiMin: number
  cibiMax: number
  cibiMean: number
  spreadMin: number
  spreadMax: number
  /** Largest raw value seen for each balance metric — feeds the normalisers. */
  rawMax: Balance
}

export interface SweepResult {
  seed: number
  mode: SweepMode
  results: Array<BoardEvaluation & { boardSeed: number }>
  stats: SweepStats
}

/** Rebuild the exact board a 32-bit board seed describes. */
export function boardFromSeed(boardSeed: number): Board {
  return generateFullBoard(makeRng(boardSeed))
}

export function evaluateSeed(boardSeed: number, values?: ResourceValues): BoardEvaluation {
  return evaluateBoard(boardFromSeed(boardSeed), values)
}

export function sweep(options: SweepOptions): SweepResult {
  const {
    boards,
    seed,
    mode = 'best',
    keep = 1,
    values,
    onProgress,
    progressEvery = 500,
    shouldStop,
  } = options

  const master = makeRng(seed)
  const kept: Array<BoardEvaluation & { boardSeed: number }> = []
  // 'best' keeps the lowest CIBI+, 'worst' the highest.
  const worseThan = (a: number, b: number) => (mode === 'best' ? a > b : a < b)

  let cibiMin = Infinity
  let cibiMax = -Infinity
  let cibiSum = 0
  let spreadMin = Infinity
  let spreadMax = -Infinity
  const rawMax: Balance = {
    resourceProbabilityDistribution: 0,
    rollNumberClustering: 0,
    resourceClustering: 0,
    harbourReturnBalance: 0,
  }

  let examined = 0
  for (let i = 0; i < boards; i++) {
    if (shouldStop?.()) break
    const boardSeed = Math.floor(master() * 0x100000000) >>> 0
    const evaluation = evaluateSeed(boardSeed, values)
    examined++

    cibiSum += evaluation.cibiPlus
    if (evaluation.cibiPlus < cibiMin) cibiMin = evaluation.cibiPlus
    if (evaluation.cibiPlus > cibiMax) cibiMax = evaluation.cibiPlus
    if (evaluation.spread < spreadMin) spreadMin = evaluation.spread
    if (evaluation.spread > spreadMax) spreadMax = evaluation.spread
    for (const key of Object.keys(rawMax) as Array<keyof Balance>) {
      if (evaluation.raw[key] > rawMax[key]) rawMax[key] = evaluation.raw[key]
    }

    if (kept.length < keep || worseThan(kept[kept.length - 1].cibiPlus, evaluation.cibiPlus)) {
      const entry = { ...evaluation, boardSeed }
      let at = kept.length
      while (at > 0 && worseThan(kept[at - 1].cibiPlus, entry.cibiPlus)) at--
      kept.splice(at, 0, entry)
      if (kept.length > keep) kept.pop()
    }

    if (onProgress && examined % progressEvery === 0) onProgress(examined, boards)
  }

  onProgress?.(examined, boards)

  return {
    seed,
    mode,
    results: kept,
    stats: {
      examined,
      cibiMin,
      cibiMax,
      cibiMean: examined === 0 ? NaN : cibiSum / examined,
      spreadMin,
      spreadMax,
      rawMax,
    },
  }
}
