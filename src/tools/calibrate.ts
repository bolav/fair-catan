// Empirically calibrate the CIBI normalising divisors and sanity-check the
// fairness divisor hypothesis (TODO §2.6, §2.8).
//
//   pnpm calibrate                 # default sweep
//   pnpm calibrate 2000000 20000 7 # raw-metric boards, full-sim boards, seed
//
// cibi.txt is explicit that each measure is scaled by "the highest value
// obtained on a 100 million board run", so phase 1 hunts maxima over a large,
// cheap sweep (no draft simulation). Phase 2 runs the full simulation over a
// smaller sample to report the distribution of starting-score spreads, which is
// what the /15 fairness divisor has to be consistent with.

import { generateFullBoard, makeRng } from '../board'
import { evaluateSeed } from '../generate'
import { rawBalance, NORMALIZERS, type Balance } from '../fairness'

// Node-only script; @types/node is not a dependency of this browser project.
declare const process: { argv: string[] }

const rawBoards = Number(process.argv[2] ?? 500_000)
const simBoards = Number(process.argv[3] ?? 5_000)
const seed = Number(process.argv[4] ?? 1)

const fmt = (n: number) => n.toFixed(3)
const keys = Object.keys(NORMALIZERS) as Array<keyof Balance>

// --- phase 1: raw maxima --------------------------------------------------
{
  const rng = makeRng(seed)
  const max: Balance = {
    resourceProbabilityDistribution: 0,
    rollNumberClustering: 0,
    resourceClustering: 0,
    harbourReturnBalance: 0,
  }
  const started = performance.now()
  for (let i = 0; i < rawBoards; i++) {
    const raw = rawBalance(generateFullBoard(rng))
    for (const key of keys) if (raw[key] > max[key]) max[key] = raw[key]
  }
  const elapsed = (performance.now() - started) / 1000
  console.log(
    `phase 1: ${rawBoards} boards in ${elapsed.toFixed(1)}s (${Math.round(rawBoards / elapsed)}/s)`,
  )
  console.log('\nRaw maxima (candidate divisors) vs the divisors in use:')
  for (const key of keys) {
    console.log(`  ${key.padEnd(34)} max ${fmt(max[key]).padStart(9)}   in use ${NORMALIZERS[key]}`)
  }
}

// --- phase 2: full simulation ---------------------------------------------
{
  const master = makeRng(seed + 1)
  const spreads: number[] = []
  const cibis: number[] = []
  const totals: number[] = []
  const started = performance.now()
  for (let i = 0; i < simBoards; i++) {
    const boardSeed = Math.floor(master() * 0x100000000) >>> 0
    const evaluation = evaluateSeed(boardSeed)
    spreads.push(evaluation.spread)
    cibis.push(evaluation.cibiPlus)
    totals.push(...evaluation.draft.totals)
  }
  const elapsed = (performance.now() - started) / 1000
  console.log(
    `\nphase 2: ${simBoards} boards in ${elapsed.toFixed(1)}s (${Math.round(simBoards / elapsed)}/s)`,
  )

  const percentile = (values: number[], p: number): number => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
  }

  console.log('\nStarting score spread (best player - worst player):')
  for (const p of [0, 1, 5, 25, 50, 75, 95, 99, 100]) {
    console.log(`  p${String(p).padStart(3)}  ${fmt(percentile(spreads, p))}`)
  }
  console.log(
    `\nPlayer totals: min ${fmt(Math.min(...totals))}  mean ${fmt(
      totals.reduce((a, b) => a + b, 0) / totals.length,
    )}  max ${fmt(Math.max(...totals))}`,
  )
  console.log('\nCIBI+ with the current divisors:')
  for (const p of [0, 1, 5, 50, 95, 99, 100]) {
    console.log(`  p${String(p).padStart(3)}  ${fmt(percentile(cibis, p))}`)
  }
  console.log(`  mean ${fmt(cibis.reduce((a, b) => a + b, 0) / cibis.length)}`)
}
