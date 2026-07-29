// Sliders for the resource relative values (TODO §6).
//
// The article's numbers are the average expected cost of the top 50 fastest
// victories, and it explicitly invites you to disagree with them — a player who
// thinks ore is overrated should be able to say so and see the board change.
//
// Every metric downstream is a pure function of these, so moving a slider
// re-scores the current board immediately. It does not re-run the sweep; the
// results a sweep found under one set of values are not comparable to another.

import { PRODUCING_RESOURCES, type ProducingResource } from '../board'
import { RESOURCE_VALUES, type ResourceValues } from '../scoring'

const MIN = 0
const MAX = 2
const STEP = 0.001

const TERRAIN: Record<ProducingResource, string> = {
  wood: 'var(--terrain-wood)',
  brick: 'var(--terrain-brick)',
  sheep: 'var(--terrain-sheep)',
  wheat: 'var(--terrain-wheat)',
  ore: 'var(--terrain-ore)',
}

export function isDefaultValues(values: ResourceValues): boolean {
  return PRODUCING_RESOURCES.every((r) => values[r] === RESOURCE_VALUES[r])
}

export interface ValuesPanelProps {
  values: ResourceValues
  onChange: (values: ResourceValues) => void
  /** True while a sweep is running, when the numbers must not move under it. */
  disabled?: boolean
}

export function ValuesPanel({ values, onChange, disabled }: ValuesPanelProps) {
  const modified = !isDefaultValues(values)

  return (
    <section className="card">
      <h2>Resource values</h2>
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
              min={MIN}
              max={MAX}
              step={STEP}
              value={values[resource]}
              disabled={disabled}
              onChange={(e) => onChange({ ...values, [resource]: Number(e.target.value) })}
            />
            <span className="slider-value">
              {values[resource].toFixed(3)}
              {values[resource] !== RESOURCE_VALUES[resource] && (
                <span className="slider-was"> was {RESOURCE_VALUES[resource].toFixed(3)}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="slider-actions">
        <button onClick={() => onChange({ ...RESOURCE_VALUES })} disabled={disabled || !modified}>
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
