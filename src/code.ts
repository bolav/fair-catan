// Board codes: the short shareable string for a board.
//
// A board is determined by its 32-bit seed and three setup-lock bits. Those 35
// bits fit exactly in seven base-32 characters, followed by one check character.
//
// Crockford's base 32 alphabet, not base 36: it leaves out I, L, O and U, so
// the reader-friendly foldings (O to zero, I and L to one) can be applied on
// input without ever colliding with a real symbol. Base 36 cannot do that,
// because O and I are themselves digits in it.
//
// The check character matters more than it looks. Without it a single mistyped
// character silently produces a *different valid board*, which is the worst
// possible failure for something people read aloud across a table.

import { DEFAULT_BOARD_OPTIONS, type BoardOptions } from './board'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // 32 symbols, no I L O U
const BASE = ALPHABET.length
const BODY = 7 // 7 x 5 bits = 35: 32-bit seed + 3 board-option bits
const GROUP = 4
const SEED_RANGE = 0x100000000

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

function optionBits(options: Partial<BoardOptions>): number {
  return (
    (options.desertCenter ? 1 : 0) |
    (options.standardHarbours ? 2 : 0) |
    (options.standardNumbers ? 4 : 0)
  )
}

export function encodeBoardCode(seed: number, options: Partial<BoardOptions> = {}): string {
  const settings = { ...DEFAULT_BOARD_OPTIONS, ...options }
  let value = (seed >>> 0) + optionBits(settings) * SEED_RANGE
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
export interface DecodedBoardCode {
  seed: number
  boardOptions: BoardOptions
}

export function decodeBoardSpec(code: string): DecodedBoardCode | null {
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
  if (seed < 0 || seed >= SEED_RANGE * 8) return null
  const bits = Math.floor(seed / SEED_RANGE)
  return {
    seed: (seed % SEED_RANGE) >>> 0,
    boardOptions: {
      desertCenter: Boolean(bits & 1),
      standardHarbours: Boolean(bits & 2),
      standardNumbers: Boolean(bits & 4),
    },
  }
}

/** Backwards-compatible seed-only decoder for callers that do not need locks. */
export function decodeBoardCode(code: string): number | null {
  return decodeBoardSpec(code)?.seed ?? null
}
