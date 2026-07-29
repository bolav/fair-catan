// Hero figure plus the five meters CIBI+ is composed of.
//
// Meter fill carries severity; the track is a tint of the same fill, so state
// reads across the whole bar. Every meter is numerically labelled, so the
// severity colour is never the only channel.

import { BALANCE_LABELS, FAIRNESS_SPREAD_DIVISOR, type BalanceKey, type BoardEvaluation } from '../fairness'

function severity(value: number): string {
  if (value < 0.2) return 'var(--accent)'
  if (value < 0.4) return 'var(--warning)'
  if (value < 0.6) return 'var(--serious)'
  return 'var(--critical)'
}

interface MeterProps {
  label: string
  value: number
  detail: string
  emphasis?: boolean
}

function Meter({ label, value, detail, emphasis }: MeterProps) {
  const clamped = Math.min(1, Math.max(0, value))
  return (
    <div className={emphasis ? 'meter total' : 'meter'} style={{ ['--meter' as string]: severity(value) }}>
      <div className="meter-head">
        <span className="meter-label">{label}</span>
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
        aria-label={label}
        title={detail}
      >
        <div className="meter-fill" style={{ width: `${clamped * 100}%` }} />
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
  const { balance, raw, fairness, cibiPlus, spread } = evaluation
  const balanceMean = BALANCE_ORDER.reduce((sum, k) => sum + balance[k], 0) / BALANCE_ORDER.length

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
            label={BALANCE_LABELS[key]}
            value={balance[key]}
            detail={`raw ${raw[key].toFixed(2)}`}
          />
        ))}
        <Meter
          label="Fairness measure"
          value={fairness}
          detail={`${spread.toFixed(2)} point spread / ${FAIRNESS_SPREAD_DIVISOR}`}
        />
        <Meter label="CIBI+" value={cibiPlus} detail="the index itself" emphasis />
      </div>
    </section>
  )
}
