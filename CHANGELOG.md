# Changelog

## [0.1.0] - 2026-08-19

### Added

- Initial release: piano-key turn navigation rail for DSH web conversations.
- A vertical rail of grey capsules floats on the right edge of the conversation — one capsule per turn (registered into `conversation.session.header.utilities`; `position: fixed`).
- The rail is **height-capped (60vh) and scrolls internally**, so a very long conversation never pushes it past the viewport.
- Wave hover: hovering a capsule makes it glow with the **theme's primary label color** and widen to 150% (the two neighbours widen to 125%), sliding across the rail like a wave. Widening uses transform:scaleX, so it never reflows or adds a horizontal scrollbar.
- Native DSH tooltip on hover showing the turn's index, timestamp, and user-message summary (multi-line, `\n`-separated).
- Click-to-jump: scrolls the conversation flow to the turn's first node and briefly highlights it — computed via the scrollport's `scrollTop` and the `data-chat-anchor-key` DOM anchor.
- **Stall-free auto-load**: the rail slowly fills its visible height after open (slow cadence, back-pressure, page cap), then keeps loading earlier turns while scrolled near its top — scroll-driven, like the conversation itself. A shared busy-lock prevents concurrent paging clicks.
- Jump retry: if a target turn's row is not yet rendered (older page not loaded), the jump auto-clicks "Load earlier" (recognizing the idle and in-flight labels) and retries until the row appears — no "scroll once first" friction.
- Bilingual README (en/zh), CHANGELOG, CONTRIBUTING, LICENSE, release-check + post-publish-check scripts, Playwright rail verification script.

### Changed

- Replaced the earlier drawer-based design (header trigger pill + `shell.overlay` drawer + module-level relay bridge) with the single session-scoped rail, which reads `useSession` directly — simpler and one additive slot instead of two.
- Wave hover changed from height growth to **width widening** via transform:scaleX (150% / 125%) — no reflow, no horizontal scrollbar, no layout drift while sliding. Rail is now pointer-events:auto (wheel scrolls anywhere on it, including the gaps) with overflow-x:hidden. Hover color follows the theme (primary label token).
