import { expect } from '@playwright/test'

export const SELECTED_BG = 'rgb(59, 130, 246)'
export const GIVEN_BG = 'rgb(226, 232, 240)'

export const cell = (page, i) => page.locator('.board > .cell').nth(i)
export const pencil = (page, i, d) => cell(page, i).locator('.pencil-box').nth(d - 1)
export const pen = (page, i) => cell(page, i).locator('.pen-box')

export async function openBoard(page, path = './') {
  await page.goto(path)
  await page.getByRole('button', { name: /Play/ }).click()
  await expect(page.locator('.board > .cell')).toHaveCount(81)
}

export async function expectValue(page, i, v) {
  if (v) await expect(pen(page, i)).toHaveText(String(v))
  else await expect(pen(page, i)).toHaveCount(0)
}

export function solve(q) {
  const g = [...q].map(Number)
  const ok = (i, d) => {
    const r = Math.floor(i / 9), c = i % 9
    const br = r - (r % 3), bc = c - (c % 3)
    for (let k = 0; k < 9; k++) {
      if (g[r * 9 + k] === d || g[k * 9 + c] === d) return false
      if (g[(br + Math.floor(k / 3)) * 9 + bc + (k % 3)] === d) return false
    }
    return true
  }
  const go = () => {
    const i = g.indexOf(0)
    if (i < 0) return true
    for (let d = 1; d <= 9; d++) {
      if (!ok(i, d)) continue
      g[i] = d
      if (go()) return true
    }
    g[i] = 0
    return false
  }
  if (!go()) throw new Error('unsolvable puzzle')
  return g.join('')
}
