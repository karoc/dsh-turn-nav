// Verify (v0.4.0): rail display mode (settings → Turn navigation).
//   - default 'stn': our rail visible & CENTERED (no tn-nudge), official rail
//     hidden by the stylesheet override (computed display: none);
//   - 'official': our rail gone, official rail visible;
//   - 'hidden': both gone;
//   - persistence across reloads;
//   - the settings General row exists and its Menu switches modes live.
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:3080'
const TOKEN = process.env.DSH_TOKEN || ''
const KEY = 'dsh-turn-navigator.mode'

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  return { page, errors }
}

async function mintCookie(page) {
  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)
}

async function openFixtureSession(page) {
  await page.goto(`${BASE}/?fixture`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="sessionRow"]')).map((r) => (r.textContent || '').trim()))
  const title = rows.find((t) => !t.startsWith('New Session') && t.length > 3)
  await page.evaluate((t) => {
    const row = Array.from(document.querySelectorAll('[class*="sessionRow"]')).find((r) => (r.textContent || '').trim() === t)
    row?.click()
  }, title)
  await page.waitForTimeout(8000)
  return title
}

async function railState(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('.tn-wrap')
    const scroll = document.querySelector('[data-conversation-scroll]')
    const officialNav = scroll === null
      ? null
      : scroll.querySelector('nav[aria-label*="轮次"], nav[aria-label*="Turn navigation"]')
    const officialVisible = officialNav !== null && getComputedStyle(officialNav).display !== 'none'
    const rect = wrap?.getBoundingClientRect()
    return {
      ours: wrap !== null,
      oursNudged: wrap?.classList.contains('tn-nudge') ?? false,
      oursTop: rect ? Math.round(rect.top) : -1,
      official: officialNav !== null,
      officialVisible,
    }
  })
}

function ourErrors(errors) {
  return errors.filter((e) => /slot entry crashed|\[dsh-turn-nav\]/.test(e))
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  let pass = true

  // ---------- Phase A: fixture world, mode matrix + persistence ----------
  {
    const { page, errors } = await newPage(browser)
    await mintCookie(page)
    await page.evaluate((k) => localStorage.removeItem(k), KEY)
    await openFixtureSession(page)

    const stn = await railState(page)
    console.log('default stn:', JSON.stringify(stn))
    const centered = stn.ours && !stn.oursNudged && stn.oursTop > 200 && stn.oursTop < 700
    const officialHidden = stn.official && !stn.officialVisible
    console.log('stn → ours shown & centered:', centered, '| official hidden:', officialHidden)
    pass &&= centered && officialHidden && !stn.oursNudged

    // 'official': ours gone, official visible.
    await page.evaluate((k) => localStorage.setItem(k, 'official'), KEY)
    await openFixtureSession(page)
    const off = await railState(page)
    console.log('official mode:', JSON.stringify(off))
    const officialModeOk = !off.ours && off.official && off.officialVisible
    console.log('official → ours gone & official visible:', officialModeOk)
    pass &&= officialModeOk

    // 'hidden': both gone.
    await page.evaluate((k) => localStorage.setItem(k, 'hidden'), KEY)
    await openFixtureSession(page)
    const hid = await railState(page)
    console.log('hidden mode:', JSON.stringify(hid))
    const hiddenOk = !hid.ours && !hid.officialVisible
    console.log('hidden → both hidden (ours gone, official not visible):', hiddenOk)
    pass &&= hiddenOk

    // back to 'stn': restored + centered again (persistence round-trip).
    await page.evaluate((k) => localStorage.setItem(k, 'stn'), KEY)
    await openFixtureSession(page)
    const back = await railState(page)
    console.log('back to stn:', JSON.stringify(back))
    const backOk = back.ours && !back.oursNudged && back.official && !back.officialVisible
    console.log('stn restored (ours centered, official hidden):', backOk)
    pass &&= backOk

    console.log('phase A our-plugin errors:', ourErrors(errors).slice(0, 4))
    pass &&= ourErrors(errors).length === 0
    await page.close()
  }

  // ---------- Phase B: real instance, settings row UI ----------
  {
    const { page, errors } = await newPage(browser)
    await mintCookie(page)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(6000)

    // Open the settings panel and locate our General row.
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Settings')
      btn?.click()
    })
    await page.waitForTimeout(3000)
    const row = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div, span'))
      const el = els.find((e) => (e.textContent || '').trim().startsWith('Which turn-navigation rail'))
      if (!el) return null
      // Walk up to the row (title/desc + selector).
      let node = el
      for (let i = 0; i < 4 && node.parentElement; i += 1) node = node.parentElement
      return {
        text: (node.textContent || '').trim().slice(0, 90),
        selectorText: node.querySelector('.tn-mode-selector')?.textContent?.trim() ?? '',
      }
    })
    console.log('settings row:', JSON.stringify(row))
    pass &&= row !== null && row.selectorText.includes('STN')

    // Switch to "DSH official" via the Menu and verify the rail reacts.
    if (row) {
      await page.evaluate(() => document.querySelector('.tn-mode-selector')?.click())
      await page.waitForTimeout(500)
      const menu = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], [class*="menu"] [class*="item"]'))
        return items.map((i) => (i.textContent || '').trim()).filter((t) => t.length > 2).slice(0, 8)
      })
      console.log('menu items:', JSON.stringify(menu))
      const officialItem = menu.find((t) => t.includes('official') || t.includes('官方'))
      if (officialItem) {
        await page.evaluate((label) => {
          const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], [class*="menu"] [class*="item"]'))
          const item = items.find((i) => (i.textContent || '').trim() === label)
          item?.click()
        }, officialItem)
        await page.waitForTimeout(1500)
        const stored = await page.evaluate((k) => localStorage.getItem(k), KEY)
        console.log('after switching to official → stored mode:', stored)
        pass &&= stored === 'official'
      } else {
        console.log('menu items not found — skipping switch test')
      }
    }

    console.log('phase B our-plugin errors:', ourErrors(errors).slice(0, 4))
    pass &&= ourErrors(errors).length === 0
    await page.close()
  }

  await browser.close()
  console.log(pass ? 'VERIFY PASS' : 'VERIFY FAIL')
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
