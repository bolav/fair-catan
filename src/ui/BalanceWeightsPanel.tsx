import {
  BALANCE_LABELS,
  DEFAULT_BALANCE_WEIGHTS,
  type BalanceKey,
  type BalanceWeights,
} from '../fairness'

const ORDER: BalanceKey[] = [
  'resourceProbabilityDistribution',
  'rollNumberClustering',
  'resourceClustering',
  'harbourReturnBalance',
]

export interface BalanceWeightsPanelProps {
  weights: BalanceWeights
  onChange: (weights: BalanceWeights) => void
  disabled?: boolean
}

export function BalanceWeightsPanel({
  weights,
  onChange,
  disabled,
}: BalanceWeightsPanelProps) {
  const modified = ORDER.some((key) => weights[key] !== DEFAULT_BALANCE_WEIGHTS[key])

  return (
    <section className="card">
      <h2>Balance measure weights</h2>
      <p className="note">
        Increase a measure to make it matter more when calculating CIBI+ and selecting boards
        during a search. Fairness still contributes half of CIBI+.
      </p>

      <div className="sliders">
        {ORDER.map((key) => (
          <div className="slider-row balance-weight-row" key={key}>
            <label className="slider-label" htmlFor={`weight-${key}`}>
              {BALANCE_LABELS[key]}
            </label>
            <input
              id={`weight-${key}`}
              type="range"
              min={0.25}
              max={5}
              step={0.25}
              value={weights[key]}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...weights, [key]: Number(event.target.value) })
              }
            />
            <span className="slider-value">{weights[key].toFixed(2)}×</span>
          </div>
        ))}
      </div>

      <div className="slider-actions">
        <button
          disabled={disabled || !modified}
          onClick={() => onChange({ ...DEFAULT_BALANCE_WEIGHTS })}
        >
          Reset measure weights
        </button>
      </div>
    </section>
  )
}
