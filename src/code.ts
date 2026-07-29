// Board codes: the short shareable string for a board (TODO §6).
//
// A board is entirely determined by its 32-bit board seed — tiles, numbers and
// frame arrangement all come out of it — so the code is just that number in
// base 32, plus one check character.
//
// Crockford's base 32 alphabet, not base 36: it leaves out I, L, O and U, so
// the reader-friendly foldings (O to zero, I and L to one) can be applied on
// input without ever colliding with a real symbol. Base 36 cannot do that,
// because O and I are themselves digits in it.
//
// The check character matters more than it looks. Without it a single mistyped
// character silently produces a *different valid board*, which is the worst
// possible failure for something people read aloud across a table.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // 32 symbols, no I L O U
const BASE = ALPHABET.length
const BODY = 7 // 7 x 5 bits = 35, enough for any 32-bit seed
const GROUP = 4

/** Folded on input, so a code can be read aloud without ceremony. */
const CONFUSABLE: Record<string, string> = { O: '0', I: '1', L: '1' }

function checkChar(body: string): string {
  // Position-weighted, so a transposition inside the body is caught too.
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    sum += (ALPHABET.indexOf(body[i]) + 1) * (i + 1)
  }
  return ALPHABET[sum % BASE]
}

export function encodeBoardCode(seed: number): string {
  let value = seed >>> 0
  let body = ''
  for (let i = 0; i < BODY; i++) {
    body = ALPHABET[value % BASE] + body
    value = Math.floor(value / BASE)
  }
  const full = body + checkChar(body)
  return `${full.slice(0, GROUP)}-${full.slice(GROUP)}`
}

/**
 * The inverse. Returns null for anything that is not a well-formed code, so
 * callers can tell "not a code yet" from "a code for some other board".
 */
export function decodeBoardCode(code: string): number | null {
  const cleaned = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .split('')
    .map((c) => CONFUSABLE[c] ?? c)
    .join('')

  if (cleaned.length !== BODY + 1) return null
  for (const c of cleaned) {
    if (!ALPHABET.includes(c)) return null
  }

  const body = cleaned.slice(0, BODY)
  if (cleaned[BODY] !== checkChar(body)) return null

  let seed = 0
  for (const c of body) {
    seed = seed * BASE + ALPHABET.indexOf(c)
  }
  if (seed < 0 || seed > 0xffffffff) return null
  return seed >>> 0
}
