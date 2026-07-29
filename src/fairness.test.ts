import { describe, expect, it } from 'vitest'
import { generateFullBoard, makeRng } from './board'
import {
  cibiPlus,
  evaluateBoard,
  fairnessMeasure,
  NORMALIZERS,
  rawBalance,
  resourceProbabilityDistribution,
  rollNumberClustering,
  type BalanceKey,
} from './fairness'
import { sweep } from './generate'

const KEYS = Object.keys(NORMALIZERS) as BalanceKey[]
const boards = Array.from({ length: 200 }, (_, i) => generateFullBoard(makeRng(2000 + i)))

describe('balance components', () => {
  it('never exceeds the roll number clustering ceiling of 30', () => {
    for (const board of boards) {
      const score = rollNumberClustering(board)
      expect(score).toBeLessThanOrEqual(30)
      expect(score % 5).toBe(0)
    }
  })

  it('scores resource clustering in multiples of 5', () => {
    for (const board of boards) {
      expect(rawBalance(board).resourceClustering % 5).toBe(0)
    }
  })

  it('never reaches 0 on the resource probability distribution', () => {
    for (const board of boards) {
      // The expected payouts are not whole numbers, so 9336/81's counterpart
      // at the bottom of the range is 28/27, never zero.
      expect(resourceProbabilityDistribution(board)).toBeGreaterThanOrEqual(28 / 27 - 1e-9)
    }
  })

  it('normalises every component into 0..1', () => {
    for (const board of boards) {
      const { balance } = evaluateBoard(board)
      for (const key of KEYS) {
        expect(balance[key]).toBeGreaterThanOrEqual(0)
        expect(balance[key]).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('fairnessMeasure', () => {
  it('is 0 for four identical starting positions', () => {
    expect(fairnessMeasure([20, 20, 20, 20])).toBe(0)
  })

  it('scales the spread by 15 and clamps at 1', () => {
    expect(fairnessMeasure([10, 12.5, 11, 13])).toBeCloseTo(3 / 15, 10)
    expect(fairnessMeasure([0, 40, 10, 20])).toBe(1)
  })

  it('rounds player scores to one decimal first', () => {
    // 1/150 is the smallest step the measure can take.
    expect(fairnessMeasure([10.04, 10.0, 10.0, 10.0])).toBe(0)
    expect(fairnessMeasure([10.06, 10.0, 10.0, 10.0])).toBeCloseTo(0.1 / 15, 10)
  })

  it('stays in 0..1 over real boards', () => {
    for (const board of boards) {
      const { fairness } = evaluateBoard(board)
      expect(fairness).toBeGreaterThanOrEqual(0)
      expect(fairness).toBeLessThanOrEqual(1)
    }
  })
})

describe('cibiPlus', () => {
  it('is the mean of the four measures averaged with the fairness measure', () => {
    // The article's own worked example.
    const balance = {
      resourceProbabilityDistribution: 0.085,
      rollNumberClustering: 0.0,
      resourceClustering: 0.2,
      harbourReturnBalance: 0.084,
    }
    // The render shows 0.069; the exact composition is 0.069625, so the
    // article's display truncates rather than rounds.
    expect(cibiPlus(balance, 0.047)).toBeCloseTo(0.069625, 6)
    expect(
      cibiPlus(
        {
          resourceProbabilityDistribution: 0.376,
          rollNumberClustering: 0.667,
          resourceClustering: 0.7,
          harbourReturnBalance: 0.162,
        },
        0.76,
      ),
    ).toBeCloseTo(0.618, 3)
  })

  it('recomposes from the components of a real evaluation', () => {
    for (const board of boards.slice(0, 20)) {
      const evaluation = evaluateBoard(board)
      const mean = KEYS.reduce((sum, k) => sum + evaluation.balance[k], 0) / KEYS.length
      expect(evaluation.cibiPlus).toBeCloseTo((mean + evaluation.fairness) / 2, 10)
    }
  })
})

describe('sweep', () => {
  it('is deterministic for a seed', () => {
    const a = sweep({ boards: 40, seed: 7 })
    const b = sweep({ boards: 40, seed: 7 })
    expect(b.results[0].boardSeed).toBe(a.results[0].boardSeed)
    expect(b.results[0].cibiPlus).toBe(a.results[0].cibiPlus)
  })

  it('keeps the lowest CIBI+ in best mode and the highest in worst mode', () => {
    const best = sweep({ boards: 120, seed: 11, keep: 5 })
    expect(best.results.map((r) => r.cibiPlus)).toEqual(
      [...best.results.map((r) => r.cibiPlus)].sort((a, b) => a - b),
    )
    expect(best.results[0].cibiPlus).toBeCloseTo(best.stats.cibiMin, 10)

    const worst = sweep({ boards: 120, seed: 11, mode: 'worst', keep: 5 })
    expect(worst.results[0].cibiPlus).toBeCloseTo(worst.stats.cibiMax, 10)
  })

  it('beats the average board it examined', () => {
    const result = sweep({ boards: 300, seed: 3 })
    expect(result.results[0].cibiPlus).toBeLessThan(result.stats.cibiMean)
  })

  it('reports progress and honours a stop request', () => {
    const seen: number[] = []
    const result = sweep({
      boards: 100,
      seed: 5,
      progressEvery: 10,
      onProgress: (examined) => seen.push(examined),
      shouldStop: () => seen.length >= 3,
    })
    expect(result.stats.examined).toBeLessThan(100)
    expect(seen.length).toBeGreaterThan(0)
  })
})
