// Inspect turn #1's first node to understand the "(no user message)" case.
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

  // The first row in the conversation
  const firstRows = await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    const rows = Array.from(scroll.querySelectorAll('[data-chat-anchor-key]'))
    return rows.slice(0, 12).map((r) => {
      const key = r.getAttribute('data-chat-anchor-key')
      return {
        key,
        tag: r.tagName,
        cls: String(r.className).slice(0, 50),
        text: (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      }
    })
  })
  console.log('first 12 rows:', JSON.stringify(firstRows, null, 1))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
