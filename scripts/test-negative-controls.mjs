#!/usr/bin/env node
/**
 * Negative controls for this repo's gates: a gate nobody has seen FAIL is not
 * evidence. Every scenario below clones the committed tree into a temp dir,
 * injects ONE defect, runs the gate that is supposed to catch it, and asserts
 * the gate FAILS with the expected message. A scenario that passes (or that
 * fails for the wrong reason) fails this script.
 *
 * Why: this plugin's most load-bearing promise is the DISPOSE contract (a rail you
 * cannot switch off is worse than no rail), and its test surface is thin — so the
 * few gates it has must be provably live. Manual one-off proofs decay.
 *
 * Offline-friendly: DSH_RELEASE_ALLOW_REGISTRY_UNREACHABLE=1 is set so the
 * release gate's registry probe cannot turn the positive control red.
 */
import { execFileSync, execSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseCheckFailures, undocumentedReleaseFailures } from './lib/release-post-state.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const VERSION = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const TAG = `v${VERSION}`

/** Fresh clone of the committed tree, with the (gitignored) build output copied in. */
function freshClone() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-turn-nav-control-'))
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', root, dir], { stdio: 'ignore' })
  if (!existsSync(join(root, 'lib/index.js'))) {
    console.error('❌ negative controls need a built artifact — run `npm run bundle` first')
    process.exit(1)
  }
  cpSync(join(root, 'lib'), join(dir, 'lib'), { recursive: true })
  return dir
}

