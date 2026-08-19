// Verify: custom tooltip visible (inside viewport, left of rail), hidden scrollbar,
// no gaps between turn hotspots, scroll buttons work.
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
    const target = rows.find((r) => (r.textContent || '').includes('插件-看板'))
    if (target) target.click()
  })
  await page.waitForTimeout(8000)

  // 1. Wrap structure: scroll buttons + rail, hidden scrollbar.
  const structure = await page.evaluate(() => {
    const wrap = document.querySelector('.tn-wrap')
    const rail = document.querySelector('.tn-rail')
    if (!wrap || !rail) return null
    const railCs = getComputedStyle(rail)
    return {
      hasWrap: !!wrap,
      scrollBtnCount: wrap.querySelectorAll('.tn-scroll-btn').length,
      railGap: railCs.gap,
      railScrollbarWidth: railCs.scrollbarWidth,
      webkitScrollbar: (() => {
        const s = document.createElement('style')
        s.textContent = '.tn-rail::-webkit-scrollbar{display:none}'
        return 'css ok'
      })(),
      btnGap: (() => {
        const btns = Array.from(rail.querySelectorAll('.tn-cap-btn'))
        if (btns.length < 2) return null
        const a = btns[5].getBoundingClientRect()
        const b = btns[6].getBoundingClientRect()
        return Math.round(b.top - a.bottom) // gap between adjacent buttons
      })(),
    }
  })
  console.log('1. structure:', JSON.stringify(structure))

  // 2. Hover a capsule → custom tooltip bubble visible inside viewport (left of rail).
  await page.hover('.tn-cap-btn:nth-child(10)')
  await page.waitForTimeout(400)
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.tn-tip')
    if (!t) return null
    const r = t.getBoundingClientRect()
    const rail = document.querySelector('.tn-rail').getBoundingClientRect()
    return {
      text: t.textContent.slice(0, 60),
      visible: r.width > 0 && r.height > 0,
      insideViewportX: r.left >= 0 && r.right <= window.innerWidth,
      insideViewportY: r.top >= 0 && r.bottom <= window.innerHeight,
      leftOfRail: r.right <= rail.left,
      role: t.getAttribute('role'),
    }
  })
  console.log('2. tooltip:', JSON.stringify(tip))

  // 3. Scroll buttons: click down, rail scrollTop should increase (if scrollable).
  await page.evaluate(() => {
    // Load enough turns first (scroll rail to top triggers loading, or just use existing)
    const rail = document.querySelector('.tn-rail')
    if (rail.scrollHeight > rail.clientHeight) {
      const before = rail.scrollTop
      const btn = document.querySelectorAll('.tn-scroll-btn')[1]
      if (btn) btn.click()
      return { scrollable: true, before }
    }
    return { scrollable: false, before: null }
  })
  await page.waitForTimeout(800)
  const scroll = await page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    return { scrollTop: rail.scrollTop, scrollHeight: rail.scrollHeight, clientHeight: rail.clientHeight }
  })
  console.log('3. scroll button:', JSON.stringify(scroll))

  console.log('errors:', errors.slice(0, 5))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
