// Browser-level checks on the rendered board.
//
// `pnpm render-check` proves the SVG has the right *number* of things in it.
// These prove they end up in the right *place*, which is the part that had no
// verification behind it at all until Chromium turned up in the container.
//
//   pnpm test:e2e
//   pnpm test:e2e --update-snapshots   # after an intentional visual change
//
// The board is deterministic for the default seed, so no seeding is needed.

import { expect, test, type Locator, type Page } from '@playwright/test'

const THEMES = ['light', 'dark'] as const

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.$$eval(selector, (nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }),
  )
}

async function board(page: Page): Promise<Locator> {
  await page.goto('/')
  const svg = page.locator('.board svg')
  await expect(svg).toBeVisible()
  return svg
}

test.describe('the board', () => {
  test('draws one of everything the setup needs', async ({ page }) => {
    await board(page)
    await expect(page.locator('.board svg [data-role="terrain"]')).toHaveCount(19)
    await expect(page.locator('.board svg [data-role="harbour"]')).toHaveCount(9)
    await expect(page.locator('.board svg [data-role="settlement"]')).toHaveCount(8)
    await expect(page.locator('.board svg [data-role="road"]')).toHaveCount(8)
    await expect(page.locator('.board svg [data-role="frame-letter"]')).toHaveCount(6)
    // One per player: by the rules, their second settlement.
    await expect(page.locator('.board svg [data-role="payout"]')).toHaveCount(4)
  })

  test('keeps harbour markers off the terrain names', async ({ page }) => {
    // The bug this pins: harbour markers used to be placed along the radial
    // direction, so on the near-horizontal ones a 54px-wide marker ran onto
    // the land and clipped WOOD, WHEAT and SHEEP.
    await board(page)
    const harbours = await boxes(page, '.board svg [data-role="harbour"]')
    const names = await boxes(page, '.board svg [data-role="terrain"]')
    expect(harbours).toHaveLength(9)
    expect(names).toHaveLength(19)

    const hits: string[] = []
    harbours.forEach((h, i) => {
      names.forEach((n, j) => {
        if (overlaps(h, n)) hits.push(`harbour ${i} overlaps terrain name ${j}`)
      })
    })
    expect(hits).toEqual([])
  })

  test('keeps harbour markers off each other', async ({ page }) => {
    await board(page)
    const harbours = await boxes(page, '.board svg [data-role="harbour"]')
    const hits: string[] = []
    for (let i = 0; i < harbours.length; i++) {
      for (let j = i + 1; j < harbours.length; j++) {
        if (overlaps(harbours[i], harbours[j])) hits.push(`harbours ${i} and ${j} overlap`)
      }
    }
    expect(hits).toEqual([])
  })

  test('keeps every frame letter inside the svg', async ({ page }) => {
    // The letters sit outside the frame's flat sides, which reach past the
    // hexagon's corners — they used to fall outside the viewBox and vanish.
    const svg = await board(page)
    const frame = (await svg.boundingBox())!
    const letters = await boxes(page, '.board svg [data-role="frame-letter"]')
    expect(letters).toHaveLength(6)
    for (const letter of letters) {
      expect(letter.x).toBeGreaterThanOrEqual(frame.x - 0.5)
      expect(letter.y).toBeGreaterThanOrEqual(frame.y - 0.5)
      expect(letter.x + letter.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5)
      expect(letter.y + letter.height).toBeLessThanOrEqual(frame.y + frame.height + 0.5)
    }
  })

  test('anchors each road at its own settlement, clear of the marker', async ({ page }) => {
    await board(page)
    const roads = await page.$$eval('.board svg [data-role="road"]', (nodes) =>
      nodes.map((n) => ({
        x1: Number(n.getAttribute('x1')),
        y1: Number(n.getAttribute('y1')),
        x2: Number(n.getAttribute('x2')),
        y2: Number(n.getAttribute('y2')),
      })),
    )
    const settlements = await page.$$eval('.board svg [data-role="settlement"]', (nodes) =>
      nodes.map((n) => ({ x: Number(n.getAttribute('cx')), y: Number(n.getAttribute('cy')) })),
    )

    const nearest = roads.map((road) =>
      settlements
        .map((s, i) => ({ i, gap: Math.hypot(road.x1 - s.x, road.y1 - s.y) }))
        .reduce((best, c) => (c.gap < best.gap ? c : best)),
    )

    // An edge is one hex circumradius, 46px. The road runs from 0.3 to 0.9
    // along it, so it starts 13.8px out — outside the 12px marker, and nowhere
    // near the 46px it would be if it were anchored at the wrong end.
    for (const { gap } of nearest) {
      expect(gap).toBeGreaterThan(12)
      expect(gap).toBeLessThan(16)
    }
    for (const road of roads) {
      expect(Math.hypot(road.x2 - road.x1, road.y2 - road.y1)).toBeCloseTo(46 * 0.6, 1)
    }
    // One road per settlement, no settlement serving two.
    expect(new Set(nearest.map((n) => n.i)).size).toBe(8)
  })
})

