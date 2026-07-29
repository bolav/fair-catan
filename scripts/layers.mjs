// Screenshots the board with each combination of the Show toggles that matters.
// Usage: node scripts/layers.mjs [outDir] [url] [theme]
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const outDir = process.argv[2] ?? 'shots'
const url = process.argv[3] ?? 'http://localhost:5173/'
const theme = process.argv[4] ?? 'light'

const CASES = [
  { name: 'all', off: [] },
  { name: 'no-cards', off: ['Opening cards'] },
  { name: 'no-roads', off: ['Roads'] },
  { name: 'bare', off: ['Settlements', 'Roads', 'Opening cards'] },
]

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  deviceScaleFactor: 2,
  colorScheme: theme,
})

for (const testCase of CASES) {
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.board svg')
  for (const label of testCase.off) {
    await page.getByLabel(label, { exact: true }).uncheck()
  }
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${outDir}/layers-${testCase.name}.png`, fullPage: true })
  const counts = await page.evaluate(() => ({
    settlements: document.querySelectorAll('[data-role="settlement"]').length,
    roads: document.querySelectorAll('[data-role="road"]').length,
    payout: document.querySelectorAll('[data-role="payout"]').length,
  }))
  console.log(`${testCase.name.padEnd(9)} ${JSON.stringify(counts)}`)
  await page.close()
}

await browser.close()
