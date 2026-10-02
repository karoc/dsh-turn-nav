#!/usr/bin/env node
/**
 * Live-GUI gate for the rail's turn labels.
 *
 * Why: the `(no user message)` defect only appeared on real sessions (a
 * machine-woken turn — goal continuation, plugin waking, subagent settlement —
 * sitting inside the loaded window, or its injected payload being folded into
 * the label). Unit tests pin the rules; this gate proves the RUNNING bundle in
 * the real GUI obeys them on real data.
 *
 * It asserts, over every session reachable in the sidebar:
 *   1. no capsule tooltip line is the fabricated placeholder `(no user message)`
 *      / `（无用户消息）`;
 *   2. no capsule tooltip line is an UNBOUNDED injected payload (`<goal_round>`,
 *      `Current runtime context`, `… sent a message`, `Background subagent …`) —
 *      bounded host response previews may quote such text as content;
 *   3. every capsule tooltip leads with its turn label, so an unlabelled turn
 *      still reads `Turn N` (counted in the report);
 *   4. the bundle the GUI actually SERVES carries no placeholder string — a
 *      stale build must not be able to pass this gate.
 *
 * Pre-fix evidence (same checks, same machine, 2026-09-30): session
 * `session-f98a008f` capsule 3 read `Turn 3 — 12:45 — (no user message)`, and
 * `session-185e864e` had 12/24 capsules whose body was the raw
 * `<goal_round> Objective: …` payload — this gate was red on both counts.
 *
 * Usage: node scripts/verify-turn-labels.mjs [--limit N] [--shot <path>]
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at < 0 ? fallback : args[at + 1]
}
const limit = Number(option('limit', '40'))
const shot = option('shot', undefined)

const PLACEHOLDERS = ['(no user message)', '（无用户消息）']
const INJECTED_PAYLOAD = /<goal_round>|<goal_blocked>|Current runtime context|sent a message|Background subagent|Updated instructions from/
/**
 * Tooltips now carry TWO content lines (prompt + host response preview), and a
 * response is assistant-authored text that may legitimately quote any of the
 * payload markers above — so the marker check applies only to lines that are
 * UNBOUNDED. The old journal leak surfaced the raw injected message (hundreds of
 * chars); the host's response preview is capped at 120 chars, so a marker inside
 * a bounded preview is content, not a leaked label.
 */
const LEAKED_PAYLOAD_MIN_CHARS = 200

let chromium
try {
  ({ chromium } = await import('/home/karoc/node_modules/playwright/index.mjs'))
} catch (error) {
  console.error(`❌ this gate needs Playwright at /home/karoc/node_modules/playwright — ${String(error).slice(0, 120)}`)
  process.exit(1)
}

let url
try {
  url = execFileSync(`${process.env.HOME}/.local/bin/dsh-web-url`, { encoding: 'utf8' }).trim()
} catch (error) {
  console.error(`❌ no live dsh web URL (~/.local/bin/dsh-web-url): ${String(error).slice(0, 120)}`)
  process.exit(1)
}

/** Tooltip body of a capsule label (`Turn N[ — HH:MM] — body`; the body may contain ' — '). */
function bodyOf(label) {
  const parts = label.split(' — ')
  const offset = /^\d{2}:\d{2}$/.test(parts[1] ?? '') ? 2 : 1
  return parts.slice(offset).join(' — ')
}

