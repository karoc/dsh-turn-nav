// Debug: after clicking the first capsule, is the window fully loaded (no more
// "Load earlier")? Does the target row render at the true earliest position?
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:3080'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
    const target = rows.find((r) => { const t = (r.textContent || '').trim(); return !t.startsWith('New Session') && t.length > 3 })
    if (target) target.click()
  })
  await page.waitForTimeout(8000)
  for (let i = 0; i < 20; i++) {
    const c = await page.evaluate(() => { const r = document.querySelector('.tn-rail'); return r ? r.querySelectorAll('.tn-cap-btn').length : 0 })
    if (c > 0) break
    await page.waitForTimeout(1000)
  }

  // First capsule's aria-label (turn number + summary) and the window's first rows.
  const before = await page.evaluate(() => {
    const btns = document.querySelectorAll('.tn-cap-btn')
    const first = btns[0] ? btns[0].getAttribute('aria-label') : null
    const last = btns[btns.length - 1] ? btns[btns.length - 1].getAttribute('aria-label') : null
    const scroll = document.querySelector('[data-conversation-scroll]')
    const flowKeys = scroll ? Array.from(scroll.querySelectorAll('[data-chat-anchor-key]')).map((r) => r.getAttribute('data-chat-anchor-key')) : []
    const loadBtns = scroll ? Array.from(scroll.querySelectorAll('button')).filter((b) => /加载|Load/i.test(b.textContent || '')).length : 0
    return { firstCap: first, lastCap: last, capCount: btns.length, firstFlowKeys: flowKeys.slice(0, 5), loadBtns }
  })
  console.log('before click:', JSON.stringify(before, null, 1))

  // Click the first capsule and wait for jump feedback to clear (or timeout).
  await page.evaluate(() => { const btns = document.querySelectorAll('.tn-cap-btn'); if (btns[0]) btns[0].click() })
  let cleared = false
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000)
    const fb = await page.evaluate(() => document.querySelector('.tn-jump-feedback') !== null)
    if (!fb) { cleared = true; break }
  }
  console.log('feedback cleared:', cleared)

  const after = await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    const flowKeys = scroll ? Array.from(scroll.querySelectorAll('[data-chat-anchor-key]')).map((r) => r.getAttribute('data-chat-anchor-key')) : []
    const loadBtns = scroll ? Array.from(scroll.querySelectorAll('button')).filter((b) => /加载|Load/i.test(b.textContent || '')).map((b) => ({ text: (b.textContent || '').slice(0, 20), disabled: b.disabled })) : []
    return {
      scrollTop: scroll ? scroll.scrollTop : null,
      flowRows: flowKeys.length,
      firstFlowKeys: flowKeys.slice(0, 6),
      loadBtns,
    }
  })
  console.log('after jump:', JSON.stringify(after, null, 1))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
