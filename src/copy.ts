// Copying to the clipboard, in the places this app actually runs.
//
// navigator.clipboard is not available at all outside a secure context, and
// this dev server is deliberately bound to every interface so it can be
// reached from outside the container — over http://<lan-ip>:5173 the whole API
// is undefined. Where it does exist it can still reject with NotAllowedError
// if the permission has not been granted.
//
// So: try the modern API, fall back to the old execCommand path (which works
// in insecure contexts), and tell the caller whether anything worked so the UI
// can offer selecting the text instead of silently doing nothing.

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  // Off-screen but still focusable; display:none would not be selectable.
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '-9999px'
  document.body.appendChild(area)

  const selection = document.getSelection()
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }

  document.body.removeChild(area)
  if (selection && previous) {
    selection.removeAllRanges()
    selection.addRange(previous)
  }
  return ok
}

export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied — fall through rather than surfacing an unhandled
      // rejection, which is what the first version of this did.
    }
  }
  return legacyCopy(text)
}

/** Highlight an element's text, so the user can copy it by hand. */
export function selectText(element: HTMLElement | null): void {
  if (!element) return
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus()
    element.select()
    return
  }
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
