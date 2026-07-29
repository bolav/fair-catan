// Sliders for the scoring weights.
//
// The article's resource values are the average expected cost of the top 50
// fastest victories, and it explicitly invites you to disagree with them — a
// player who thinks ore is overrated should be able to say so and see the board
// change. The robber fraction is not from the article at all; it is our reading
// of "half the highest-paying hexagon" (see README), which is all the more reason
// to expose it.
//
// Everything downstream is a pure function of these, so moving a slider
// re-scores the current board immediately. It does not re-run the sweep; the
// results a sweep found under one set of weights are not comparable to another.

import { PRODUCING_RESOURCES, type ProducingResource } from '../board'
import { DEFAULT_TUNING, type Tuning } from '../scoring'

const TERRAIN: Record<ProducingResource, string> = {
  wood: 'var(--terrain-wood)',
  brick: 'var(--terrain-brick)',
  sheep: 'var(--terrain-sheep)',
  wheat: 'var(--terrain-wheat)',
  ore: 'var(--terrain-ore)',
}

export function isDefaultTuning(tuning: Tuning): boolean {
  return (
    tuning.robberTax === DEFAULT_TUNING.robberTax &&
    PRODUCING_RESOURCES.every((r) => tuning.values[r] === DEFAULT_TUNING.values[r])
  )
}

export interface TuningPanelProps {
  tuning: Tuning
  onChange: (tuning: Tuning) => void
  /** True while a sweep is running, when the weights must not move under it. */
  disabled?: boolean
}

export function TuningPanel({ tuning, onChange, disabled }: TuningPanelProps) {
  const modified = !isDefaultTuning(tuning)

  return (
    <section className="card">
      <h2>Scoring weights</h2>
      <p className="note">
        What one card of each resource is worth, relative to the others. The article&rsquo;s figures
        are the average expected cost of the top 50 fastest victories; they drive every location
        score, so the whole board re-scores as you move them.
      </p>

      <div className="sliders">
        {PRODUCING_RESOURCES.map((resource) => (
          <div className="slider-row" key={resource}>
            <label className="slider-label" htmlFor={`value-${resource}`}>
              <span className="swatch" style={{ background: TERRAIN[resource] }} />
              {resource}
            </label>
            <input
              id={`value-${resource}`}
              type="range"
              min={0}
              max={2}
              step={0.001}
              value={tuning.values[resource]}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...tuning,
                  values: { ...tuning.values, [resource]: Number(e.target.value) },
                })
              }
            />
            <span className="slider-value">
              {tuning.values[resource].toFixed(3)}
              {tuning.values[resource] !== DEFAULT_TUNING.values[resource] && (
                <span className="slider-was"> was {DEFAULT_TUNING.values[resource].toFixed(3)}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <p className="note">
        And what the robber costs. A player loses this share of their highest-paying hex, from
        their second settlement on. Neither article states the figure; a half is our reading of
        &ldquo;half the highest-paying hexagon&rdquo;. At zero the robber is ignored entirely.
      </p>

      <div className="sliders">
        <div className="slider-row">
          <label className="slider-label" htmlFor="value-robber">
            <span className="swatch robber" />
            robber
          </label>
          <input
            id="value-robber"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={tuning.robberTax}
            disabled={disabled}
            onChange={(e) => onChange({ ...tuning, robberTax: Number(e.target.value) })}
          />
          <span className="slider-value">
            {Math.round(tuning.robberTax * 100)}%
            {tuning.robberTax !== DEFAULT_TUNING.robberTax && (
              <span className="slider-was">
                {' '}
                was {Math.round(DEFAULT_TUNING.robberTax * 100)}%
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="slider-actions">
        <button
          onClick={() => onChange({ values: { ...DEFAULT_TUNING.values }, robberTax: DEFAULT_TUNING.robberTax })}
          disabled={disabled || !modified}
        >
          Reset to the article&rsquo;s values
        </button>
        {modified && (
          <span className="hint">
            CIBI+ is no longer comparable with the article&rsquo;s published figures.
          </span>
        )}
      </div>
    </section>
  )
}
