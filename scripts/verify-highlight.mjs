// Test the jump-highlight flash timing.
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:3080'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
    const target = rows.find((r) => (r.textContent || '').includes('我想实现一个效果'))
    if (target) target.click()
  })
  await page.waitForTimeout(5000)

  await page.evaluate(() => {
    const el = document.querySelector('.tn-trigger')
    if (el) el.click()
  })
  await page.waitForTimeout(500)

  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.tn-item'))
    const target = items[1]
    if (target) target.click()
  })

  await page.waitForTimeout(100)
  const hl = await page.evaluate(() => document.querySelectorAll('.tn-jump-highlight').length)
  console.log('highlight immediately after click:', hl)

  await page.waitForTimeout(200)
  const hl2 = await page.evaluate(() => document.querySelectorAll('.tn-jump-highlight').length)
  console.log('highlight at 300ms:', hl2)

  await page.waitForTimeout(1500)
  const hl3 = await page.evaluate(() => document.querySelectorAll('.tn-jump-highlight').length)
  console.log('highlight at ~1800ms (should be 0):', hl3)

  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
