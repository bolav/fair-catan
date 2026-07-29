// Hill-climb each raw balance metric to its attainable maximum.
//
//   pnpm maximise
//
// cibi.txt scales each measure by the highest value seen over a 100M random
// run. A random sweep converges slowly in the tail, so this searches directly:
// random restarts plus swap moves (two tiles' resources, two number tokens, two
// frame pieces), keeping any move that does not make the metric worse.

import {
  generateFullBoard,
  harboursFor,
  makeRng,
  noAdjacentReds,
  type Board,
} from '../board'
import { rawBalance, type Balance } from '../fairness'

// Node-only script; @types/node is not a dependency of this browser project.
declare const process: { argv: string[] }

const restarts = Number(process.argv[2] ?? 400)
const steps = Number(process.argv[3] ?? 4000)
const rng = makeRng(Number(process.argv[4] ?? 1))

const keys = Object.keys({
  resourceProbabilityDistribution: 0,
  rollNumberClustering: 0,
  resourceClustering: 0,
  harbourReturnBalance: 0,
} satisfies Balance) as Array<keyof Balance>

function clone(board: Board): Board {
  return {
    hexes: board.hexes.map((h) => ({ ...h })),
    frame: [...board.frame],
    harbours: board.harbours.map((h) => ({ ...h })),
  }
}

function mutate(board: Board): Board {
  const next = clone(board)
  const roll = rng()
  if (roll < 0.4) {
    // Swap two tiles' resources.
    const i = Math.floor(rng() * 19)
    const j = Math.floor(rng() * 19)
    const a = next.hexes[i]
    const b = next.hexes[j]
    // The desert carries no token, so swapping it has to move the token too.
    ;[a.resource, b.resource] = [b.resource, a.resource]
    ;[a.number, b.number] = [b.number, a.number]
  } else if (roll < 0.8) {
    // Swap two number tokens between numbered tiles.
    const numbered = next.hexes.filter((h) => h.number !== null)
    const a = numbered[Math.floor(rng() * numbered.length)]
    const b = numbered[Math.floor(rng() * numbered.length)]
    ;[a.number, b.number] = [b.number, a.number]
    if (!noAdjacentReds(next.hexes)) return board
  } else {
    // Swap two frame pieces (slot 0 stays pinned: whole-ring rotation is moot).
    const i = 1 + Math.floor(rng() * 5)
    const j = 1 + Math.floor(rng() * 5)
    ;[next.frame[i], next.frame[j]] = [next.frame[j], next.frame[i]]
    next.harbours = harboursFor(next.frame)
  }
  return noAdjacentReds(next.hexes) ? next : board
}

const best: Balance = {
  resourceProbabilityDistribution: 0,
  rollNumberClustering: 0,
  resourceClustering: 0,
  harbourReturnBalance: 0,
}

for (const key of keys) {
  for (let restart = 0; restart < restarts; restart++) {
    let board = generateFullBoard(rng)
    let score = rawBalance(board)[key]
    for (let step = 0; step < steps; step++) {
      const candidate = mutate(board)
      const value = rawBalance(candidate)[key]
      if (value >= score) {
        board = candidate
        score = value
      }
    }
    if (score > best[key]) best[key] = score
  }
  console.log(`${key.padEnd(34)} attainable max ${best[key].toFixed(4)}`)
}
