import { describe, expect, it } from 'vitest'
import { generateFullBoard, geometry, makeRng } from './board'
import { decodeBoardCode } from './code'
import { boardFromSeed } from './generate'
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

  it('takes the best available settlement for each non-consecutive first-round pick', () => {
    const index = buildScoringIndex(boards[0])
    const draft = runDraft(index)
    const firstThree = draft.placements.slice(0, 3).map((p) => p.marginal)
    expect(firstThree).toEqual([...firstThree].sort((a, b) => b - a))
  })
})

describe('setup roads', () => {
  it('gives every settlement exactly one road, on a real edge leaving it', () => {
    const geom = geometry()
    for (const board of boards) {
      const draft = runDraft(buildScoringIndex(board))
      expect(draft.roads).toHaveLength(8)
      draft.roads.forEach((road, i) => {
        expect(road.pick).toBe(i)
        expect(road.player).toBe(draft.placements[i].player)
        expect(road.from).toBe(draft.placements[i].node)
        expect(geom.nodes[road.from].nodes).toContain(road.to)
        expect(geom.edges[road.edge].nodes.slice().sort((a, b) => a - b)).toEqual(
          [road.from, road.to].sort((a, b) => a - b),
        )
      })
    }
  })

  it('never puts two roads on the same edge', () => {
    for (const board of boards) {
      const draft = runDraft(buildScoringIndex(board))
      expect(new Set(draft.roads.map((r) => r.edge)).size).toBe(8)
    }
  })

  it('heads for the best site it can reach', () => {
    const geom = geometry()
    for (const board of boards.slice(0, 10)) {
      const index = buildScoringIndex(board)
      const draft = runDraft(index)
      for (const road of draft.roads) {
        if (road.target === null) continue
        // The target has to be two steps out, not the dead neighbour itself.
        expect(geom.nodes[road.to].nodes).toContain(road.target)
        expect(road.target).not.toBe(road.from)
        expect(index.locationScores[road.target]).toBeCloseTo(road.targetScore, 10)

        // And no other direction out of this settlement reached better.
        const settledBefore = draft.placements.slice(0, road.pick + 1).map((p) => p.node)
        const blocked = new Set<number>()
        for (const n of settledBefore) {
          blocked.add(n)
          for (const adj of geom.nodes[n].nodes) blocked.add(adj)
        }
        let bestReachable = 0
        for (const to of geom.nodes[road.from].nodes) {
          for (const beyond of geom.nodes[to].nodes) {
            if (beyond === road.from || blocked.has(beyond)) continue
            bestReachable = Math.max(bestReachable, index.locationScores[beyond])
          }
        }
        expect(road.targetScore).toBeCloseTo(bestReachable, 10)
      }
    }
  })

  it('is deterministic for the same board', () => {
    const index = buildScoringIndex(boards[3])
    expect(runDraft(index).roads).toEqual(runDraft(index).roads)
  })
})

describe('opening hands', () => {
  it('pays out the second settlement, one card per producing tile', () => {
    const geom = geometry()
    for (const board of boards) {
      const draft = runDraft(buildScoringIndex(board))
      expect(draft.openingHands).toHaveLength(PLAYER_COUNT)
      draft.openingHands.forEach((hand, player) => {
        expect(hand.player).toBe(player)
        expect(hand.node).toBe(draft.settlements[player][1])

        const adjacent = geom.nodes[hand.node].hexes.map((i) => board.hexes[i])
        expect(hand.cards).toEqual(
          adjacent
            .filter((h) => h.resource !== 'desert')
            .map((h) => h.resource)
            .sort(),
        )
        // A corner touches at most three tiles, and the desert pays nothing.
        expect(hand.cards.length).toBeLessThanOrEqual(3)
        expect(hand.cards).not.toContain('desert')
      })
    }
  })

  it('pays the second settlement, which is not always the better one', () => {
    // Worth pinning: the rule is about draft order, not about value, and the
    // snake means each player's second pick is their weaker corner.
    const draft = runDraft(buildScoringIndex(boards[0]))
    draft.openingHands.forEach((hand, player) => {
      const [first, second] = draft.settlements[player]
      expect(hand.node).toBe(second)
      expect(hand.node).not.toBe(first)
    })
  })

  it('orders Player 4’s consecutive picks for the better setup hand', () => {
    const seed = decodeBoardCode('1ZP7-CVS6')
    expect(seed).not.toBeNull()
    const draft = runDraft(buildScoringIndex(boardFromSeed(seed!)))

    expect(draft.placements[3].node).toBe(11)
    expect(draft.placements[4].node).toBe(7)
    expect(draft.openingHands[3].cards).toEqual(['brick', 'ore', 'wheat'])
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