const browser = await chromium.launch()
const failures = []
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)

  // ── 4. the SERVED bundle must be the fixed one ───────────────────────────
  // Plugin bundles arrive batched (`/plugins/??a/client.js,b/client.js,…`), so
  // the URL filter is a substring test, not an extension test.
  const bundles = []
  page.on('response', async (response) => {
    const responseUrl = response.url()
    if (!responseUrl.includes('.js')) return
    try {
      const text = await response.text()
      if (text.includes('tn-cap-btn')) bundles.push({ url: responseUrl, text })
    } catch { /* stream already consumed */ }
  })

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  console.log(`sidebar: ${(await page.evaluate(() => document.querySelectorAll('[data-row-key^="workspace:"]').length))} workspace row(s)`)

  // Expand workspaces, preserving any already-expanded one (a blind click
  // would collapse it and hide exactly the sessions we need).
  const workspaceNames = await page.evaluate(() => [...document.querySelectorAll('[data-row-key^="workspace:"]')]
    .map((row) => ({ name: (row.textContent ?? '').trim().split(/\s+/)[0], expanded: row.getAttribute('aria-expanded') === 'true' })))
  for (const workspace of workspaceNames) {
    if (workspace.expanded) continue
    await page.evaluate((name) => {
      const row = [...document.querySelectorAll('[data-row-key^="workspace:"]')].find(r => (r.textContent ?? '').trim().startsWith(name))
      row?.click()
    }, workspace.name)
    await page.waitForTimeout(900)
  }

  const sessionKeys = await page.evaluate(() => [...document.querySelectorAll('[data-row-key^="session:"]')]
    .map((row) => ({ key: row.getAttribute('data-row-key'), title: (row.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) })))
  console.log(`sidebar: ${sessionKeys.length} session row(s)`)

  let checked = 0
  let labelledFallback = 0
  for (const session of sessionKeys.slice(0, limit)) {
    const sessionId = session.key.replace('session:', '')
    const clicked = await page.evaluate((key) => {
      const row = [...document.querySelectorAll('[data-row-key^="session:"]')].find(r => r.getAttribute('data-row-key') === key)
      if (row === undefined) return false
      row.click()
      return true
    }, session.key)
    if (!clicked) continue
    await page.waitForTimeout(1500)

    let labels = []
    for (let attempt = 0; attempt < 24; attempt++) {
      labels = await page.evaluate(() => [...document.querySelectorAll('.tn-cap-btn')].map(b => b.getAttribute('aria-label') ?? ''))
      if (labels.length > 0) break
      await page.waitForTimeout(500)
    }
    // Let the incremental history pages land before judging the list.
    await page.waitForTimeout(2500)
    labels = await page.evaluate(() => [...document.querySelectorAll('.tn-cap-btn')].map(b => b.getAttribute('aria-label') ?? ''))
    checked += labels.length

    for (const label of labels) {
      const body = bodyOf(label).trim()
      const turn = label.split(' — ')[0]
      // `bodyOf` joins the content lines back with ' — ', so each line is
      // inspected separately.
      const lines = body.split(' — ').map((line) => line.trim())
      if (lines.some((line) => PLACEHOLDERS.includes(line))) {
        failures.push(`${sessionId} ${turn}: capsule tooltip line is the fabricated placeholder`)
        continue
      }
      if (!/^(Turn|第)\s*\d+/.test(label)) {
        failures.push(`${sessionId}: capsule tooltip does not lead with its turn label: "${label.slice(0, 60)}"`)
        continue
      }
      const leaked = lines.find((line) => INJECTED_PAYLOAD.test(line) && line.length >= LEAKED_PAYLOAD_MIN_CHARS)
      if (leaked !== undefined) {
        failures.push(`${sessionId} ${turn}: capsule tooltip leaks an injected payload: "${leaked.slice(0, 80)}…"`)
        continue
      }
      if (lines.length === 1) labelledFallback += 1
    }
  }

  if (bundles.length === 0) {
    failures.push('no client bundle containing the rail was served — cannot prove the running build is the fixed one')
  } else {
    for (const bundle of bundles) {
      if (PLACEHOLDERS.some((placeholder) => bundle.text.includes(placeholder))) {
        failures.push(`the SERVED bundle still carries a placeholder string: ${bundle.url}`)
      }
    }
  }

  if (shot !== undefined) await page.screenshot({ path: join(root, shot) })
  console.log(`checked ${sessionKeys.length} session row(s), ${checked} capsule tooltip(s); ${labelledFallback} unlabelled turn(s) fell back to the localized turn label`)
  console.log(`served rail bundle(s): ${bundles.map((bundle) => bundle.url.split('/').slice(-2).join('/')).join(', ') || 'none'}`)
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.error('❌ turn-label gate FAILED:')
  for (const failure of failures) console.error(`   - ${failure}`)
  process.exit(1)
}
console.log('✅ turn-label gate passed: no fabricated placeholder, no injected payload in any capsule tooltip, served bundle is the fixed one.')
