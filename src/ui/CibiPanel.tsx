// Hero figure plus the five meters CIBI+ is composed of.
//
// Meter fill carries severity; the track is a tint of the same fill, so state
// reads across the whole bar. Every meter is numerically labelled, so the
// severity colour is never the only channel.

import { useId, useState, type ReactNode } from 'react'
import { pips, PRODUCING_RESOURCES, type Board, type ProducingResource } from '../board'
import {
  BALANCE_LABELS,
  expectedPips,
  FAIRNESS_SPREAD_DIVISOR,
  type BalanceKey,
  type BoardEvaluation,
} from '../fairness'

function severity(value: number): string {
  if (value < 0.2) return 'var(--accent)'
  if (value < 0.4) return 'var(--warning)'
  if (value < 0.6) return 'var(--serious)'
  return 'var(--critical)'
}

interface MeterProps {
  label: ReactNode
  ariaLabel: string
  value: number
  detail: string
  emphasis?: boolean
}

function Meter({ label, ariaLabel, value, detail, emphasis }: MeterProps) {
  const clamped = Math.min(1, Math.max(0, value))
  return (
    <div className={emphasis ? 'meter total' : 'meter'} style={{ ['--meter' as string]: severity(value) }}>
      <div className="meter-head">
        <div className="meter-label">{label}</div>
        <span className="meter-value" title={detail}>
          {value.toFixed(3)}
        </span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-valuenow={Number(value.toFixed(3))}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-label={ariaLabel}
        title={detail}
      >
        <div className="meter-fill" style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  )
}

const RESOURCE_LABELS: Record<ProducingResource, string> = {
  wood: 'Wood',
  brick: 'Brick',
  sheep: 'Sheep',
  wheat: 'Wheat',
  ore: 'Ore',
}

function ResourcePipDetails({ board }: { board: Board }) {
  const rows = PRODUCING_RESOURCES.map((resource) => {
    const hexes = board.hexes.filter((hex) => hex.resource === resource)
    const actual = hexes.reduce((sum, hex) => sum + pips(hex.number), 0)
    const expected = expectedPips(hexes.length)
    return { resource, actual, expected, difference: actual - expected }
  })

  return (
    <MetricDetails label="Resource probability distribution">
        <strong>Production by resource</strong>
        <p>Actual versus proportional expected pips. Lower differences are better.</p>
        <table>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Actual</th>
              <th>Expected</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ resource, actual, expected, difference }) => (
              <tr key={resource}>
                <td>{RESOURCE_LABELS[resource]}</td>
                <td>{actual}</td>
                <td>{expected.toFixed(2)}</td>
                <td>{difference > 0 ? '+' : ''}{difference.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
    </MetricDetails>
  )
}

function MetricDetails({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const popoverId = useId()

  return (
    <div className={open ? 'metric-details is-open' : 'metric-details'}>
      <button
        type="button"
        className="metric-details-trigger"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      <div className="metric-popover" id={popoverId}>
        {children}
      </div>
    </div>
  )
}

const BALANCE_ORDER: BalanceKey[] = [
  'resourceProbabilityDistribution',
  'rollNumberClustering',
  'resourceClustering',
  'harbourReturnBalance',
]

export function CibiPanel({ evaluation }: { evaluation: BoardEvaluation }) {
  const { balance, raw, balanceMean, fairness, cibiPlus, spread } = evaluation

  const balanceDetails = (key: BalanceKey): ReactNode => {
    if (key === 'resourceProbabilityDistribution') {
      return <ResourcePipDetails board={evaluation.board} />
    }
    if (key === 'rollNumberClustering') {
      return (
        <MetricDetails label={BALANCE_LABELS[key]}>
          <strong>Repeated adjacent roll numbers</strong>
          <p>
            Every shared edge whose two hexes carry the same number adds 5 raw points. Lower is
            better; the raw score is divided by 30.
          </p>
          <p className="metric-calculation">
            {Math.round(raw[key] / 5)} matching edges × 5 = {raw[key].toFixed(0)} raw →{' '}
            {balance[key].toFixed(3)}
          </p>
        </MetricDetails>
      )
    }
    if (key === 'resourceClustering') {
      return (
        <MetricDetails label={BALANCE_LABELS[key]}>
          <strong>Adjacent matching terrain</strong>
          <p>
            Every shared edge between two hexes of the same resource adds 5 raw points. Lower is
            better; the raw score is divided by 100.
          </p>
          <p className="metric-calculation">
            {Math.round(raw[key] / 5)} matching edges × 5 = {raw[key].toFixed(0)} raw →{' '}
            {balance[key].toFixed(3)}
          </p>
        </MetricDetails>
      )
    }
    return (
      <MetricDetails label={BALANCE_LABELS[key]}>
        <strong>Equality of harbour production</strong>
        <p>
          Each harbour keeps its better settlement intersection. Adjacent pips are added, with
          matching-resource pips doubled at a 2:1 harbour. The score penalizes variation among all
          nine harbours, so lower is better.
        </p>
        <p className="metric-calculation">
          Variation {raw[key].toFixed(2)} raw → {balance[key].toFixed(3)}
        </p>
      </MetricDetails>
    )
  }

  return (
    <section className="card">
      <h2>Board balance</h2>
      <div className="hero">
        <span className="hero-value">{cibiPlus.toFixed(3)}</span>
        <span className="hero-caption">
          CIBI+ — lower is better. A random board averages about 0.20.
        </span>
      </div>
      <p className="note">
        The mean of the four balance measures ({balanceMean.toFixed(3)}) averaged with the fairness
        measure ({fairness.toFixed(3)}).
      </p>

      <div className="meters">
        {BALANCE_ORDER.map((key) => (
          <Meter
            key={key}
            label={balanceDetails(key)}
            ariaLabel={BALANCE_LABELS[key]}
            value={balance[key]}
            detail={`raw ${raw[key].toFixed(2)}`}
          />
        ))}
        <Meter
          label={
            <MetricDetails label="Fairness measure">
              <strong>Starting-position score spread</strong>
              <p>
                The highest and lowest simulated player totals are compared after rounding to one
                decimal. The spread is divided by {FAIRNESS_SPREAD_DIVISOR}; lower is better.
              </p>
              <p className="metric-calculation">
                {spread.toFixed(2)} point spread ÷ {FAIRNESS_SPREAD_DIVISOR} → {fairness.toFixed(3)}
              </p>
            </MetricDetails>
          }
          ariaLabel="Fairness measure"
          value={fairness}
          detail={`${spread.toFixed(2)} point spread / ${FAIRNESS_SPREAD_DIVISOR}`}
        />
        <Meter
          label={
            <MetricDetails label="CIBI+">
              <strong>Combined board score</strong>
              <p>
                The weighted mean of the four board-balance measures is averaged with the fairness
                measure. Lower is better.
              </p>
              <p className="metric-calculation">
                ({balanceMean.toFixed(3)} balance + {fairness.toFixed(3)} fairness) ÷ 2 ={' '}
                {cibiPlus.toFixed(3)}
              </p>
            </MetricDetails>
          }
          ariaLabel="CIBI+"
          value={cibiPlus}
          detail="the index itself"
          emphasis
        />
      </div>
    </section>
  )
}
