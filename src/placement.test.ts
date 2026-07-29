import { describe, expect, it } from 'vitest'
import { generateFullBoard, geometry, makeRng } from './board'
import { buildScoringIndex, playerScore } from './scoring'
import { DRAFT_ORDER, PLAYER_COUNT, runDraft } from './placement'

const boards = Array.from({ length: 30 }, (_, i) => generateFullBoard(makeRng(1000 + i)))

describe('runDraft', () => {
  it('places 8 settlements, two per player', () => {
    for (const board of boards) {
      const draft = runDraft(buildScoringIndex(board))
      expect(draft.placements).toHaveLength(8)
      expect(new Set(draft.placements.map((p) => p.node)).size).toBe(8)
      for (let player = 0; player < PLAYER_COUNT; player++) {
        expect(draft.settlements[player]).toHaveLength(2)
      }
    }
  })

  it('follows the 1-2-3-4-4-3-2-1 snake order', () => {
    const draft = runDraft(buildScoringIndex(boards[0]))
    expect(draft.placements.map((p) => p.player)).toEqual(DRAFT_ORDER)
  })

  it('never violates the distance rule', () => {
    const geom = geometry()
    for (const board of boards) {
      const draft = runDraft(buildScoringIndex(board))
      const taken = new Set(draft.placements.map((p) => p.node))
      for (const node of taken) {
        for (const neighbour of geom.nodes[node].nodes) {
          expect(taken.has(neighbour)).toBe(false)
        }
      }
    }
  })

  it('is deterministic for the same board', () => {
    const index = buildScoringIndex(boards[3])
    expect(runDraft(index).placements).toEqual(runDraft(index).placements)
  })

  it('reports totals that match a fresh score of each player’s settlements', () => {
    for (const board of boards.slice(0, 10)) {
      const index = buildScoringIndex(board)
      const draft = runDraft(index)
      draft.settlements.forEach((settlements, player) => {
        expect(draft.totals[player]).toBeCloseTo(playerScore(index, settlements).total, 10)
      })
    }
  })

  it('takes a first settlement worth more than the second, before the robber tax', () => {
    // The greedy rule means pick 1 is the best location on an empty board.
    const index = buildScoringIndex(boards[0])
    const draft = runDraft(index)
    const firstRound = draft.placements.slice(0, 4).map((p) => p.marginal)
    expect(firstRound).toEqual([...firstRound].sort((a, b) => b - a))
  })
})

describe('playerScore', () => {
  it('applies the robber tax only once a player holds two settlements', () => {
    const index = buildScoringIndex(boards[0])
    const draft = runDraft(index)
    const [first, second] = draft.settlements[0]
    expect(playerScore(index, [first]).robberTax).toBe(0)
    expect(playerScore(index, [first, second]).robberTax).toBeGreaterThan(0)
  })

  it('caps the per-settlement bonuses at +0.9 and +0.93', () => {
    const index = buildScoringIndex(boards[0])
    for (let node = 0; node < index.geom.nodes.length; node++) {
      const score = playerScore(index, [node])
      expect(score.numberBonus).toBeLessThanOrEqual(0.9 + 1e-9)
      expect(score.resourceBonus).toBeLessThanOrEqual(0.93 + 1e-9)
    }
  })

  it('never gives a harbour multiplier below 1', () => {
    const index = buildScoringIndex(boards[0])
    const draft = runDraft(index)
    for (const settlements of draft.settlements) {
      for (const value of Object.values(playerScore(index, settlements).multipliers)) {
        expect(value).toBeGreaterThanOrEqual(1)
      }
    }
  })
})
