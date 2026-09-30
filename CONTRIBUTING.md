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

## "npm publish said +pkg@version but the registry serves nothing"

npm exits 0 whenever the publish `PUT` is answered with any status below 400
(`npm-registry-fetch` only throws on `>= 400`). The registry uses that room: it
can answer **`202 Accepted`** and print *"Your package is being processed and may
take a few minutes to become available"*. Measured on 0.4.7 (2026-09-30):
`PUT … 202` → npm printed `+ dsh-turn-navigator@0.4.7` → the version document and
its tarball still answered **404 twenty minutes later** → **the release was live,
with `latest` moved, on a later re-run**. So a 404 for the version is *ambiguous*
(long publish-pipeline lag or a dropped publish) and npm's success line is not
evidence either way.

`postpublish` runs `scripts/post-publish-check.mjs`, which removes one of the two
unknowns by probing the version's **tarball** at the deterministic URL
(`/<name>/-/<basename>-<v>.tgz`):

| probe | meaning | action |
|---|---|---|
| tarball served, version document missing | genuine index lag — the upload landed | re-run the check later; nothing else to do |
| tarball 404, package document live | **ambiguous**: long lag (observed: hours) or dropped | re-run the check later; **do not** re-publish while it is merely unserved |
| version **and** package document 404 | the upload is unconfirmed | check the publish log, then re-publish |

Recovery recipe (all read-only until the last step):

```sh
node scripts/post-publish-check.mjs                       # verdict + tarball coordinate
curl -sSI -x "$(npm config get https-proxy)" https://registry.npmjs.org/<pkg>/-/<pkg>-<version>.tgz | head -1
npm view <pkg> dist-tags                                  # latest still the old version?
npm publish                                               # only if it stays absent much later — human step (2FA)
```

A retry never needs a new version, CHANGELOG entry or tag: the first attempt left
nothing behind, and if it did land meanwhile the retry fails with
`EPUBLISHCONFLICT` — the safe outcome. **Do not bump the version for a publish
that never landed**; conversely, once the version IS live, `release:check` starts
blocking with "already published" — that is the expected post-release state, and
the next change goes into a new version.

## Post-release release-check "failures" are expected

After a version is published, `release:check` will fail because the version is already on npm and the tag no longer points at HEAD. This is by design — it protects already-published versions. Bump the version and tag a new release instead.
