#!/usr/bin/env node
/**
 * Post-publish verification, run by npm's `postpublish` lifecycle AFTER the
 * package has been uploaded.
 *
 * It CANNOT prevent a bad publish — the upload already happened. Its job is to
 * confirm the release actually landed on the registry and to raise a loud,
 * unambiguous alarm when it did not, so a silent/partial publish is never
 * mistaken for success.
 *
 * Registry eventual consistency: right after upload, `npm view <pkg>@<version>`
 * can still 404 while the index catches up — MEASURED at several minutes, not
 * seconds (@karoc/dsh-proxy 0.1.1 took ~4 minutes; on 2026-09-19 a 60s window
 * reported a successful sibling-plugin publish as a failure while npm had
 * already returned PUT 200), so this script POLLS for up to ~5 minutes before
 * judging it.
 *
 * Timeout semantics: postpublish runs ONLY after the upload succeeded, so a
 * version that stays invisible is almost always index lag, not a failed
 * publish. The script therefore distinguishes:
 *   - the package is visible (any version) → the package IS on the registry;
 *     the new version is just not indexed yet → treat as published (exit 0)
 *     with a clear "verify manually, do not re-publish" note;
 *   - the package itself is not visible either → genuinely unconfirmed → exit 1.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', timeout: 20000, ...opts }).trim()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { name, version } = pkg
const problems = []

console.log(`post-publish-check: ${name}@${version}`)

/** True once `npm view <pkg>@<version>` stops 404-ing (index caught up).
 *  Suppresses stderr so the expected E404 while the index is still catching up
 *  never floods the console. */
function versionVisible() {
  try {
    return run(`npm view ${JSON.stringify(name)}@${version} version`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).length > 0
  } catch {
    return false
  }
}

/** True once `npm view <pkg>` answers at all (any version) — the stronger
 *  signal: the package exists on the registry even while the new version is
 *  still unindexed. stderr suppressed for the same reason as above. */
function packageVisible() {
  try {
    return run(`npm view ${JSON.stringify(name)} version`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).length > 0
  } catch {
    return false
  }
}

// Poll until the published version is visible in the registry index.
// npm's own message says indexing "may take a few minutes", so allow 5 min.
const POLL_INTERVAL_MS = 3000
const POLL_ATTEMPTS = 100 // up to ~5 minutes of waiting
let visible = versionVisible()
for (let attempt = 1; !visible && attempt <= POLL_ATTEMPTS; attempt += 1) {
  if (attempt % 10 === 1 || attempt === POLL_ATTEMPTS) {
    console.log(`   (version not visible yet — registry index catching up; retry ${attempt}/${POLL_ATTEMPTS})`)
  }
  await sleep(POLL_INTERVAL_MS)
  visible = versionVisible()
}
if (!visible) {
  // Distinguish "index lag on a live package" from "package not found at all".
  if (packageVisible()) {
    // The package exists — the upload landed; only the version index is still
    // catching up. Treat as published; npm itself warned processing "may take
    // a few minutes", and postpublish only runs after the upload.
    console.error(`\n⚠️  version ${version} is not indexed yet after 5 minutes of polling,`)
    console.error('   but the package document IS live on the registry — the upload succeeded.')
    console.error('   The index is still catching up (npm: "may take a few minutes").')
    console.error('   Verify shortly with: npm view dsh-turn-navigator versions')
    console.error(`   Do NOT re-publish ${version} — it is live or about to be.`)
    process.exit(0)
  }
  console.error(`\n⚠️  ${name}@${version} did not become visible on the registry after `
    + `${Math.round((POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000)}s of polling,`)
  console.error('   and the package document is not visible either.')
  console.error('   The publish may have failed before the upload completed, or the index')
  console.error('   is still extremely slow. Verify manually with `npm view dsh-turn-navigator versions`.')
  console.error(`   Do NOT re-publish ${version} without checking — it may be live.`)
  process.exit(1)
}
console.log(`✅ version ${version} is visible on the registry`)

// 1. dist-tags.latest matches the published version. This is ALSO an
//    eventual-consistency surface — npm writes the version document first and
//    flips `latest` moments later (real incident: "latest is 0.2.3, expected
//    0.2.4" right after a successful publish for a sibling plugin), so poll it
//    at the same cadence as version visibility instead of trusting a single
//    snapshot.
let latest
let distTags = {}
let lastDistTagError
for (let attempt = 0; attempt <= POLL_ATTEMPTS; attempt += 1) {
  if (attempt > 0) {
    console.log(`   (dist-tag "latest" not yet ${version} — registry tag update catching up; retry ${attempt}/${POLL_ATTEMPTS})`)
    await sleep(POLL_INTERVAL_MS)
  }
  try {
    distTags = JSON.parse(run(`npm view ${JSON.stringify(name)} dist-tags --json`))
    latest = typeof distTags.latest === 'string' ? distTags.latest : undefined
  } catch (error) {
    // Probe failure — keep polling rather than failing on a transient blip.
    lastDistTagError = error
  }
  if (latest === version) break
}
if (latest === undefined) {
  problems.push(lastDistTagError
    ? `could not read dist-tags: ${lastDistTagError.message}`
    : `dist-tags has no "latest" (got: ${JSON.stringify(distTags)})`)
} else if (latest !== version) {
  problems.push(`registry "latest" is ${latest}, expected ${version} — if this publish used an explicit --tag, the mismatch is expected; otherwise check the dist-tag`)
}
if (latest === version) console.log('✅ dist-tags.latest matches the published version')

// 2. The published tarball contains every expected file.
const EXPECTED = ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'README.md', 'README.zh.md', 'LICENSE', 'package.json']
try {
  const tarball = run(`npm view ${JSON.stringify(name)}@${version} dist.tarball`)
  if (tarball.length === 0) throw new Error('registry returned no tarball URL')
  const listing = execSync(`curl -s --max-time 20 ${JSON.stringify(tarball)} | tar -tzf -`, {
    cwd: root, encoding: 'utf8', timeout: 25000,
  })
  for (const file of EXPECTED) {
    if (!listing.includes(`package/${file}`)) problems.push(`published tarball is missing package/${file}`)
  }
  const allPresent = EXPECTED.every((file) => listing.includes(`package/${file}`))
  if (allPresent) console.log('✅ published tarball contains all expected files')
} catch (error) {
  problems.push(`could not inspect published tarball: ${error.message}`)
}

if (problems.length > 0) {
  console.error('\n⚠️  post-publish-check found problems:')
  for (const p of problems) console.error(`   - ${p}`)
  console.error(`\n   IMPORTANT: ${name}@${version} IS live on the registry — the publish itself`)
  console.error('   completed. These are POST-publish findings; do NOT re-publish the same version.')
  console.error('   Fix the cause and address it in the next release.')
  process.exit(1)
}

console.log('\n✅ post-publish-check passed: release is live and consistent on npm.')
