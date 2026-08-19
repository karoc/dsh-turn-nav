// Verify: rail reads full history from host (data, no prepend), click-jump works.
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
  const clicked = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
    const target = rows.find((r) => {
      const t = (r.textContent || '').trim()
      return !t.startsWith('New Session') && t.length > 3
    })
    if (target) { target.click(); return target.textContent.trim().slice(0, 30) }
    return null
  })
  console.log('clicked session:', clicked)
  await page.waitForTimeout(8000)

  // Rail should fill from history data (no "Load earlier" prepend needed).
  const rail = await page.evaluate(() => {
    const railEl = document.querySelector('.tn-rail')
    const scroll = document.querySelector('[data-conversation-scroll]')
    const loadBtns = scroll ? Array.from(scroll.querySelectorAll('button')).filter((b) => /加载|Load/i.test(b.textContent || '')) : []
    return {
      hasRail: !!railEl,
      caps: railEl ? railEl.querySelectorAll('.tn-cap-btn').length : 0,
      height: railEl ? Math.round(railEl.getBoundingClientRect().height) : 0,
      scrollHeight: railEl ? railEl.scrollHeight : 0,
      clientHeight: railEl ? railEl.clientHeight : 0,
      flowRowCount: scroll ? scroll.querySelectorAll('[data-chat-anchor-key]').length : 0,
      loadButtonCount: loadBtns.length,
    }
  })
  console.log('rail (from history):', JSON.stringify(rail))

  // Hover to confirm tooltip still works.
  if (rail.hasRail && rail.caps > 0) {
    await page.hover('.tn-cap-btn:nth-child(3)')
    await page.waitForTimeout(400)
    const tip = await page.evaluate(() => {
      const t = document.querySelector('.tn-tip')
      return t ? { text: t.textContent.slice(0, 60), top: Math.round(t.getBoundingClientRect().top) } : null
    })
    console.log('tooltip:', JSON.stringify(tip))
  }

  console.log('errors:', errors.slice(0, 5))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
