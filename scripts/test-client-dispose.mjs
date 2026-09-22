#!/usr/bin/env node
/**
 * Behavioral test for the browser bundle's DISPOSE path.
 *
 * Why this exists: dsh 0.1.6+ enables the host `hmr` row by default for
 * launcher-provided profiles, so the dsh Plugins page can disable or reload
 * this plugin LIVE. Anything the plugin does to the shared DOM therefore needs
 * a teardown, and a missing teardown is silent — the user just sees the
 * OFFICIAL turn rail stay hidden with our plugin gone. `tsc --noEmit` cannot
 * catch that, so this test loads the REAL built bundle in a minimal DOM stub
 * and asserts the observable contract:
 *
 *   apply   → `body.tn-hide-official` is present (mode `stn`/`hidden`)
 *   dispose → the class is gone (official rail visible again)
 *
 * The negative control is built in: comment out the `ctx.effect(...)` wrapper
 * in src/client/index.ts, rebuild, and this test fails.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = join(root, 'lib', 'client.js')

// ── minimal DOM + module-loader environment ────────────────────────────────
const classes = new Set()
const classList = {
  add: (name) => { classes.add(name) },
  remove: (name) => { classes.delete(name) },
  contains: (name) => classes.has(name),
  toggle: (name, force) => {
    const on = force === undefined ? !classes.has(name) : Boolean(force)
    if (on) classes.add(name)
    else classes.delete(name)
    return on
  },
}
const styleTags = []
const documentStub = {
  body: { classList },
  head: { appendChild: (tag) => { styleTags.push(tag) } },
  createElement: () => ({ setAttribute() {}, textContent: '' }),
  querySelector: () => null,
  addEventListener() {},
  removeEventListener() {},
}

let plugin = null
const requireStub = () => new Proxy({}, {
  get: (_target, prop) => {
    // React is never rendered here (apply() only registers slots), so a benign
    // stub is enough; anything actually called would surface as a TypeError.
    if (prop === 'default') return {}
    return () => ({})
  },
})

globalThis.document = documentStub
globalThis.window = {
  localStorage: { getItem: () => null, setItem() {} },
  __ModuleLoader__: {
    load: ({ id, factory }) => {
      assert.equal(id, 'dsh-turn-navigator', 'the bundle registers under its plugin id')
      plugin = factory(requireStub)
    },
  },
}

// ── load the built bundle ──────────────────────────────────────────────────
// The bundle is a classic script that calls window.__ModuleLoader__.load; eval
// gives it the same global scope the dsh web client would.
;(0, eval)(readFileSync(bundlePath, 'utf8'))
assert.ok(plugin !== null, 'the bundle registered a plugin through __ModuleLoader__.load')
assert.equal(typeof plugin.apply, 'function', 'the plugin exposes apply()')

// ── run apply() against a cordis-shaped context ────────────────────────────
const disposers = []
const registered = []
const ctx = {
  effect(fn, label) {
    const disposer = fn()
    if (typeof disposer === 'function') disposers.push({ disposer, label })
    return disposer
  },
  get: () => undefined,
  slots: {
    // cordis calls the inject callback once the named slot exists; the stub
    // invokes it immediately so the registrations below are observable.
    inject: (_name, fn) => { fn(); return () => {} },
    register: (options) => { registered.push(options); return () => {} },
  },
  locale: { register: () => () => {}, bind: () => (key) => key },
}

plugin.apply(ctx)

assert.ok(
  classes.has('tn-hide-official'),
  'apply() hides the OFFICIAL rail through the body class (default mode is stn)',
)
assert.ok(
  registered.some((o) => o.name === 'conversation.session.header.utilities'),
  'apply() still registers the session-header rail',
)
assert.ok(
  registered.some((o) => o.name === 'settings.general.item'),
  'apply() still registers the settings preference row',
)

// ── dispose exactly like cordis does when the plugin is unloaded ───────────
assert.ok(disposers.length > 0, 'apply() registered at least one cordis effect to dispose')
for (const { disposer } of disposers) disposer()

assert.ok(
  !classes.has('tn-hide-official'),
  'dispose() removes the body class so the OFFICIAL rail comes back (HMR/live-disable contract)',
)

console.log('PASS — client dispose contract (apply hides the official rail, dispose restores it)')
