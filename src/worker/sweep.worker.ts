// Runs the board sweep off the main thread so the UI stays responsive.

import { sweep, type SweepMode, type SweepResult } from '../generate'
import type { BoardOptions } from '../board'
import type { BalanceWeights } from '../fairness'
import type { Tuning } from '../scoring'

export interface SweepRequest {
  seed: number
  boards: number
  mode: SweepMode
  /** Omitted means the article's published values and our robber reading. */
  tuning?: Partial<Tuning>
  boardOptions?: Partial<BoardOptions>
  balanceWeights?: Partial<BalanceWeights>
}

export type SweepMessage =
  | { type: 'progress'; examined: number; total: number }
  | { type: 'done'; result: SweepResult }

const post = (message: SweepMessage) =>
  (self as unknown as { postMessage(message: SweepMessage): void }).postMessage(message)

self.onmessage = (event: MessageEvent<SweepRequest>) => {
  const { seed, boards, mode, tuning, boardOptions, balanceWeights } = event.data
  const result = sweep({
    seed,
    boards,
    mode,
    tuning,
    boardOptions,
    balanceWeights,
    keep: 1,
    progressEvery: 250,
    onProgress: (examined, total) => post({ type: 'progress', examined, total }),
  })
  post({ type: 'done', result })
}
