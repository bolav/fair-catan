// Regenerates the README screenshot.
//
//   node scripts/screenshot.mjs [outFile] [url] [theme]
//
// Runs the search first, so the shot shows a board the app actually chose
// rather than the default seed — which scores worse than a random board and
// makes a poor advert. The sweep is seeded, so this is reproducible.

import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const out = process.argv[2] ?? 'media/screenshot.png'
const url = process.argv[3] ?? 'http://localhost:5173/'
const theme = process.argv[4] ?? 'light'

const WIDTH = 1440
const HEIGHT = 1180 // masthead, controls, the whole board, and the CIBI+ panel

await mkdir(dirname(out), { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  // 1x: the file is a README asset, and 2x more than doubles it for detail
  // GitHub's content column cannot show anyway.
  deviceScaleFactor: 1,
  colorScheme: theme,
})
const page = await context.newPage()

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('.board svg')

await page.getByRole('button', { name: 'Search' }).click()
// The stats line only appears once the sweep has finished.
await page.waitForSelector('text=/Examined .* boards/', { timeout: 120_000 })
await page.waitForTimeout(300)

const cibi = await page.locator('.hero-value').innerText()
const code = await page.locator('.board-code code').innerText()

await page.screenshot({ path: out })
console.log(`${out} — ${theme}, ${WIDTH}x${HEIGHT}, CIBI+ ${cibi}, board ${code}`)

await browser.close()
