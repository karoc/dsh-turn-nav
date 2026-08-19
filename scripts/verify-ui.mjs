// Verify: tooltip follows hovered capsule (fully in viewport), fixed rail height,
// scroll-button enable/disable + hover auto-scroll, right-origin widening, center-on-jump.
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
  // Load until rail overflows (scroll-to-top loading)
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const rail = document.querySelector('.tn-rail')
      if (rail) { rail.scrollTop = 0; rail.dispatchEvent(new Event('scroll')) }
    })
    await page.waitForTimeout(1100)
    const overflow = await page.evaluate(() => {
      const rail = document.querySelector('.tn-rail')
      return rail ? rail.scrollHeight > rail.clientHeight : false
    })
    if (overflow) break
  }

  // 1. Fixed rail height regardless of turn count.
  const railGeo = await page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    return {
      height: Math.round(rail.getBoundingClientRect().height),
      cssHeight: getComputedStyle(rail).height,
      caps: rail.querySelectorAll('.tn-cap-btn').length,
      scrollHeight: rail.scrollHeight,
      clientHeight: rail.clientHeight,
    }
  })
  console.log('1. rail fixed height:', JSON.stringify(railGeo))

  // 2. Tooltip follows hovered capsule (middle), fully in viewport.
  const midIndex = Math.max(0, Math.floor(railGeo.caps * 0.6))
  await page.hover(`.tn-cap-btn:nth-child(${midIndex + 1})`)
  await page.waitForTimeout(400)
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.tn-tip')
    const btn = document.querySelectorAll('.tn-cap-btn')[document.querySelectorAll('.tn-cap-btn').length > 0 ? 0 : 0]
    // find the hovered (hot) button
    const hot = Array.from(document.querySelectorAll('.tn-cap-btn')).find((b) => b.classList.contains('tn-cap-hot'))
    if (!t || !hot) return null
    const tr = t.getBoundingClientRect()
    const hr = hot.getBoundingClientRect()
    const hotCenter = hr.top + hr.height / 2
    const tipCenter = tr.top + tr.height / 2
    return {
      alignDelta: Math.round(Math.abs(tipCenter - hotCenter)),
      inViewportX: tr.left >= 0 && tr.right <= window.innerWidth,
      inViewportY: tr.top >= 0 && tr.bottom <= window.innerHeight,
      top: Math.round(tr.top), bottom: Math.round(tr.bottom), innerH: window.innerHeight,
    }
  })
  console.log('2. tooltip follows hover:', JSON.stringify(tip))

  // 3. Scroll buttons enable/disable + hover auto-scroll.
  const btnState = await page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    const btns = document.querySelectorAll('.tn-scroll-btn')
    return {
      upDisabled: btns[0].disabled,
      downDisabled: btns[1].disabled,
      overflow: rail ? rail.scrollHeight > rail.clientHeight + 2 : false,
    }
  })
  console.log('3. button state:', JSON.stringify(btnState))
  if (btnState.overflow) {
    // Hover the DOWN button → rail should auto-scroll (scrollTop grows).
    await page.hover('.tn-scroll-btn:nth-child(3)')
    await page.waitForTimeout(1200)
    const afterHover = await page.evaluate(() => ({
      scrollTop: document.querySelector('.tn-rail').scrollTop,
    }))
    console.log('   after hovering down button (auto-scroll):', JSON.stringify(afterHover))
    await page.mouse.move(10, 450) // move away
    await page.waitForTimeout(300)
  } else {
    console.log('   (rail not overflowing — scroll interaction skipped)')
  }

  // 4. Right-origin widening: capsule right edge unchanged, left edge moves left.
  await page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    rail.scrollTop = 0
    rail.dispatchEvent(new Event('scroll'))
  })
  await page.waitForTimeout(300)
  const before = await page.evaluate(() => {
    const btn = document.querySelector('.tn-cap-btn')
    const cap = btn.querySelector('.tn-cap')
    const r = cap.getBoundingClientRect()
    return { left: Math.round(r.left), right: Math.round(r.right) }
  })
  await page.hover('.tn-cap-btn:nth-child(3)')
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => {
    const hot = Array.from(document.querySelectorAll('.tn-cap-btn')).find((b) => b.classList.contains('tn-cap-hot'))
    const cap = hot.querySelector('.tn-cap')
    const r = cap.getBoundingClientRect()
    return { left: Math.round(r.left), right: Math.round(r.right) }
  })
  console.log('4. widen right-origin:', JSON.stringify({ before, after, rightEdgeMoved: before.right !== after.right }))

  // 5. Click a capsule → it centers in the rail (unless first/last or the rail
  //    has no overflow to scroll to center).
  await page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    rail.scrollTop = 0
  })
  await page.waitForTimeout(200)
  const canCenter = await page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    return rail ? rail.scrollHeight > rail.clientHeight + 2 : false
  })
  if (canCenter) {
    const centerIdx = Math.min(railGeo.caps - 2, Math.floor(railGeo.caps * 0.5))
    await page.evaluate((idx) => {
      const btns = document.querySelectorAll('.tn-cap-btn')
      if (btns[idx]) btns[idx].click()
    }, centerIdx)
    await page.waitForTimeout(400)
    const centered = await page.evaluate((idx) => {
      const rail = document.querySelector('.tn-rail')
      const btn = rail.querySelectorAll('.tn-cap-btn')[idx]
      const rr = rail.getBoundingClientRect()
      const br = btn.getBoundingClientRect()
      const railCenter = rr.top + rr.height / 2
      const btnCenter = br.top + br.height / 2
      return { deltaFromCenter: Math.round(Math.abs(railCenter - btnCenter)) }
    }, centerIdx)
    console.log('5. centered capsule delta (px from rail center):', JSON.stringify(centered))
  } else {
    console.log('5. rail not overflowing — center-on-click skipped')
  }

  console.log('errors:', errors.slice(0, 5))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
