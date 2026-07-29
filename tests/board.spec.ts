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
