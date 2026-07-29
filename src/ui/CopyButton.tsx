// A copy button that reports what happened.
//
// Silently doing nothing is the failure mode this exists to avoid: if the
// clipboard is unavailable, it highlights the text so the user can copy it by
// hand, and says so.

import { useCallback, useEffect, useRef, useState } from 'react'
import { copyText, selectText } from '../copy'

type State = 'idle' | 'copied' | 'manual'

export type CopyLabels = Record<State, string>

/** Inline, inside a sentence. */
export const INLINE_LABELS: CopyLabels = {
  idle: 'copy',
  copied: 'copied',
  manual: 'selected — press Ctrl+C',
}

/** Standalone, sitting next to other buttons. Kept short so the row is stable. */
export const BUTTON_LABELS: CopyLabels = {
  idle: 'Copy',
  copied: 'Copied',
  manual: 'Ctrl+C',
}

export interface CopyButtonProps {
  text: string
  /** Highlighted when the clipboard is unavailable. */
  source?: React.RefObject<HTMLElement | null>
  className?: string
  labels?: CopyLabels
}

export function CopyButton({
  text,
  source,
  className = 'link',
  labels = INLINE_LABELS,
}: CopyButtonProps) {
  const [state, setState] = useState<State>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => setState('idle'), [text])

  const onClick = useCallback(() => {
    void copyText(text).then((ok) => {
      if (!ok) selectText(source?.current ?? null)
      setState(ok ? 'copied' : 'manual')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2500)
    })
  }, [text, source])

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      data-state={state}
      aria-label={`Copy board code ${text}`}
    >
      <span aria-live="polite">{labels[state]}</span>
    </button>
  )
}