test.describe('the Show toggles', () => {
  const settlements = '.board svg [data-role="settlement"]'
  const roads = '.board svg [data-role="road"]'
  const payout = '.board svg [data-role="payout"]'

  test('everything is on to begin with', async ({ page }) => {
    await board(page)
    await expect(page.locator(settlements)).toHaveCount(8)
    await expect(page.locator(roads)).toHaveCount(8)
    await expect(page.locator(payout)).toHaveCount(4)
  })

  test('each one only turns off its own layer', async ({ page }) => {
    await board(page)

    await page.getByLabel('Roads', { exact: true }).uncheck()
    await expect(page.locator(roads)).toHaveCount(0)
    await expect(page.locator(settlements)).toHaveCount(8)
    await expect(page.locator(payout)).toHaveCount(4)
    await page.getByLabel('Roads', { exact: true }).check()

    // The ring means "this settlement deals the cards", so it goes with them.
    await page.getByLabel('Opening cards', { exact: true }).uncheck()
    await expect(page.locator(payout)).toHaveCount(0)
    await expect(page.locator(settlements)).toHaveCount(8)
    await expect(page.locator(roads)).toHaveCount(8)
    await page.getByLabel('Opening cards', { exact: true }).check()

    await page.getByLabel('Settlements', { exact: true }).uncheck()
    await expect(page.locator(settlements)).toHaveCount(0)
    await expect(page.locator(payout)).toHaveCount(0)
    await expect(page.locator(roads)).toHaveCount(8)
  })

  test('leaves a bare island with all three off', async ({ page }) => {
    await board(page)
    for (const label of ['Settlements', 'Roads', 'Opening cards']) {
      await page.getByLabel(label, { exact: true }).uncheck()
    }
    await expect(page.locator(settlements)).toHaveCount(0)
    await expect(page.locator(roads)).toHaveCount(0)
    await expect(page.locator(payout)).toHaveCount(0)

    // The board itself is untouched.
    await expect(page.locator('.board svg [data-role="terrain"]')).toHaveCount(19)
    await expect(page.locator('.board svg [data-role="harbour"]')).toHaveCount(9)

    // And so is the scoring, which is derived from the draft either way.
    await expect(page.getByText('Spread', { exact: false })).toBeVisible()
    await expect(page.locator('.hero-value')).toHaveText('0.214')
  })

  test('drops the matching sections of the setup sheet', async ({ page }) => {
    await board(page)
    const sheet = page.locator('.sheet')
    await expect(sheet).toContainText('settles')
    await expect(sheet).toContainText('road towards')
    await expect(sheet).toContainText('deal these cards')

    await page.getByLabel('Roads', { exact: true }).uncheck()
    await expect(sheet).not.toContainText('road towards')
    await expect(sheet).toContainText('settles')

    await page.getByLabel('Opening cards', { exact: true }).uncheck()
    await expect(sheet).not.toContainText('deal these cards')

    await page.getByLabel('Settlements', { exact: true }).uncheck()
    await expect(sheet).not.toContainText('settles')
    // The board build instructions always stay.
    await expect(sheet).toContainText('Build the sea frame first')
    await expect(sheet).toContainText('rebuild this exact island')
  })
})

