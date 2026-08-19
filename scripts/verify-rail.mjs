// Final rail verification: geometry cap + scroll, wave widen + white, auto-load fill,
// rail-top scroll continuation, click-to-jump.
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
  await page.waitForTimeout(7000)

  // 1. Initial auto-load fills the rail then pauses (not a full stall).
  // Wait for BOTH caps and load-button state to stabilize (auto-load done).
  let prevCaps = -1, prevLoads = -1, stable = 0, initial = 0
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      const loads = scroll ? Array.from(scroll.querySelectorAll('button')).filter((b) => /加载|Load/i.test(b.textContent || '')).length : -1
      return { caps: document.querySelectorAll('.tn-cap-btn').length, loads }
    })
    if (s.caps === prevCaps && s.loads === prevLoads) {
      stable++
      if (stable >= 3) { initial = s.caps; break }
    } else { stable = 0; prevCaps = s.caps; prevLoads = s.loads }
    await page.waitForTimeout(1000)
  }
  const geo = await page.evaluate(() => {
    const r = document.querySelector('.tn-rail')
    if (!r) return null
    const cs = getComputedStyle(r)
    return {
      caps: r.querySelectorAll('.tn-cap-btn').length,
      height: Math.round(r.getBoundingClientRect().height),
      maxHeight: cs.maxHeight,
      overflowY: cs.overflowY,
      scrollHeight: r.scrollHeight,
      clientHeight: r.clientHeight,
    }
  })
  console.log('1. initial fill:', JSON.stringify({ initial, geo }))

  // 2. Wave widen + white on hover.
  await page.hover('.tn-cap-btn')
  await page.waitForTimeout(400)
  const wave = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.tn-cap-btn'))
    const hot = btns.find((b) => b.classList.contains('tn-cap-hot'))?.querySelector('.tn-cap')
    const warm = btns.find((b) => b.classList.contains('tn-cap-warm'))?.querySelector('.tn-cap')
    const plain = btns.find((b) => !b.classList.contains('tn-cap-hot') && !b.classList.contains('tn-cap-warm'))?.querySelector('.tn-cap')
    const scale = (el) => {
      if (!el) return null
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
      return Math.round(m.a * 100) / 100
    }
    const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null)
    // Width is unchanged (transform-only widening) — check the base width too.
    return { hotScale: scale(hot), hotBg: bg(hot), warmScale: scale(warm), plainScale: scale(plain) }
  })
  console.log('2. wave (scaleX + theme bg):', JSON.stringify(wave))

  // 3. Rail-top scroll → load remaining history to the end.
  // First confirm there IS more history (load button present), then scroll.
  const pre = await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    const loads = scroll ? Array.from(scroll.querySelectorAll('button')).filter((b) => /加载|Load/i.test(b.textContent || '')).length : -1
    return { caps: document.querySelectorAll('.tn-cap-btn').length, loads }
  })
  console.log('3. pre-scroll:', JSON.stringify(pre))
  if (pre.loads > 0) {
    await page.evaluate(() => {
      const r = document.querySelector('.tn-rail')
      if (r) { r.scrollTop = 0; for (let i = 0; i < 3; i++) r.dispatchEvent(new Event('scroll')) }
    })
    const samples = []
    let grewTo = pre.caps
    for (let i = 0; i < 20; i++) {
      const caps = await page.evaluate(() => document.querySelectorAll('.tn-cap-btn').length)
      samples.push(caps)
      if (caps > grewTo) grewTo = caps
      const loads = await page.evaluate(() => {
        const scroll = document.querySelector('[data-conversation-scroll]')
        return scroll ? Array.from(scroll.querySelectorAll('button')).filter((b) => /加载|Load/i.test(b.textContent || '')).length : -1
      })
      if (loads === 0 && caps === grewTo) break
      await page.waitForTimeout(1000)
    }
    const btnEnd = await page.evaluate(() => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      return scroll ? Array.from(scroll.querySelectorAll('button')).filter((b) => /加载|Load/i.test(b.textContent || '')).length : -1
    })
    console.log('3. scroll samples:', samples.join(','))
    console.log('3. result:', JSON.stringify({ grewTo, loadButtonsAtEnd: btnEnd }))
  } else {
    console.log('3. already fully loaded; skipped scroll test')
  }

  // 4. Click a capsule → jump (scrollTop changes, highlight flashes).
  const before = await page.evaluate(() => {
    const s = document.querySelector('[data-conversation-scroll]')
    return s ? s.scrollTop : null
  })
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.tn-cap-btn'))
    const mid = Math.floor(btns.length / 2)
    if (btns[mid]) btns[mid].click()
  })
  await page.waitForTimeout(800)
  const jump = await page.evaluate(() => {
    const s = document.querySelector('[data-conversation-scroll]')
    return { scrollTop: s ? s.scrollTop : null, highlight: document.querySelectorAll('.tn-jump-highlight').length }
  })
  console.log('4. jump:', JSON.stringify({ before, jump }))

  console.log('errors:', errors.slice(0, 5))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
