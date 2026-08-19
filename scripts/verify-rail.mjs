// Final comprehensive rail verification: auto-load stability, wave hover, tooltip content, jump.
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
  await page.waitForTimeout(6000)

  // 1. Auto-load: wait until stable (load button gone and cap count stable for 2 checks).
  let caps = 0
  let stable = false
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      const loads = scroll ? Array.from(scroll.querySelectorAll('button')).filter((b) => /加载更早|Load earlier/.test(b.textContent || '')).length : 0
      return { caps: document.querySelectorAll('.tn-cap-btn').length, loads }
    })
    if (s.loads === 0 && s.caps === caps) { stable = true; break }
    caps = s.caps
    await page.waitForTimeout(1000)
  }
  console.log('auto-load:', JSON.stringify({ caps, stable }))

  // 2. Wave hover on a middle capsule + tooltip content
  const mid = Math.max(0, Math.floor(caps / 2))
  await page.hover(`.tn-cap-btn:nth-child(${mid + 1})`)
  await page.waitForTimeout(500)
  const hover = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.tn-cap-btn'))
    const hot = btns.findIndex((b) => b.classList.contains('tn-cap-hot'))
    const warm = btns.filter((b) => b.classList.contains('tn-cap-warm')).length
    const tip = document.querySelector('[role="tooltip"]')
    return { hot, warm, tooltip: tip ? tip.textContent : null }
  })
  console.log('wave hover:', JSON.stringify(hover))

  // 3. Click that capsule → jump. Verify scrollTop moved near the target.
  const before = await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    return scroll ? scroll.scrollTop : null
  })
  await page.evaluate((idx) => {
    const btns = Array.from(document.querySelectorAll('.tn-cap-btn'))
    if (btns[idx]) btns[idx].click()
  }, mid)
  await page.waitForTimeout(1500)
  const after = await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    return {
      scrollTop: scroll ? scroll.scrollTop : null,
      highlight: document.querySelectorAll('.tn-jump-highlight').length,
    }
  })
  console.log('jump:', JSON.stringify({ before, after }))

  // 4. Highlight fades
  await page.waitForTimeout(1800)
  const hlAfter = await page.evaluate(() => document.querySelectorAll('.tn-jump-highlight').length)
  console.log('highlight after fade:', hlAfter)

  console.log('errors:', errors.slice(0, 5))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
