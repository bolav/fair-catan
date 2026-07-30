import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_BOARD_OPTIONS, hashSeed, type BoardOptions } from './board'
import { decodeBoardSpec, encodeBoardCode } from './code'
import {
  DEFAULT_BALANCE_WEIGHTS,
  type BalanceWeights,
} from './fairness'
import { evaluateSeed, type SweepMode, type SweepResult } from './generate'
import { buildScoringIndex, DEFAULT_TUNING, type Tuning } from './scoring'
import type { SweepMessage, SweepRequest } from './worker/sweep.worker'
import { BoardView } from './ui/BoardView'
import { BalanceWeightsPanel } from './ui/BalanceWeightsPanel'
import { BUTTON_LABELS, CopyButton } from './ui/CopyButton'
import { CibiPanel } from './ui/CibiPanel'
import { PlayerPanel } from './ui/PlayerPanel'
import { SetupSheet } from './ui/SetupSheet'
import { TuningPanel } from './ui/TuningPanel'

const DEFAULT_SEED = 'catan'
const DEFAULT_BOARDS = 20_000

type Theme = 'system' | 'light' | 'dark'

/**
 * The drafted opening is drawn over the board, but it is only a suggestion —
 * these turn each layer off for anyone who wants the bare island. The draft
 * still runs either way, because CIBI+'s fairness half is derived from it.
 */
interface Layers {
  settlements: boolean
  roads: boolean
  cards: boolean
  intersectionNumbers: boolean
  intersectionValues: boolean
}

const LAYER_LABELS: Array<{ key: keyof Layers; label: string }> = [
  { key: 'settlements', label: 'Settlements' },
  { key: 'roads', label: 'Roads' },
  { key: 'cards', label: 'Opening cards' },
  { key: 'intersectionNumbers', label: 'Intersection numbers' },
  { key: 'intersectionValues', label: 'Intersection values' },
]

const BOARD_OPTION_LABELS: Array<{ key: keyof BoardOptions; label: string }> = [
  { key: 'desertCenter', label: 'Desert in the middle' },
  { key: 'standardHarbours', label: 'Default harbours' },
  { key: 'standardNumbers', label: 'Default number order' },
]

interface Shown {
  boardSeed: number
  stats?: SweepResult['stats']
}

