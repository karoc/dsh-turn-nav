// Capture the marketing screenshot for the README: fixture session (75 turns),
// default DSH STN mode — our rail centered on the right edge, official hidden.
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto(`http://127.0.0.1:3080/?token=${process.env.DSH_TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(3000)
await page.goto('http://127.0.0.1:3080/?fixture', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(6000)
await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
  const row = rows.find((r) => { const t = (r.textContent || '').trim(); return !t.startsWith('New Session') && t.length > 3 })
  row?.click()
})
await page.waitForTimeout(9000)
// Ensure default mode + rail filled.
for (let i = 0; i < 30; i += 1) {
  const caps = await page.evaluate(() => document.querySelector('.tn-rail')?.querySelectorAll('.tn-cap-btn').length ?? 0)
  if (caps > 10) break
  await page.waitForTimeout(1000)
}
// Hover a mid capsule so the wave + tooltip show in the shot.
const mid = await page.evaluate(() => document.querySelectorAll('.tn-cap-btn').length)
if (mid > 2) {
  await page.hover(`.tn-cap-btn:nth-child(${Math.floor(mid / 2)})`)
  await page.waitForTimeout(600)
}
const state = await page.evaluate(() => {
  const wrap = document.querySelector('.tn-wrap')
  const scroll = document.querySelector('[data-conversation-scroll]')
  const official = scroll?.querySelector('nav[aria-label*="轮次"], nav[aria-label*="Turn navigation"]')
  const tip = document.querySelector('.tn-tip')
  return {
    caps: document.querySelectorAll('.tn-cap-btn').length,
    wrapTop: wrap ? Math.round(wrap.getBoundingClientRect().top) : -1,
    nudged: wrap?.classList.contains('tn-nudge') ?? false,
    officialVisible: official !== null && getComputedStyle(official).display !== 'none',
    tooltipShown: tip !== null && tip.textContent.length > 0,
  }
})
console.log('shot state:', JSON.stringify(state))
await page.screenshot({ path: 'docs/turn-nav-rail.png' })
console.log('screenshot saved')
await browser.close()
