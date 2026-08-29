// Probe: per session, compare OUR capsule count vs the OFFICIAL rail mark count
// vs flow rows — to tell whether navigation only ever yields 1 turn.
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

const url = `http://127.0.0.1:3080/?token=${process.env.DSH_TOKEN}`
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(6000)

const opened = new Set()
for (let round = 0; round < 6; round += 1) {
  const titles = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow"]')).map((r) => (r.textContent || '').trim()))
  const candidate = titles.find((t, i) => i > 0 && t.length > 3 && !opened.has(t))
  if (!candidate) break
  opened.add(candidate)
  await page.evaluate((title) => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
    const row = rows.find((r) => (r.textContent || '').trim() === title)
    row?.click()
  }, candidate)
  await page.waitForTimeout(7000)
  const state = await page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    const official = document.querySelector('nav[aria-label*="轮次"], nav[aria-label*="Turn navigation"]')
    const scroll = document.querySelector('[data-conversation-scroll]')
    const caps = rail ? rail.querySelectorAll('.tn-cap-btn').length : 0
    const officialMarks = official ? official.querySelectorAll('button, [role="button"]').length : 0
    const flowRows = scroll ? scroll.querySelectorAll('[data-chat-anchor-key]').length : 0
    const first = rail ? rail.querySelector('.tn-cap-btn')?.getAttribute('aria-label') ?? '' : ''
    const last = rail ? rail.querySelector('.tn-cap-btn:last-child')?.getAttribute('aria-label') ?? '' : ''
    return { caps, officialMarks, flowRows, first: first.slice(0, 40), last: last.slice(0, 40) }
  })
  console.log(JSON.stringify({ title: candidate.slice(0, 30), ...state }))
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(5000)
}
console.log('errors:', errors.slice(0, 5))
await browser.close()
