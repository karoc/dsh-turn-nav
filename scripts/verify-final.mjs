import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:3080'
async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'))
    const target = rows.find((r) => (r.textContent || '').includes('插件-看板'))
    if (target) target.click()
  })
  await page.waitForTimeout(6000)

  // Open drawer
  await page.evaluate(() => {
    const el = document.querySelector('.tn-trigger')
    if (el) el.click()
  })
  await page.waitForTimeout(500)

  // Record before state
  const before = await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    return { scrollTop: scroll.scrollTop }
  })
  console.log('before scrollTop:', before.scrollTop)

  // Click turn #2 (has user summary)
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.tn-item'))
    const target = items[1]
    if (target) target.click()
  })
  await page.waitForTimeout(1200)
  const after = await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    const hl = document.querySelectorAll('.tn-jump-highlight').length
    return { scrollTop: scroll.scrollTop, highlight: hl }
  })
  console.log('after jump scrollTop:', after.scrollTop, 'highlight:', after.highlight)

  // Verify highlight gone after animation
  await page.waitForTimeout(1800)
  const hlAfter = await page.evaluate(() => document.querySelectorAll('.tn-jump-highlight').length)
  console.log('highlight after 1.8s:', hlAfter)

  // Scroll-follow: scroll to bottom
  await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    scroll.scrollTop = scroll.scrollHeight
  })
  await page.waitForTimeout(800)
  const atBottom = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.tn-item'))
    const idx = items.findIndex((i) => i.classList.contains('tn-item-current'))
    return { current: idx, text: idx >= 0 ? items[idx].innerText.replace(/\n/g,' | ').slice(0,50) : null }
  })
  console.log('at bottom current turn:', JSON.stringify(atBottom))

  // Scroll-follow: scroll to top
  await page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    scroll.scrollTop = 0
  })
  await page.waitForTimeout(800)
  const atTop = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.tn-item'))
    const idx = items.findIndex((i) => i.classList.contains('tn-item-current'))
    return { current: idx, text: idx >= 0 ? items[idx].innerText.replace(/\n/g,' | ').slice(0,50) : null }
  })
  console.log('at top current turn:', JSON.stringify(atTop))

  console.log('errors:', errors.slice(0, 3))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