export default function App() {
  const [seedText, setSeedText] = useState(DEFAULT_SEED)
  const [boards, setBoards] = useState(DEFAULT_BOARDS)
  const [mode, setMode] = useState<SweepMode>('best')
  const [theme, setTheme] = useState<Theme>('system')
  const [layers, setLayers] = useState<Layers>({
    settlements: true,
    roads: true,
    cards: true,
    intersectionNumbers: false,
    intersectionValues: false,
  })
  const [boardOptions, setBoardOptions] = useState<BoardOptions>({ ...DEFAULT_BOARD_OPTIONS })
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [tuning, setTuning] = useState<Tuning>(() => ({
    values: { ...DEFAULT_TUNING.values },
    harbour2To1: DEFAULT_TUNING.harbour2To1,
    harbour3To1: DEFAULT_TUNING.harbour3To1,
    robberTax: DEFAULT_TUNING.robberTax,
  }))
  const [balanceWeights, setBalanceWeights] = useState<BalanceWeights>({
    ...DEFAULT_BALANCE_WEIGHTS,
  })
  const [shown, setShown] = useState<Shown>(() => ({ boardSeed: hashSeed(DEFAULT_SEED) }))
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  // Scoring is a pure function of the board seed and the resource values, so
  // the evaluation is derived rather than stored — moving a slider re-scores
  // the board on the spot, and there is no way for the two to drift apart.
  const evaluation = useMemo(
    () => evaluateSeed(shown.boardSeed, tuning, boardOptions, balanceWeights),
    [shown.boardSeed, tuning, boardOptions, balanceWeights],
  )
  const locationScores = useMemo(
    () => buildScoringIndex(evaluation.board, tuning).locationScores,
    [evaluation.board, tuning],
  )
  const boardCode = encodeBoardCode(shown.boardSeed, boardOptions)

  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => () => workerRef.current?.terminate(), [])

  // The field always shows the board on screen, so it can be read off, selected
  // and copied. Typing into it stages a different code until Load is pressed.
  useEffect(() => {
    setCodeInput(boardCode)
    setCodeError(false)
  }, [boardCode])

  const showSeed = useCallback((boardSeed: number) => {
    setShown({ boardSeed })
  }, [])

  const loadCode = useCallback(() => {
    const decoded = decodeBoardSpec(codeInput)
    if (decoded === null) {
      setCodeError(true)
      return
    }
    setBoardOptions(decoded.boardOptions)
    setShown({ boardSeed: decoded.seed })
    setCodeError(false)
  }, [codeInput])

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
        setShown({ boardSeed: winner.boardSeed, stats: message.result.stats })
      }
      setRunning(false)
      worker.terminate()
      workerRef.current = null
    }

    const request: SweepRequest = {
      seed: hashSeed(seedText),
      boards,
      mode,
      tuning,
      boardOptions,
      balanceWeights,
    }
    worker.postMessage(request)
  }, [seedText, boards, mode, tuning, boardOptions, balanceWeights])

  const stop = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setRunning(false)
  }, [])

  const { boardSeed, stats } = shown

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
        derived from can be drawn on the board along with their roads and opening cards, and the
        harbours come from a real six-piece sea frame, so anything generated here can be built on
        the table.
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
        <div className="field">
          <label htmlFor="code">Board code</label>
          <div className="code-field">
            <input
              id="code"
              ref={codeRef}
              value={codeInput}
              spellCheck={false}
              autoComplete="off"
              size={10}
              aria-invalid={codeError}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                setCodeInput(e.target.value)
                setCodeError(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadCode()
              }}
            />
            <CopyButton text={boardCode} source={codeRef} className="" labels={BUTTON_LABELS} />
            <button
              onClick={loadCode}
              disabled={running || codeInput.trim() === '' || codeInput === boardCode}
            >
              Load
            </button>
          </div>
        </div>
        <fieldset className="layers">
          <legend>Show</legend>
          {LAYER_LABELS.map(({ key, label }) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="layers">
          <legend>Lock</legend>
          {BOARD_OPTION_LABELS.map(({ key, label }) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={boardOptions[key]}
                disabled={running}
                onChange={(e) =>
                  setBoardOptions((options) => ({ ...options, [key]: e.target.checked }))
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        {running && (
          <div className="progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="hint">{Math.round(progress * 100)}% of {boards.toLocaleString()} boards</span>
          </div>
        )}
        {codeError && (
          <span className="hint error">
            Not a board code — check the characters. It should look like {boardCode}.
          </span>
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
            <BoardView
              board={evaluation.board}
              draft={evaluation.draft}
              show={{
                settlements: layers.settlements,
                roads: layers.roads,
                payout: layers.cards,
                intersectionNumbers: layers.intersectionNumbers,
                intersectionValues: layers.intersectionValues,
              }}
              locationScores={locationScores}
            />
            <div className="legend">
              {(layers.settlements || layers.roads) &&
                evaluation.draft.totals.map((_, player) => (
                  <span className="legend-item" key={player}>
                    <span
                      className="swatch round"
                      style={{ background: `var(--player-${player + 1})` }}
                    />
                    Player {player + 1}
                  </span>
                ))}
              {layers.settlements && layers.cards && (
                <span className="legend-item">
                  <span className="swatch round ringed" />
                  Pays out at setup
                </span>
              )}
              <span className="legend-item">A–F — sea frame pieces, clockwise from the top left</span>
            </div>
          </section>
          <PlayerPanel board={evaluation.board} draft={evaluation.draft} />
        </div>
        <div>
          <CibiPanel evaluation={evaluation} />
          <BalanceWeightsPanel
            weights={balanceWeights}
            onChange={setBalanceWeights}
            disabled={running}
          />
          <TuningPanel tuning={tuning} onChange={setTuning} disabled={running} />
          <SetupSheet
            board={evaluation.board}
            draft={evaluation.draft}
            seed={boardSeed}
            boardOptions={boardOptions}
            show={layers}
          />
        </div>
      </div>
    </div>
  )
}
