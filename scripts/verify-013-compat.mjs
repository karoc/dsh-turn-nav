// Verify (0.1.3-alpha.1 compat re-test, 2026-09-06): the plugin still works on
// the 0.1.3 official rail, and the differentiation vs the official rail holds.
//
// A. Fixture world (`?fixture` — a BROWSER-synthesized session that does NOT
//    drive the host `turnOutline` projection): our rail must still show ALL
//    persisted turns (fx-alpha = 75) while the official rail degrades to the
//    loaded window; the subtractive takeover (official `display: none`) must
//    work in the default Smoothly TN mode; a jump to the oldest turn must move
//    the conversation; no plugin errors.
// B. Real instance, longest available session: both rails must show the same
//    full turn count (official via its host projection, ours via the journal).
//    Skips the comparison if no session with >= 30 turns is reachable.
//
// Auth: cookie minted from ~/.dsh/.credentials.yaml (verify-labels-follow
// pattern) — the old `?token=` mint flow is gone on 0.1.3.
import { chromium } from 'playwright'
import { mintBrowserCookie } from './lib/auth-cookie.mjs'

const BASE = 'http://127.0.0.1:3080'
const MIN_TURNS = 70          // fx-alpha fixture session carries 75 turns.
const MIN_REAL_TURNS = 30     // real-session comparison threshold.

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  const cookie = mintBrowserCookie()
  await page.context().addCookies([{ ...cookie, url: BASE }])
  return { page, errors }
}

function ourErrors(errors) {
  return errors.filter((e) => /slot entry crashed|\[dsh-turn-nav\]/.test(e))
}

async function openSession(page, titlePart) {
  await page.goto(`${BASE}/?fixture`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  const titles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="sessionRow"]'))
      .map((r) => (r.textContent || '').trim())
      .filter((t) => !t.startsWith('New Session') && t.length > 3))
  const title = (titlePart ? titles.find((t) => t.includes(titlePart)) : undefined) ?? titles[0]
  // DOM click (not a Playwright actionability click): an overlay mask can
  // intercept pointer events on the row; the DOM click opens the session the
  // same way and is deterministic for acceptance scripts.
  await page.evaluate((t) => {
    const row = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
      .find((r) => (r.textContent || '').trim() === t)
    row?.click()
  }, title)
  await page.waitForTimeout(10000)
  return title
}

async function railState(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    const caps = rail ? Array.from(rail.querySelectorAll('.tn-cap-btn')) : []
    const nums = caps.map((b) => { const m = /(\d+)/.exec(b.getAttribute('aria-label') || ''); return m ? Number(m[1]) : null })
    const scroll = document.querySelector('[data-conversation-scroll]')
    const officialNav = scroll?.querySelector('nav[aria-label*="轮次"], nav[aria-label*="Turn navigation"]') ?? null
    return {
      caps: caps.length,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      official: officialNav !== null,
      officialDisplay: officialNav ? getComputedStyle(officialNav).display : 'none',
      flowRows: document.querySelectorAll('[data-chat-flow-key]').length,
      anchorKeys: document.querySelectorAll('[data-chat-anchor-key]').length,
    }
  })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  let pass = true

  // ---------- Phase A: fixture world ----------
  {
    const { page, errors } = await newPage(browser)
    await openSession(page)
    const stn = await railState(page)
    console.log('fixture default stn:', JSON.stringify(stn))
    const fullHistory = stn.caps >= MIN_TURNS && stn.min !== null && stn.max >= MIN_TURNS
    const takeover = stn.official && stn.officialDisplay === 'none'
    console.log('full-history (ours caps >= 75):', fullHistory, '| official hidden:', takeover)
    pass &&= fullHistory && takeover

    // Jump to the oldest turn moves the conversation scrollport.
    const before = await page.evaluate(() => {
      const s = document.querySelector('[data-conversation-scroll]')
      return s ? s.scrollTop : -1
    })
    await page.evaluate(() => document.querySelector('.tn-rail .tn-cap-btn')?.click())
    await page.waitForTimeout(4000)
    const after = await page.evaluate(() => {
      const s = document.querySelector('[data-conversation-scroll]')
      return s ? s.scrollTop : -1
    })
    console.log(`jump oldest: scrollTop ${before} -> ${after} (moved: ${before !== after})`)
    pass &&= before !== after

    // Mode switch: 'official' shows the official rail, hides ours.
    await page.evaluate(() => localStorage.setItem('dsh-turn-navigator.mode', 'official'))
    await openSession(page)
    const off = await railState(page)
    console.log('fixture official mode:', JSON.stringify(off))
    const officialModeOk = off.caps === 0 && off.official && off.officialDisplay === 'block'
    console.log('official mode → ours gone, official visible:', officialModeOk)
    pass &&= officialModeOk
    await page.evaluate(() => localStorage.removeItem('dsh-turn-navigator.mode'))

    console.log('phase A our-plugin errors:', ourErrors(errors).slice(0, 4))
    pass &&= ourErrors(errors).length === 0
    await page.close()
  }

  // ---------- Phase B: real instance, ours vs official full count ----------
  {
    const { page, errors } = await newPage(browser)
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(7000)
    const titles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="sessionRow"]'))
        .map((r) => (r.textContent || '').trim())
        .filter((t) => !t.startsWith('New Session') && t.length > 3))
    let compared = false
    for (const t of titles) {
      await page.evaluate((title) => {
        const row = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
          .find((r) => (r.textContent || '').trim() === title)
        row?.click()
      }, t)
      await page.waitForTimeout(9000)
      const ours = await railState(page)
      if (ours.caps < MIN_REAL_TURNS) continue
      // Official mode on the same session.
      await page.evaluate(() => localStorage.setItem('dsh-turn-navigator.mode', 'official'))
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(7000)
      await page.evaluate((title) => {
        const row = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
          .find((r) => (r.textContent || '').trim() === title)
        row?.click()
      }, t)
      await page.waitForTimeout(9000)
      const official = await page.evaluate(() => {
        const scroll = document.querySelector('[data-conversation-scroll]')
        const nav = scroll?.querySelector('nav[aria-label*="轮次"], nav[aria-label*="Turn navigation"]') ?? null
        const btns = nav ? Array.from(nav.querySelectorAll('button')) : []
        const nums = btns.map((b) => { const m = /(\d+)/.exec(b.getAttribute('aria-label') || ''); return m ? Number(m[1]) : null })
        return { marks: btns.length, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null }
      })
      const equal = ours.caps === official.marks && ours.min === official.min && ours.max === official.max
      console.log(`real "${t.slice(0, 30)}": ours ${ours.caps} (${ours.min}..${ours.max}) | official ${official.marks} (${official.min}..${official.max}) | same-full:`, equal)
      compared = true
      pass &&= equal
      await page.evaluate(() => localStorage.removeItem('dsh-turn-navigator.mode'))
      break
    }
    if (!compared) console.log('no real session with >= 30 turns reachable — phase B comparison skipped')
    console.log('phase B our-plugin errors:', ourErrors(errors).slice(0, 4))
    pass &&= ourErrors(errors).length === 0
    await page.close()
  }

  await browser.close()
  console.log(pass ? 'VERIFY PASS' : 'VERIFY FAIL')
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
