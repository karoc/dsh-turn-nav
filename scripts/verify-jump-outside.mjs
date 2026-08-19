import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:3080'
async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
    const target = rows.find((r) => { const t = (r.textContent || '').trim(); return !t.startsWith('New Session') && t.length > 3 })
    if (target) target.click()
  })
  await page.waitForTimeout(8000)
  // Wait for rail
  for (let i = 0; i < 20; i++) {
    const c = await page.evaluate(() => { const r = document.querySelector('.tn-rail'); return r ? r.querySelectorAll('.tn-cap-btn').length : 0 })
    if (c > 0) break
    await page.waitForTimeout(1000)
  }
  const before = await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    return { scrollTop: scroll.scrollTop, flowRows: scroll.querySelectorAll('[data-chat-anchor-key]').length, caps: document.querySelectorAll('.tn-cap-btn').length }
  })
  console.log('before click:', JSON.stringify(before))
  // Click the FIRST capsule (oldest turn, likely outside the window)
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.tn-cap-btn')
    if (btns[0]) btns[0].click()
  })
  // Wait for window expansion + jump
  await page.waitForTimeout(6000)
  const after = await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    return { scrollTop: scroll.scrollTop, flowRows: scroll.querySelectorAll('[data-chat-anchor-key]').length }
  })
  console.log('after click (window should have expanded, scrolled):', JSON.stringify(after))
  console.log('flow grew:', after.flowRows > before.flowRows, '| scrolled:', after.scrollTop !== before.scrollTop)
  console.log('errors:', errors.slice(0, 5))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
