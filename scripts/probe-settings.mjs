import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto(`http://127.0.0.1:3080/?token=${process.env.DSH_TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(6000)
// Dump candidate settings triggers: buttons/asides in the left sidebar area.
const hits = await page.evaluate(() => {
  const out = []
  const all = Array.from(document.querySelectorAll('button, [role="button"], aside, nav'))
  for (const el of all) {
    const t = (el.textContent || '').trim()
    const aria = el.getAttribute('aria-label') || ''
    if (/设置|Settings|齿轮/.test(t + aria) && t.length < 30) {
      out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), text: t.slice(0, 20), aria: aria.slice(0, 20) })
    }
  }
  return out.slice(0, 15)
})
console.log(JSON.stringify(hits, null, 1))
await browser.close()
