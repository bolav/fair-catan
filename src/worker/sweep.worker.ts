// Runs the board sweep off the main thread so the UI stays responsive.

import { sweep, type SweepMode, type SweepResult } from '../generate'

export interface SweepRequest {
  seed: number
  boards: number
  mode: SweepMode
}

export type SweepMessage =
  | { type: 'progress'; examined: number; total: number }
  | { type: 'done'; result: SweepResult }

const post = (message: SweepMessage) =>
  (self as unknown as { postMessage(message: SweepMessage): void }).postMessage(message)

self.onmessage = (event: MessageEvent<SweepRequest>) => {
  const { seed, boards, mode } = event.data
  const result = sweep({
    seed,
    boards,
    mode,
    keep: 1,
    progressEvery: 250,
    onProgress: (examined, total) => post({ type: 'progress', examined, total }),
  })
  post({ type: 'done', result })
}
