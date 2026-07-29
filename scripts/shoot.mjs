// Screenshots the running dev server in light + dark at two widths.
// Usage: node scripts/shoot.mjs [outDir] [url]
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const outDir = process.argv[2] ?? 'shots'
const url = process.argv[3] ?? 'http://localhost:5173/'

const WIDTHS = [
  { name: 'desktop', width: 1440, height: 1200 },
  { name: 'narrow', width: 900, height: 1400 },
]
const THEMES = ['light', 'dark']

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()

for (const size of WIDTHS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 2,
      colorScheme: theme,
    })
    const page = await context.newPage()
    const problems = []
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`)
    })
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForSelector('.board svg')
    await page.waitForTimeout(300)

    const file = `${outDir}/${size.name}-${theme}.png`
    await page.screenshot({ path: file, fullPage: true })

    // Anything wider than its container is a layout bug; report it numerically too.
    const overflow = await page.evaluate(() => {
      const out = []
      const docW = document.documentElement.clientWidth
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0) continue
        if (r.right > docW + 1 || r.left < -1) {
          out.push(`${el.tagName.toLowerCase()}.${el.className || '(no class)'} → ${Math.round(r.left)}..${Math.round(r.right)} of ${docW}`)
        }
      }
      return out.slice(0, 12)
    })

    console.log(`\n== ${size.name} ${theme} → ${file}`)
    if (problems.length) console.log('  console:', problems.join(' | '))
    if (overflow.length) console.log('  overflow:\n    ' + overflow.join('\n    '))
    await context.close()
  }
}

await browser.close()
