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
  await page.waitForTimeout(7000)
  // Before opening kanban: element at rail center
  const probe = async () => page.evaluate(() => {
    const wrap = document.querySelector('.tn-wrap')
    if (!wrap) return null
    const r = wrap.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const top = document.elementFromPoint(x, y)
    return {
      x: Math.round(x), y: Math.round(y),
      topEl: top ? `${top.tagName}.${(top.className||'').toString().slice(0,30)}` : null,
      hasTn: top ? !!top.closest('.tn-wrap') : false,
      hasKb: top ? !!top.closest('.kb-overlay') : false,
    }
  })
  const before = await probe()
  console.log('before kanban (rail center element):', JSON.stringify(before))
  // Open kanban
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => /看板|Kanban/.test(b.textContent || ''))
    if (btns[0]) btns[0].click()
  })
  await page.waitForTimeout(1500)
  const after = await probe()
  console.log('after kanban (rail center element):', JSON.stringify(after))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