test.describe('board codes', () => {
  const code = (page: Page) => page.getByLabel('Board code', { exact: true })

  test('shows a code for the current board and reloads it', async ({ page }) => {
    await board(page)
    const shown = await page.locator('.board-code code').innerText()
    expect(shown).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)

    // A different board, then back via the code.
    const before = await page.locator('.hero-value').innerText()
    await page.getByRole('button', { name: 'Single random board' }).click()
    await expect(page.locator('.board-code code')).not.toHaveText(shown)

    await code(page).fill(shown)
    await page.getByRole('button', { name: 'Load', exact: true }).click()
    await expect(page.locator('.board-code code')).toHaveText(shown)
    await expect(page.locator('.hero-value')).toHaveText(before)
  })

  test('rejects a mistyped code instead of loading another board', async ({ page }) => {
    await board(page)
    const shown = await page.locator('.board-code code').innerText()
    const bare = shown.replace('-', '')
    // Bump one character to something else in the alphabet.
    const wrong = (bare[0] === 'Z' ? 'Y' : 'Z') + bare.slice(1)

    await code(page).fill(wrong)
    await page.getByRole('button', { name: 'Load', exact: true }).click()
    await expect(page.getByText('Not a board code')).toBeVisible()
    // The board did not move.
    await expect(page.locator('.board-code code')).toHaveText(shown)
  })

  /** Paste into a scratch field — clipboard *read* permission is denied. */
  async function paste(page: Page): Promise<string> {
    await page.evaluate(() => {
      const t = document.createElement('textarea')
      t.id = 'paste-target'
      document.body.appendChild(t)
    })
    await page.locator('#paste-target').focus()
    await page.keyboard.press('Control+V')
    return page.locator('#paste-target').inputValue()
  }

  test('the copy button puts the code on the clipboard', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await board(page)

    const shown = await page.locator('.board-code code').innerText()
    await page.locator('.board-code button').click()
    await expect(page.locator('.board-code button')).toHaveText(/copied/)
    expect(await paste(page)).toBe(shown)

    // The first version left navigator.clipboard's rejection unhandled here.
    expect(errors).toEqual([])
  })

  test('copies even where the clipboard API does not exist', async ({ page }) => {
    // Reached over http on a LAN address — which is exactly how this dev
    // server is meant to be used — isSecureContext is false and
    // navigator.clipboard is undefined outright. The old code optional-chained
    // straight past that and did nothing at all, silently.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await board(page)

    const shown = await page.locator('.board-code code').innerText()
    await page.locator('.board-code button').click()
    await expect(page.locator('.board-code button')).toHaveText(/copied/)
    expect(await paste(page)).toBe(shown)
    expect(errors).toEqual([])
  })

  test('the code is selectable in the controls, not just a placeholder', async ({ page }) => {
    await board(page)
    const shown = await page.locator('.board-code code').innerText()
    // It has to be a real value: you cannot select or copy placeholder text.
    await expect(code(page)).toHaveValue(shown)

    await code(page).click()
    const selected = await page.evaluate(() => {
      const el = document.getElementById('code') as HTMLInputElement
      return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0)
    })
    expect(selected).toBe(shown)
  })

  test('accepts a code typed loosely', async ({ page }) => {
    await board(page)
    const shown = await page.locator('.board-code code').innerText()
    await page.getByRole('button', { name: 'Single random board' }).click()

    await code(page).fill(shown.replace('-', ' ').toLowerCase())
    await code(page).press('Enter')
    await expect(page.locator('.board-code code')).toHaveText(shown)
  })
})

test.describe('resource value sliders', () => {
  test('re-score the board without changing it', async ({ page }) => {
    await board(page)
    const codeBefore = await page.locator('.board-code code').innerText()
    const cibiBefore = await page.locator('.hero-value').innerText()

    const ore = page.getByLabel('ore', { exact: true })
    await expect(ore).toHaveValue('1.329')
    await ore.fill('0.2')

    // Same island, different score.
    await expect(page.locator('.board-code code')).toHaveText(codeBefore)
    await expect(page.locator('.hero-value')).not.toHaveText(cibiBefore)
    await expect(page.getByText('was 1.329')).toBeVisible()
    await expect(page.getByText('no longer comparable', { exact: false })).toBeVisible()
  })

  test('reset returns the article figures and the original score', async ({ page }) => {
    await board(page)
    const cibiBefore = await page.locator('.hero-value').innerText()
    const reset = page.getByRole('button', { name: /Reset to the article/ })
    await expect(reset).toBeDisabled()

    await page.getByLabel('wheat', { exact: true }).fill('0.1')
    await expect(page.locator('.hero-value')).not.toHaveText(cibiBefore)
    await expect(reset).toBeEnabled()

    await reset.click()
    await expect(page.getByLabel('wheat', { exact: true })).toHaveValue('1.35')
    await expect(page.locator('.hero-value')).toHaveText(cibiBefore)
    await expect(reset).toBeDisabled()
  })
})

for (const theme of THEMES) {
  test.describe(`${theme} mode`, () => {
    test.use({ colorScheme: theme })

    test('board renders as expected', async ({ page }) => {
      const svg = await board(page)
      await expect(svg).toHaveScreenshot(`board-${theme}.png`)
    })
  })
}

test.describe('the page', () => {
  for (const width of [1440, 900]) {
    test(`has nothing overflowing the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await board(page)
      const overflowing = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth
        const out: string[] = []
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.width === 0) continue
          if (r.right > limit + 1 || r.left < -1) {
            out.push(`${el.tagName.toLowerCase()}.${el.className || '(none)'}`)
          }
        }
        return out
      })
      expect(overflowing).toEqual([])
    })
  }

  test('logs no console errors', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text())
    })
    page.on('pageerror', (e) => problems.push(e.message))
    await board(page)
    expect(problems).toEqual([])
  })
})