/** Run a command inside the clone; never throws. */
function run(dir, command) {
  try {
    return { code: 0, output: execSync(command, { cwd: dir, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, DSH_RELEASE_ALLOW_REGISTRY_UNREACHABLE: '1' } }) }
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

const scenarios = [
  {
    name: 'dirty working tree',
    command: 'node scripts/release-check.mjs',
    expect: /working tree is not clean/,
    mutate: (dir) => appendFileSync(join(dir, 'README.md'), '\n<!-- uncommitted -->\n'),
  },
  {
    name: 'CHANGELOG entry for the current version removed',
    command: 'node scripts/release-check.mjs',
    expect: new RegExp(`CHANGELOG\\.md has no entry for \\[${VERSION.replace(/\./g, '\\.')}\\]`),
    mutate: (dir) => {
      const p = join(dir, 'CHANGELOG.md')
      writeFileSync(p, readFileSync(p, 'utf8').replace(new RegExp(`^## \\[${VERSION.replace(/\./g, '\\.')}\\].*$`, 'm'), ''))
    },
  },
  {
    name: 'release tag deleted',
    command: 'node scripts/release-check.mjs',
    expect: new RegExp(`git tag ${TAG} does not exist`),
    mutate: (dir) => execFileSync('git', ['tag', '-d', TAG], { cwd: dir, stdio: 'ignore' }),
  },
  {
    name: 'build artifact removed',
    command: 'node scripts/release-check.mjs',
    expect: /is missing — run `npm run bundle` first/,
    mutate: (dir) => rmSync(join(dir, 'lib/index.js')),
  },
  {
    name: 'guarantee row loses its pinning assertion',
    command: 'node scripts/check-guarantees.mjs',
    expect: /no assertion matches/,
    mutate: (dir) => {
      const p = join(dir, 'docs/guarantees.md')
      const before = readFileSync(p, 'utf8')
      const after = before.replace(/`apply\(\) still registers the session-header rail`/, '`an assertion that does not exist`')
      // A no-op mutation would make this scenario pass for the wrong reason.
      if (after === before) throw new Error('mutation did not apply — the anchor label is not in docs/guarantees.md')
      writeFileSync(p, after)
    },
  },
  {
    name: 'label fallback replaced by a fabricated placeholder',
    command: 'node scripts/test-turn-labels.mjs',
    // The mutation reintroduces the original defect at its new home: the prompt
    // line fabricating content for a turn that has none. The assertion it must
    // trip is the placeholder ban (the leading label itself still passes).
    expect: /fabricated placeholder for a turn without a human prompt/,
    mutate: (dir) => {
      const p = join(dir, 'src/client/label.ts')
      const before = readFileSync(p, 'utf8')
      const after = before.replace(
        'const prompt = (entry.fullText || entry.summary).trim()',
        "const prompt = (entry.fullText || entry.summary || '(no user message)').trim()",
      )
      if (after === before) throw new Error('mutation did not apply — the prompt line is not in src/client/label.ts')
      writeFileSync(p, after)
    },
  },
  {
    name: 'journal fold labels a machine-woken turn from its injected payload',
    command: 'node scripts/test-turn-labels.mjs',
    expect: /machine-woken turn keeps an empty label/,
    mutate: (dir) => {
      const p = join(dir, 'src/client/history.ts')
      const before = readFileSync(p, 'utf8')
      const after = before.replace('if (current !== null && current.summary === \'\' && isHumanPrompt(event)) {', 'if (current !== null && current.summary === \'\') {')
      if (after === before) throw new Error('mutation did not apply — the human-prompt guard is not in src/client/history.ts')
      writeFileSync(p, after)
    },
  },
  {
    name: 'package.json files lists a shipped asset that does not exist',
    command: 'node scripts/release-check.mjs',
    expect: /files lists .*missing-artifact.* but it does not exist/,
    mutate: (dir) => {
      const p = join(dir, 'package.json')
      const before = readFileSync(p, 'utf8')
      const after = before.replace('"files": [\n    "lib/index.js",', '"files": [\n    "lib/missing-artifact.js",\n    "lib/index.js",')
      if (after === before) throw new Error('mutation did not apply — the files whitelist is not in package.json')
      writeFileSync(p, after)
    },
  },
  {
    name: 'response preview dropped from the tooltip',
    command: 'node scripts/test-turn-labels.mjs',
    expect: /host response preview on a turn without a human prompt/,
    mutate: (dir) => {
      const p = join(dir, 'src/client/label.ts')
      const before = readFileSync(p, 'utf8')
      const after = before.replace("  if (response !== '') lines.push(response)\n", '')
      if (after === before) throw new Error('mutation did not apply — the response line is not in src/client/label.ts')
      writeFileSync(p, after)
    },
  },
  {
    name: 'tarball-presence discriminator reports a dropped publish as landed',
    command: 'node scripts/test-post-publish.mjs',
    expect: /scenarios failed/,
    mutate: (dir) => {
      const p = join(dir, 'scripts/post-publish-check.mjs')
      const before = readFileSync(p, 'utf8')
      const after = before.replace(
        "if (status === 404 || status === 410) return { kind: 'absent' }",
        "if (status === 404 || status === 410) return { kind: 'present' }",
      )
      if (after === before) throw new Error('mutation did not apply — the tarball presence grading is not in scripts/post-publish-check.mjs')
      writeFileSync(p, after)
    },
  },
]

let failed = 0
console.log('▶ positive control — an unmutated clone must PASS both gates')
{
  const dir = freshClone()
  const release = run(dir, 'node scripts/release-check.mjs')
  const guarantees = run(dir, 'node scripts/check-guarantees.mjs')
  rmSync(dir, { recursive: true, force: true })
  // A PUBLISHED version (and the tag that then sits behind HEAD) fails
  // release-check by design; only those two documented items may explain a
  // non-zero exit, and any other failure item means the clone is broken.
  const documented = releaseCheckFailures(release.output).length
  const undocumented = undocumentedReleaseFailures(release.output)
  const releaseOk = release.code === 0 || (documented > 0 && undocumented.length === 0)
  const ok = releaseOk && guarantees.code === 0
  console.log(`${ok ? '  ✅' : '  ❌'} release-check exit=${release.code}, guarantee gate exit=${guarantees.code}`)
  if (!ok) {
    failed += 1
    console.log(`     release tail: ${release.output.trim().split('\n').slice(-3).join(' | ')}`)
    console.log(`     guarantees tail: ${guarantees.output.trim().split('\n').slice(-2).join(' | ')}`)
  }
  if (ok) {
    console.log(`     (release-check: ${release.output.trim().split('\n').pop()})`)
    if (release.code !== 0) console.log(`     (allowed post-release item(s): ${documented}; undocumented: ${undocumented.length})`)
  }
}

for (const scenario of scenarios) {
  const dir = freshClone()
  let result
  try {
    scenario.mutate(dir)
    result = run(dir, scenario.command)
  } catch (error) {
    result = { code: 0, output: `mutation threw: ${error.message}` }
  }
  rmSync(dir, { recursive: true, force: true })
  const caught = result.code !== 0 && scenario.expect.test(result.output)
  console.log(`${caught ? '✅' : '❌'} ${scenario.name}`)
  if (!caught) {
    failed += 1
    console.log(`     exit=${result.code} expected ${scenario.expect}`)
    console.log(`     output: ${result.output.trim().split('\n').slice(0, 3).join(' | ')}`)
  }
}

if (failed > 0) {
  console.error(`\n❌ ${failed} negative control(s) failed — a gate is not load-bearing as documented`)
  process.exit(1)
}
console.log(`\n✅ all ${scenarios.length} negative controls + the positive control behaved as documented`)
