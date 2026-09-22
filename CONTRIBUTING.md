# Contributing

## Development workflow

```sh
pnpm install
pnpm typecheck      # tsc --noEmit
pnpm bundle         # tsdown build → lib/index.js + lib/client.js
```

## Release workflow

Every release must be done in one pass: code + bilingual README + CHANGELOG + version + tag.

1. Make your changes.
2. Update `README.md`, `README.zh.md` (same `##`/`###` section counts), and `CHANGELOG.md`.
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
