# Contributing

## Development workflow

```sh
pnpm install
pnpm typecheck      # tsc --noEmit
pnpm bundle         # tsdown build → lib/index.js + lib/client.js
pnpm test           # typecheck + dispose contract + turn labels + guarantees + negative controls
```

## Verification gates

Four OFFLINE surfaces, in increasing cost — run the cheap ones always, the last
one before a release:

| gate | command | what it pins |
|---|---|---|
| dispose contract | `node scripts/test-client-dispose.mjs` | the built bundle registers under its plugin id, and `dispose()` restores the official rail (HMR / live-disable) |
| turn labels | `node scripts/test-turn-labels.mjs` | the journal fold / window path / `turnOutline` merge / tooltip fallback: a turn with no human prompt keeps an **empty** label and renders the **localized turn number** — never a fabricated placeholder or injected payload |
| guarantees + negative controls | `node scripts/check-guarantees.mjs && node scripts/test-negative-controls.mjs` | every row of `docs/guarantees.md` is pinned by an assertion label that exists, and every gate is proven load-bearing (each scenario injects one defect into a clone and asserts the responsible gate goes red) |
| everything, bound to the commit | `npm run verify:all` (`verify:fresh` fails once HEAD moves) | all of the above + the release gate, writing `lib/verify-report.json` |

The live-GUI gate `npm run verify:turn-labels` needs this machine's running
`dsh web` plus Playwright: it walks every session reachable in the sidebar,
asserts no capsule tooltip body is a placeholder or an injected payload, and
asserts the bundle the GUI actually **serves** carries no placeholder string. It
is deliberately NOT part of `verify:all` (that gate must stay offline), so quote
its coordinates (date + the `rev=` of the served bundle) when you use it as
evidence.

## Release workflow

Every release must be done in one pass: code + bilingual README + CHANGELOG + version + tag.

1. Make your changes.
2. Update `README.md`, `README.zh.md` (same `##`/`###` section counts), `CHANGELOG.md` and `docs/guarantees.md` — including every compatibility statement (supported dsh floor / the release for older dsh), re-checked sentence-by-sentence against the code before the tag (the gate checks structure only). Before tagging, run the standing self-check:「我这次改的东西，有没有哪句话、哪个字段的说法现在已经不对了？」 Discipline source: `~/.agents/skills/dsh-plugin-development/SKILL.md` (§6).
3. Bump `package.json` version.
4. `git commit && git tag v<version> && git push --tags`.
5. `pnpm release:check` — verifies version, docs, changelog, tag, tree, build, registry.
6. `npm pack --dry-run` — confirm tarball contents.
7. `npm publish` (requires 2FA; the agent cannot do this step).
8. `postpublish` runs `scripts/post-publish-check.mjs` automatically.

## The release gates use npm's own transport

`release-check.mjs` asks `npm view` whether the version is already published, and
`post-publish-check.mjs` gives its curl fallbacks npm's configured proxy — both on
purpose. Node's `fetch` cannot be proxied after startup (the proxy variables and
`NODE_USE_ENV_PROXY` are sampled at process start) and ignores `.npmrc` entirely, so
a fetch-based gate goes direct and blocks every release on a network where the
registry is only reachable through the proxy in `.npmrc` — even though
`npm publish` itself would work. Keep new registry access on the npm/curl path.

## npm publish is manual (2FA)

npm accounts with two-factor authentication require an OTP that the agent cannot provide. The agent prepares everything to "one command to publish"; the human runs `npm login` → `npm publish`.

## Post-release release-check "failures" are expected

After a version is published, `release:check` will fail because the version is already on npm and the tag no longer points at HEAD. This is by design — it protects already-published versions. Bump the version and tag a new release instead.
