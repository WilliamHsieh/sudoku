// pr3-before.png / pr3-after.png / pr3-after.webm
// Usage: node scripts/pr3-artifacts.mjs [outDir] [url]
import { chromium } from '@playwright/test'
import { mkdir, rename, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = process.argv[2] || '/opt/cursor/artifacts'
const URL = process.env.URL || process.argv[3] || 'http://localhost:4173/sudoku/'
const MODE = process.env.MODE || 'after' // 'before' | 'after'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  recordVideo: MODE === 'after' ? { dir: OUT, size: { width: 1280, height: 800 } } : undefined,
})
const page = await context.newPage()
await page.clock.install({ time: new Date('2025-06-15T12:00:00') })
await page.goto(URL)
await page.clock.pauseAt(new Date('2025-06-15T12:01:00'))
// Fake clock swallows page.waitForTimeout; wall-clock pauses keep the video readable.
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

const cell = (i) => page.locator('.board > .cell').nth(i)
const day = (n) =>
  page.locator('.calendar-day').filter({ has: page.locator('.day-number', { hasText: new RegExp(`^${n}$`) }) })

if (MODE === 'before') {
  await page.getByRole('button', { name: /Play/ }).click()
  await cell(0).click()
  await page.keyboard.press('4')
  await pause(400)
  await page.screenshot({ path: join(OUT, 'pr3-before.png') })
  await context.close()
  await browser.close()
  console.log('saved before to', OUT)
  process.exit(0)
}

// after: same still as before, then a calendar + undo demo for the video
await page.getByRole('button', { name: /Play/ }).click()
await cell(0).click()
await page.keyboard.press('4')
await pause(400)
await page.screenshot({ path: join(OUT, 'pr3-after.png') })
await pause(2500)

await page.getByRole('button', { name: /Calendar/ }).click()
await pause(800)
await day(1).click()
await pause(700)
await page.locator('.difficulty-button.easy').click()
await pause(900)
await cell(5).click()
await pause(400)
await page.keyboard.press('6')
await pause(800)
await cell(5).click({ button: 'right' })
await pause(800)
await cell(5).click()
await pause(350)
await page.keyboard.press('6')
await pause(700)
await page.keyboard.press('Control+z')
await pause(900)
await page.keyboard.press('Control+Shift+z')
await pause(3500)

await context.close()
const dest = join(OUT, 'pr3-after.webm')
const video = page.video()
if (video) {
  const src = await video.path()
  if (src && src !== dest) await rename(src, dest)
  const bytes = (await stat(dest)).size
  if (bytes > 15 * 1024 * 1024) throw new Error(`video ${bytes} bytes exceeds 15 MB`)
}
await browser.close()
console.log('saved after to', OUT)
