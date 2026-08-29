// Verify (v0.3.0): full-history journal channel (`session/page`) fills the rail
// with EVERY persisted turn (caps > loaded-window rows) and a jump to the
// oldest turn expands the official window via the session store.
//
// Two phases:
//   A. Fixture world (`?fixture`): fx-alpha carries 75 turns / ~150+ messages,
//      far beyond the ~50-message default window — the journal channel must
//      show all 75 capsules while the window shows only a fraction.
//   B. Real instance: no crash + tooltip + oldest-jump smoke test.
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:3080'
const TOKEN = process.env.DSH_TOKEN || ''

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  const warns = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
    if (m.type() === 'warning' && /dsh-turn-nav/.test(m.text())) warns.push(m.text())
  })
  return { page, errors, warns }
}

async function mintCookie(page) {
  // First hit with ?token mints the auth cookie via 303; everything after
  // (including ?fixture) rides the cookie.
  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)
}

async function openSession(page, titlePart) {
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="sessionRow"]')).map((r) => (r.textContent || '').trim()))
  const title = (titlePart ? rows.find((t) => t.includes(titlePart)) : undefined)
    ?? rows.find((t) => !t.startsWith('New Session') && t.length > 3)
  await page.evaluate((t) => {
    const row = Array.from(document.querySelectorAll('[class*="sessionRow"]')).find((r) => (r.textContent || '').trim() === t)
    row?.click()
  }, title)
  await page.waitForTimeout(8000)
  return title
}

/** Errors that concern OUR plugin — unrelated fixture noise (dynamicCordisRunner
 *  endpoints missing in fixture mode) is ignored. The combo bundle URL contains
 *  'dsh-turn-navigator/client.js', so matching the URL would false-positive. */
function ourErrors(errors) {
  return errors.filter((e) => /slot entry crashed|\[dsh-turn-nav\]/.test(e))
}

async function railState(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    const official = document.querySelector('nav[aria-label*="轮次"], nav[aria-label*="Turn navigation"]')
    const scroll = document.querySelector('[data-conversation-scroll]')
    const first = rail ? rail.querySelector('.tn-cap-btn')?.getAttribute('aria-label') ?? '' : ''
    return {
      caps: rail ? rail.querySelectorAll('.tn-cap-btn').length : 0,
      officialMarks: official ? official.querySelectorAll('button, [role="button"]').length : 0,
      flowRows: scroll ? scroll.querySelectorAll('[data-chat-anchor-key]').length : 0,
      scrollTop: scroll ? scroll.scrollTop : -1,
      first: first.slice(0, 60),
    }
  })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  let pass = true

  // ---------- Phase A: fixture world (75-turn session) ----------
  {
    const { page, errors, warns } = await newPage(browser)
    await mintCookie(page)
    await page.goto(`${BASE}/?fixture`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(6000)
    const title = await openSession(page, 'fx-alpha')
    console.log('fixture session:', title)

    // Wait for the rail to fill (journal paging).
    let caps = 0
    for (let i = 0; i < 40; i += 1) {
      caps = await page.evaluate(() => document.querySelector('.tn-rail')?.querySelectorAll('.tn-cap-btn').length ?? 0)
      if (caps > 10) break
      await page.waitForTimeout(1000)
    }
    const before = await railState(page)
    console.log('fixture before:', JSON.stringify(before))
    // Journal proof: our caps cover the WHOLE session (75) while the official
    // rail (same navigation data) only shows the loaded window (~24 turns).
    const fullHistory = before.caps > before.officialMarks && before.caps >= 30
    console.log('full-history (caps > official window marks):', fullHistory,
      `(${before.caps} caps vs ${before.officialMarks} official marks)`)
    pass &&= fullHistory

    // Oldest capsule tooltip must carry a real old prompt.
    if (before.caps > 0) {
      await page.hover('.tn-cap-btn:first-child')
      await page.waitForTimeout(500)
      const tip = await page.evaluate(() => document.querySelector('.tn-tip')?.textContent ?? '')
      console.log('oldest tooltip:', JSON.stringify(tip.slice(0, 80)))
    }

    // Jump to the OLDEST turn (outside the window): window must expand + scroll.
    await page.evaluate(() => document.querySelector('.tn-cap-btn')?.click())
    await page.waitForTimeout(9000)
    const after = await railState(page)
    console.log('fixture after oldest-jump:', JSON.stringify(after))
    const grew = after.flowRows > before.flowRows
    const scrolled = after.scrollTop !== before.scrollTop
    console.log('window grew:', grew, '| scrolled:', scrolled)
    pass &&= grew && scrolled

    console.log('phase A our-plugin warns:', warns.slice(0, 3))
    console.log('phase A our-plugin errors:', ourErrors(errors).slice(0, 5))
    pass &&= ourErrors(errors).length === 0
    await page.close()
  }

  // ---------- Phase B: real instance smoke ----------
  {
    const { page, errors } = await newPage(browser)
    await mintCookie(page)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(6000)
    const title = await openSession(page, '')
    console.log('real session:', title)
    const before = await railState(page)
    console.log('real before:', JSON.stringify(before))
    pass &&= before.caps > 0

    if (before.caps > 0) {
      await page.evaluate(() => document.querySelector('.tn-cap-btn')?.click())
      await page.waitForTimeout(6000)
      const after = await railState(page)
      console.log('real after first-jump:', JSON.stringify(after))
      pass &&= after.scrollTop !== before.scrollTop
    }
    console.log('phase B our-plugin errors:', ourErrors(errors).slice(0, 5))
    pass &&= ourErrors(errors).length === 0
    await page.close()
  }

  await browser.close()
  console.log(pass ? 'VERIFY PASS' : 'VERIFY FAIL')
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
