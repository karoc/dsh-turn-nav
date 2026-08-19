# Changelog

## [0.1.0] - 2026-08-19

### Added

- Initial release: piano-key turn navigation rail for DSH web conversations.
- A vertical rail of grey capsules floats on the right edge of the conversation — one capsule per turn, proportional to the whole history (registered into `conversation.session.header.utilities`; `position: fixed`).
- Wave hover: hovering a capsule makes it glow white and grow, with the two neighbours slightly raised — sliding across the rail ripples like a wave.
- Native DSH tooltip on hover showing the turn's index, timestamp, and user-message summary (multi-line, `\n`-separated).
- Click-to-jump: scrolls the conversation flow to the turn's first node and briefly highlights it — computed via the scrollport's `scrollTop` and the `data-chat-anchor-key` DOM anchor.
- Auto-load of older history: the plugin keeps clicking the conversation's "Load earlier" paging button (respecting its in-flight state) until every turn is in the window.
- Jump retry: if a target turn's row is not yet rendered (older page not loaded), the jump auto-clicks "Load earlier" and retries until the row appears — no "scroll once first" friction.
- Bilingual README (en/zh), CHANGELOG, CONTRIBUTING, LICENSE, release-check + post-publish-check scripts, Playwright rail verification script.

### Changed

- Replaced the earlier drawer-based design (header trigger pill + `shell.overlay` drawer + module-level relay bridge) with the single session-scoped rail, which reads `useSession` directly — simpler and one additive slot instead of two.
