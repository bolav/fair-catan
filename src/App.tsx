import { useCallback, useEffect, useRef, useState } from 'react'
import { hashSeed } from './board'
import { evaluateSeed, type SweepMode, type SweepResult } from './generate'
import type { BoardEvaluation } from './fairness'
import type { SweepMessage, SweepRequest } from './worker/sweep.worker'
import { BoardView } from './ui/BoardView'
import { CibiPanel } from './ui/CibiPanel'
import { PlayerPanel } from './ui/PlayerPanel'
import { SetupSheet } from './ui/SetupSheet'

const DEFAULT_SEED = 'catan'
const DEFAULT_BOARDS = 20_000

type Theme = 'system' | 'light' | 'dark'

interface Shown {
  evaluation: BoardEvaluation
  boardSeed: number
  stats?: SweepResult['stats']
}

export default function App() {
  const [seedText, setSeedText] = useState(DEFAULT_SEED)
  const [boards, setBoards] = useState(DEFAULT_BOARDS)
  const [mode, setMode] = useState<SweepMode>('best')
  const [theme, setTheme] = useState<Theme>('system')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [shown, setShown] = useState<Shown>(() => {
    const boardSeed = hashSeed(DEFAULT_SEED)
    return { evaluation: evaluateSeed(boardSeed), boardSeed }
  })

  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => () => workerRef.current?.terminate(), [])

  const showSeed = useCallback((boardSeed: number) => {
    setShown({ evaluation: evaluateSeed(boardSeed), boardSeed })
  }, [])

  const search = useCallback(() => {
    workerRef.current?.terminate()
    const worker = new Worker(new URL('./worker/sweep.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    setRunning(true)
    setProgress(0)

    worker.onmessage = (event: MessageEvent<SweepMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        setProgress(message.examined / message.total)
        return
      }
      const winner = message.result.results[0]
      if (winner) {
        setShown({
          evaluation: winner,
          boardSeed: winner.boardSeed,
          stats: message.result.stats,
        })
      }
      setRunning(false)
      worker.terminate()
      workerRef.current = null
    }

    const request: SweepRequest = { seed: hashSeed(seedText), boards, mode }
    worker.postMessage(request)
  }, [seedText, boards, mode])

  const stop = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setRunning(false)
  }, [])

  const { evaluation, boardSeed, stats } = shown

  return (
    <div className="app">
      <div className="masthead">
        <h1>Fair Catan boards, with starting positions</h1>
        <div className="field">
          <label htmlFor="theme">Theme</label>
          <select id="theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
      <p className="subtitle">
        Boards are scored with CIBI+: four balance measures averaged with a fairness measure taken
        from a simulated 1-2-3-4-4-3-2-1 opening draft. The eight settlements that fairness is
        derived from are drawn on the board, and the harbours come from a real six-piece sea frame,
        so anything generated here can be built on the table.
      </p>

      <div className="controls">
        <div className="field">
          <label htmlFor="seed">Seed</label>
          <input id="seed" value={seedText} onChange={(e) => setSeedText(e.target.value)} size={12} />
        </div>
        <div className="field">
          <label htmlFor="boards">Boards to examine</label>
          <input
            id="boards"
            type="number"
            min={1}
            step={1000}
            value={boards}
            onChange={(e) => setBoards(Math.max(1, Number(e.target.value) || 1))}
            size={8}
          />
        </div>
        <div className="field">
          <label htmlFor="mode">Keep the</label>
          <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as SweepMode)}>
            <option value="best">most balanced</option>
            <option value="worst">least balanced</option>
          </select>
        </div>
        <button className="primary" onClick={search} disabled={running}>
          {running ? 'Searching…' : 'Search'}
        </button>
        <button onClick={stop} disabled={!running}>
          Stop
        </button>
        <button onClick={() => showSeed(Math.floor(Math.random() * 0x100000000) >>> 0)} disabled={running}>
          Single random board
        </button>
        {running && (
          <div className="progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="hint">{Math.round(progress * 100)}% of {boards.toLocaleString()} boards</span>
          </div>
        )}
        {!running && stats && (
          <span className="hint">
            Examined {stats.examined.toLocaleString()} boards · CIBI+ {stats.cibiMin.toFixed(3)}–
            {stats.cibiMax.toFixed(3)}, mean {stats.cibiMean.toFixed(3)}
          </span>
        )}
      </div>

      <div className="layout">
        <div>
          <section className="card board">
            <h2>The island</h2>
            <BoardView board={evaluation.board} draft={evaluation.draft} />
            <div className="legend">
              {evaluation.draft.totals.map((_, player) => (
                <span className="legend-item" key={player}>
                  <span
                    className="swatch round"
                    style={{ background: `var(--player-${player + 1})` }}
                  />
                  Player {player + 1}
                </span>
              ))}
              <span className="legend-item">
                <span className="swatch round ringed" />
                Pays out at setup
              </span>
              <span className="legend-item">A–F — sea frame pieces, clockwise from the top left</span>
            </div>
          </section>
          <PlayerPanel board={evaluation.board} draft={evaluation.draft} />
        </div>
        <div>
          <CibiPanel evaluation={evaluation} />
          <SetupSheet board={evaluation.board} draft={evaluation.draft} seed={boardSeed} />
        </div>
      </div>
    </div>
  )
}
