// Verify auto-sizing rail length: grows with turns, capped at 30vh.
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
    const target = rows.find((r) => {
      const t = (r.textContent || '').trim()
      return !t.startsWith('New Session') && t.length > 3
    })
    if (target) target.click()
  })
  await page.waitForTimeout(8000)
  for (let i = 0; i < 20; i++) {
    const c = await page.evaluate(() => {
      const r = document.querySelector('.tn-rail')
      return r ? r.querySelectorAll('.tn-cap-btn').length : 0
    })
    if (c > 0) break
    await page.waitForTimeout(1000)
  }

  const short = await page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    if (!rail) return null
    return {
      caps: rail.querySelectorAll('.tn-cap-btn').length,
      height: Math.round(rail.getBoundingClientRect().height),
      cssMaxHeight: getComputedStyle(rail).maxHeight,
      scrollHeight: rail.scrollHeight,
      clientHeight: rail.clientHeight,
    }
  })
  console.log('short session rail (auto-size):', JSON.stringify(short))

  // Expected: height ≈ caps * (10px btn + 0 gap) = caps*10, capped at 30vh (270px).
  const expected = short ? short.caps * 10 : 0
  console.log('   expected height ≈', expected, '; max =', short ? short.cssMaxHeight : '?')
  console.log('   auto-sized (content height, not fixed 540px):', short ? short.height < 400 : false)

  console.log('errors:', errors.slice(0, 5))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
