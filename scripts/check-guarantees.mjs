#!/usr/bin/env node
/**
 * Guarantee gate: every negative guarantee documented in `docs/guarantees.md`
 * must be pinned by an assertion label that exists in this repo's test scripts.
 *
 * This repo's test surface is thin by design (a client plugin whose behaviour is
 * mostly visual), so the pins are the labels asserted by
 * `scripts/test-client-dispose.mjs` — the one automated contract test. Rows for
 * promises that have NO automated pin are kept in the "未钉住" section of the
 * document instead of being dressed up as pinned.
 *
 * Rules enforced:
 *   1. `docs/guarantees.md` exists and carries rows `| <id> | <guarantee> | <selector> |`;
 *   2. every selector occurs in `scripts/test-*.mjs`;
 *   3. the table has at least MIN_ROWS rows (a gutted table fails).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const MIN_ROWS = 6

let guarantees
try {
  guarantees = readFileSync(join(root, 'docs/guarantees.md'), 'utf8')
} catch {
  console.error('❌ guarantee gate: docs/guarantees.md is missing — every negative guarantee needs a row')
  process.exit(1)
}

const sources = readdirSync(join(root, 'scripts'))
  .filter((name) => name.startsWith('test-') && name.endsWith('.mjs'))
  .map((name) => readFileSync(join(root, 'scripts', name), 'utf8'))
  .join('\n')

const rows = guarantees
  .split('\n')
  .filter((line) => /^\|\s*G\d+\s*\|/.test(line))
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .map((cells) => ({
    id: cells[1],
    guarantee: cells[2],
    selector: (cells[3] ?? '').replace(/^[`"']+|[`"']+$/g, '').trim(),
  }))

const failures = []
if (rows.length < MIN_ROWS) {
  failures.push(`only ${rows.length} guarantee rows (expected at least ${MIN_ROWS}) — do not gut this table`)
}
for (const row of rows) {
  if (!row.selector) {
    failures.push(`${row.id}: no selector`)
    continue
  }
  if (!sources.includes(row.selector)) {
    failures.push(`${row.id}: no assertion matches "${row.selector}" (guarantee: ${row.guarantee})`)
  }
}

if (failures.length > 0) {
  console.error('❌ guarantee gate FAILED — a documented guarantee is not pinned by an assertion:')
  for (const failure of failures) console.error(`   - ${failure}`)
  console.error('\n   Either add/adjust the assertion (preferred) or move the promise into the "未钉住" section.')
  process.exit(1)
}

console.log(`✅ guarantee gate passed: ${rows.length}/${rows.length} negative guarantees pinned by assertions.`)
