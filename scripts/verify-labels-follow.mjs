// Verify the two 0.4.1 long-session fixes against the live dsh web GUI:
//  1. Capsule labels show TRUE turn numbers, strictly increasing across any
//     history/window boundary (no restart like 38 → 2).
//  2. The rail auto-scrolls its own viewport so the ACTIVE turn's capsule is
//     visible when a long (overflowing) session opens.
// Landing is direct: inject `dsh.sessions.current` + workspace-group expansion
// into localStorage and reload — no sidebar clicking (probes proved the
// virtualized `[class*="sessionRow"]` rows are not reliably clickable programmatically).
// Targets live in the `karoc` workspace (host path /home/karoc):
//   40-turn session-b8a7748a… (the reported bug case) and 79-turn session-55ce7b5e….
import { chromium } from 'playwright'
import { mintBrowserCookie } from './lib/auth-cookie.mjs'

const BASE = 'http://127.0.0.1:3080'
// karoc workspace id seen in the live dsh.workspace.view.v5 (verify at boot if stale).
const KAROC_WS = '4240ac5b-d74d-49f2-99ce-104757bd5b78'
const TARGETS = [
  { id: 'session-b8a7748a-bdb3-4349-b10b-c2499a5fae1d', fragment: '40-turn reported bug', minTurns: 38 },
  { id: 'session-55ce7b5e-6d87-49a1-acbd-da59d0f95cf9', fragment: '79-turn long session', minTurns: 70 },
]
const ONLY = process.argv[2] // optional target index or fragment substring

async function openSession(page, target, debug) {
  await page.evaluate(({ sid, ws }) => {
    localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: sid }))
    try {
      const v = JSON.parse(localStorage.getItem('dsh.workspace.view.v5') || '{}')
      v.groupExpansion = Object.assign(v.groupExpansion || {}, { [ws]: true })
      localStorage.setItem('dsh.workspace.view.v5', JSON.stringify(v))
    } catch { /* view key optional */ }
  }, { sid: target.id, ws: KAROC_WS })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  let last = -1
  let stable = 0
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000)
    const c = await page.evaluate(() => document.querySelectorAll('.tn-cap-btn').length)
    if (c === last) { stable += 1; if (stable >= 3) break } else { stable = 0; last = c }
  }
  if (debug) {
    const state = await page.evaluate(() => ({
      cur: localStorage.getItem('dsh.sessions.current'),
      rail: document.querySelector('.tn-rail') !== null,
      caps: document.querySelectorAll('.tn-cap-btn').length,
      bodyText: document.body.innerText.slice(0, 200),
    }))
    console.log('DEBUG:', JSON.stringify(state, null, 1))
  }
  return last
}

async function inspect(page) {
  await page.waitForTimeout(1500) // let follow effects settle
  return page.evaluate(() => {
    const rail = document.querySelector('.tn-rail')
    const btns = rail ? Array.from(rail.querySelectorAll('.tn-cap-btn')) : []
    const labels = btns.map((b) => {
      const m = /(\d+)/.exec(b.getAttribute('aria-label') || '')
      return m === null ? null : Number(m[1])
    })
    const railRect = rail ? rail.getBoundingClientRect() : null
    const within = (el, c) => {
      if (el === null || el === undefined || c === null) return false
      const r = el.getBoundingClientRect()
      return r.top >= c.top - 1 && r.bottom <= c.bottom + 1
    }
    const active = rail ? rail.querySelector('.tn-cap-active') : null
    const activeBtn = active === null ? null : active.closest('.tn-cap-btn')
    const drops = []
    for (let i = 1; i < labels.length; i += 1) {
      if (labels[i] !== null && labels[i - 1] !== null && labels[i] <= labels[i - 1]) {
        drops.push(`${labels[i - 1]} → ${labels[i]} at ${i}`)
      }
    }
    const overflow = rail ? rail.scrollHeight > rail.clientHeight + 2 : false
    return {
      count: btns.length,
      firstLabels: labels.slice(0, 5),
      lastLabels: labels.slice(-6),
      nullLabels: labels.filter((l) => l === null).length,
      drops,
      overflow,
      scrollTop: rail ? rail.scrollTop : null,
      clientHeight: rail ? rail.clientHeight : null,
      scrollHeight: rail ? rail.scrollHeight : null,
      activeLabel: activeBtn === null ? null : (activeBtn.getAttribute('aria-label') || '').slice(0, 30),
      activeVisible: within(activeBtn, railRect),
    }
  })
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 600 } })
  const cookie = mintBrowserCookie()
  await page.context().addCookies([{ name: cookie.name, value: cookie.value, domain: '127.0.0.1', path: '/' }])
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(7000)

  // Sanity: confirm the karoc workspace id still hosts the 40-turn target
  // (the id was observed in dsh.workspace.view.v5 at 2026-09-03).
  const hostWs = await page.evaluate((k) => {
    try {
      const v = JSON.parse(localStorage.getItem('dsh.workspace.view.v5') || '{}')
      const hit = Object.entries(v.sessionOrderByAccount || {}).find(([, ids]) => ids.includes(k))
      return hit === undefined || hit.length === 0 ? null : hit[0]
    } catch { return null }
  }, 'session-b8a7748a-bdb3-4349-b10b-c2499a5fae1d')
  console.log('karoc ws id ok:', hostWs === KAROC_WS, 'hostWs:', hostWs)

  const results = []
  for (const target of TARGETS) {
    if (ONLY !== undefined && !target.fragment.includes(ONLY) && target.fragment !== ONLY) continue
    const debug = ONLY !== undefined
    const capsules = await openSession(page, target, debug)
    const info = await inspect(page)
    const labelsOk = capsules >= target.minTurns && info.nullLabels === 0 && info.drops.length === 0
      && info.firstLabels[0] === 1
    const followOk = !info.overflow || (info.activeVisible && (info.scrollTop ?? 0) > 0)
    results.push({ ...target, capsules, labelsOk, followOk, ...info })
    await page.screenshot({ path: `${new URL('../.verify/', import.meta.url).pathname}turn-nav-verify-${target.id.slice(0, 8)}.png` })
  }
  const ok = results.length === TARGETS.length && results.every((r) => r.labelsOk && r.followOk)
  console.log(JSON.stringify({ ok, results }, null, 1))
  await page.screenshot({ path: `${new URL('../.verify/', import.meta.url).pathname}turn-nav-fix.png` })
  process.exitCode = ok ? 0 : 1
} finally {
  await browser.close()
}