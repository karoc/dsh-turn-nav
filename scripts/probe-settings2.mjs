import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto(`http://127.0.0.1:3080/?token=${process.env.DSH_TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(6000)
// Click the Settings trigger, then dump the panel: sections + rows text.
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Settings')
  btn?.click()
})
await page.waitForTimeout(3000)
const dump = await page.evaluate(() => {
  const panel = document.body.innerText
  const start = panel.indexOf('Settings')
  const rows = Array.from(document.querySelectorAll('[class*="item"], [class*="row"]')).map((r) => (r.textContent || '').trim().slice(0, 60)).filter((t) => t.length > 2)
  return { panelSample: panel.slice(start, start + 300), rows: rows.slice(0, 25) }
})
console.log(JSON.stringify(dump, null, 1))
await browser.close()
