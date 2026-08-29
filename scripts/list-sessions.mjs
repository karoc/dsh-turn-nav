// List session titles (diagnostic helper).
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto(`http://127.0.0.1:3080/?token=${process.env.DSH_TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(6000)
const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow"]')).map((r) => (r.textContent || '').trim().slice(0, 60)))
console.log(JSON.stringify(rows, null, 1))
await browser.close()
