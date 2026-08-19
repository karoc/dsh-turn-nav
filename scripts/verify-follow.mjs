// Test scroll-follow: current turn highlight in the drawer.
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

  // Open drawer
  await page.evaluate(() => {
    const el = document.querySelector('.tn-trigger')
    if (el) el.click()
  })
  await page.waitForTimeout(500)

  // Scroll the conversation to the bottom (last turns)
  await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    scroll.scrollTop = scroll.scrollHeight
  })
  await page.waitForTimeout(800)

  // Check which drawer item is highlighted (current)
  const currentAtBottom = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.tn-item'))
    const current = items.findIndex((i) => i.classList.contains('tn-item-current'))
    return { currentIndex: current, total: items.length, currentText: current >= 0 ? items[current].innerText.replace(/\n/g, ' | ').slice(0, 60) : null }
  })
  console.log('at bottom, current turn:', JSON.stringify(currentAtBottom))

  // Scroll back to top (first turns)
  await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    scroll.scrollTop = 0
  })
  await page.waitForTimeout(800)

  const currentAtTop = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.tn-item'))
    const current = items.findIndex((i) => i.classList.contains('tn-item-current'))
    return { currentIndex: current, total: items.length, currentText: current >= 0 ? items[current].innerText.replace(/\n/g, ' | ').slice(0, 60) : null }
  })
  console.log('at top, current turn:', JSON.stringify(currentAtTop))

  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
