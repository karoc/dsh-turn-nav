// Verify: clicking an out-of-window turn shows immediate + sustained feedback
// (capsule pulse + "locating…" bubble) until the jump completes.
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:3080'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
    const target = rows.find((r) => { const t = (r.textContent || '').trim(); return !t.startsWith('New Session') && t.length > 3 })
    if (target) target.click()
  })
  await page.waitForTimeout(8000)
  for (let i = 0; i < 20; i++) {
    const c = await page.evaluate(() => { const r = document.querySelector('.tn-rail'); return r ? r.querySelectorAll('.tn-cap-btn').length : 0 })
    if (c > 0) break
    await page.waitForTimeout(1000)
  }

  await page.evaluate(() => { const btns = document.querySelectorAll('.tn-cap-btn'); if (btns[0]) btns[0].click() })
  await page.waitForTimeout(300)
  const immediate = await page.evaluate(() => ({
    feedback: document.querySelector('.tn-jump-feedback')?.textContent?.trim() || null,
    loadingCapsule: document.querySelectorAll('.tn-cap-btn.tn-loading').length,
  }))
  console.log('immediate feedback:', JSON.stringify(immediate))

  let cleared = false
  let scrollTop = null
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000)
    const s = await page.evaluate(() => ({
      fb: document.querySelector('.tn-jump-feedback') !== null,
      loading: document.querySelectorAll('.tn-cap-btn.tn-loading').length,
      scrollTop: document.querySelector('[data-conversation-scroll]')?.scrollTop ?? null,
    }))
    if (!s.fb && !s.loading) { cleared = true; scrollTop = s.scrollTop; break }
  }
  console.log('after jump completes:', JSON.stringify({ cleared, scrollTop }))
  console.log('errors:', errors.slice(0, 5))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
