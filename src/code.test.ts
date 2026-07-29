import { describe, expect, it } from 'vitest'
import { decodeBoardCode, encodeBoardCode } from './code'

const SEEDS = [0, 1, 42, 1619994804, 0x7fffffff, 0xfffffffe, 0xffffffff]

describe('board codes', () => {
  it('round-trips every seed it can be given', () => {
    for (const seed of SEEDS) {
      expect(decodeBoardCode(encodeBoardCode(seed))).toBe(seed)
    }
    // And a broad sweep, not just the interesting values.
    for (let i = 0; i < 2000; i++) {
      const seed = Math.floor((i * 2654435761) % 0x100000000) >>> 0
      expect(decodeBoardCode(encodeBoardCode(seed))).toBe(seed)
    }
  })

  it('is short, uniform and grouped', () => {
    for (const seed of SEEDS) {
      const code = encodeBoardCode(seed)
      expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    }
  })

  it('reads back regardless of case, spacing or punctuation', () => {
    const seed = 1619994804
    const code = encodeBoardCode(seed)
    const bare = code.replace('-', '')
    expect(decodeBoardCode(bare.toLowerCase())).toBe(seed)
    expect(decodeBoardCode(`  ${bare.slice(0, 2)} ${bare.slice(2)}  `)).toBe(seed)
    expect(decodeBoardCode(bare.split('').join(' '))).toBe(seed)
  })

  it('accepts O for 0 and I for 1, which is how people read codes aloud', () => {
    for (const seed of [0, 1, 1619994804, 0xffffffff]) {
      const bare = encodeBoardCode(seed).replace('-', '')
      const spoken = bare.replace(/0/g, 'O').replace(/1/g, 'I')
      expect(decodeBoardCode(spoken)).toBe(seed)
    }
  })

  it('rejects a single mistyped character rather than loading another board', () => {
    const code = encodeBoardCode(1619994804).replace('-', '')
    let caught = 0
    let missed = 0
    for (let i = 0; i < code.length; i++) {
      for (const c of '0123456789ABCDEFGHJKMNPQRSTVWXYZ') {
        if (c === code[i]) continue
        const typo = code.slice(0, i) + c + code.slice(i + 1)
        // Fold the confusables out, since those are decoded on purpose.
        if (decodeBoardCode(typo) === 1619994804) continue
        if (decodeBoardCode(typo) === null) caught++
        else missed++
      }
    }
    // A mod-32 check digit catches 31/32 of single-character errors.
    expect(caught / (caught + missed)).toBeGreaterThan(0.95)
  })

  it('catches every transposition inside the body', () => {
    // This is what the positional weighting buys over a plain sum. It is a
    // guarantee for the 7 body characters; a swap across the body/check
    // boundary is only caught most of the time.
    let caught = 0
    let total = 0
    for (const seed of SEEDS) {
      const code = encodeBoardCode(seed).replace('-', '')
      for (let i = 0; i < 6; i++) {
        if (code[i] === code[i + 1]) continue
        const swapped = code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2)
        total++
        if (decodeBoardCode(swapped) === null) caught++
      }
    }
    expect(total).toBeGreaterThan(0)
    expect(caught).toBe(total)
  })

  it('rejects junk', () => {
    for (const bad of ['', 'x', 'ABCD-EFG', 'ABCD-EFGHI', 'not a code', '----', '!!!!-!!!!']) {
      expect(decodeBoardCode(bad)).toBeNull()
    }
  })
})
