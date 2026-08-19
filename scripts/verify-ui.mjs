// Verify theme-following hover color, no horizontal scrollbar/drift, rail-wide
// pointer-events, and tooltip.
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
  await page.waitForTimeout(7000)

  // 1. Rail geometry: pointer-events auto, overflow-x hidden, no horizontal overflow.
  const geo = await page.evaluate(() => {
    const r = document.querySelector('.tn-rail')
    if (!r) return null
    const cs = getComputedStyle(r)
    return {
      pointerEvents: cs.pointerEvents,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      scrollWidth: r.scrollWidth,
      clientWidth: r.clientWidth,
      hasHorizontalOverflow: r.scrollWidth > r.clientWidth + 1,
      width: Math.round(r.getBoundingClientRect().width),
    }
  })
  console.log('1. rail geometry:', JSON.stringify(geo))

  // 2. Hover: theme-following color + transform (no reflow). Capture layout before/after.
  const beforeLayout = await page.evaluate(() => {
    const r = document.querySelector('.tn-rail')
    return { scrollWidth: r.scrollWidth, clientWidth: r.clientWidth }
  })
  await page.hover('.tn-cap-btn:nth-child(10)')
  await page.waitForTimeout(400)
  const hover = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.tn-cap-btn'))
    const hot = btns.find((b) => b.classList.contains('tn-cap-hot'))?.querySelector('.tn-cap')
    const warm = btns.find((b) => b.classList.contains('tn-cap-warm'))?.querySelector('.tn-cap')
    const r = document.querySelector('.tn-rail')
    const labelPrimary = getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-label-primary').trim()
    return {
      hotBg: hot ? getComputedStyle(hot).backgroundColor : null,
      hotTransform: hot ? getComputedStyle(hot).transform : null,
      warmTransform: warm ? getComputedStyle(warm).transform : null,
      labelPrimary,
      layoutAfter: { scrollWidth: r.scrollWidth, clientWidth: r.clientWidth },
      tooltip: document.querySelector('[role="tooltip"]')?.textContent?.slice(0, 60) || null,
    }
  })
  console.log('2. hover:', JSON.stringify(hover))
  console.log('   layout unchanged:', JSON.stringify(beforeLayout) === JSON.stringify(hover.layoutAfter))

  // 3. Tooltip visible on hover (multi-line info)
  console.log('3. tooltip:', JSON.stringify(hover.tooltip))

  console.log('errors:', errors.slice(0, 5))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
