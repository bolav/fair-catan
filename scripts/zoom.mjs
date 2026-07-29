// Zoomed crops of the board SVG, for looking at label collisions.
// Usage: node scripts/zoom.mjs [outDir] [url]
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const outDir = process.argv[2] ?? 'shots'
const url = process.argv[3] ?? 'http://localhost:5173/'
const theme = process.argv[4] ?? 'light'

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  deviceScaleFactor: 3,
  colorScheme: theme,
})
const page = await context.newPage()
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('.board svg')
await page.waitForTimeout(200)

const svg = page.locator('.board svg')
await svg.screenshot({ path: `${outDir}/board-${theme}.png` })

const box = await svg.boundingBox()
const halves = {
  left: { x: box.x, y: box.y + box.height * 0.28, width: box.width * 0.5, height: box.height * 0.42 },
  right: { x: box.x + box.width * 0.5, y: box.y + box.height * 0.28, width: box.width * 0.5, height: box.height * 0.42 },
}
for (const [name, clip] of Object.entries(halves)) {
  await page.screenshot({ path: `${outDir}/board-${theme}-${name}.png`, clip })
}

await browser.close()
