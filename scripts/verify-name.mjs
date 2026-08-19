import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:3080'
async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  const styleOk = await page.evaluate(() => {
    return document.querySelector('style[data-dsh-plugin-css="dsh-turn-navigator"]') !== null
  })
  console.log('style tag (new id):', styleOk)
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
    const target = rows.find((r) => (r.textContent || '').includes('插件-看板'))
    if (target) target.click()
  })
  await page.waitForTimeout(6000)
  const trigger = await page.evaluate(() => {
    const el = document.querySelector('.tn-trigger')
    return el ? { text: el.innerText, cls: el.className } : null
  })
  console.log('trigger:', JSON.stringify(trigger))
  await page.evaluate(() => { const el = document.querySelector('.tn-trigger'); if (el) el.click() })
  await page.waitForTimeout(800)
  const drawer = await page.evaluate(() => {
    const d = document.querySelector('.tn-drawer')
    return d ? { count: d.querySelector('.tn-header-count')?.textContent } : null
  })
  console.log('drawer count:', JSON.stringify(drawer))
  console.log('errors:', errors.slice(0, 3))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
