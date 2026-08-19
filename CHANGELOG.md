# Changelog

## [0.1.1] - 2026-08-19

### Changed

- **Aggressive stall protection for very long conversations** (hundreds of turns): initial auto-load now pulls only a few pages (`MAX_AUTO_PAGES = 5`, was 30), and the rail-top scroll loads at most 3 pages per continuous pass — scroll away and back to load more. Every page prepend re-renders the whole conversation flow, so capping total prepends keeps the UI (including the rail itself) responsive even on ~150-turn sessions. Load settle raised to 900ms for more breathing room between prepends.
- **README screenshot**: added `docs/turn-nav-rail.png` to the bilingual README (English default) as marketing, shipped in the npm package.

## [0.1.0] - 2026-08-19

### Added

- Initial release: piano-key turn navigation rail for DSH web conversations.
- A vertical rail of grey capsules floats on the right edge of the conversation — one capsule per turn (registered into `conversation.session.header.utilities`; `position: fixed`).
- The rail is **height-capped (60vh) and scrolls internally**, so a very long conversation never pushes it past the viewport.
- Wave hover: hovering a capsule makes it glow with the **theme's primary label color** and widen to 150% (the two neighbours widen to 125%), sliding across the rail like a wave. Widening uses transform:scaleX, so it never reflows or adds a horizontal scrollbar.
- Native DSH tooltip on hover showing the turn's index, timestamp, and user-message summary (multi-line, `\n`-separated).
- Click-to-jump: scrolls the conversation flow to the turn's first node and briefly highlights it — computed via the scrollport's `scrollTop` and the `data-chat-anchor-key` DOM anchor.
- **Stall-free auto-load**: the rail slowly fills its visible height after open (slow cadence, back-pressure, page cap), then keeps loading earlier turns while scrolled near its top — scroll-driven, like the conversation itself. A shared busy-lock prevents concurrent paging clicks.
- **Custom tooltip bubble** (DSH visual style, multi-line) anchored to the **left** of the rail — rendered via a React portal to `document.body` so it stays viewport-fixed (a transform on the wrapper would otherwise misplace it), vertically centered on the hovered capsule, and clamped so the whole bubble stays inside the viewport even when the summary is long.
- **Auto-sizing rail**: its length grows with the turn count, capped at **30vh**; scrolls internally (hidden scrollbar) once the cap is hit.
- **Up/down scroll buttons**: click to scroll ~1 viewport-height, and **hover-hold auto-scrolls** continuously; each is greyed out (disabled) when there is nothing to scroll in that direction.
- **Center-on-activate**: clicking a capsule scrolls it to the center of the rail, unless it is the first or last turn (which sit at the edges).
- Wave widening is **right-origin** (`transform-origin: right`), so capsules grow LEFTWARD only — the right edge never moves.
- Jump retry: if a target turn's row is not yet rendered (older page not loaded), the jump auto-clicks "Load earlier" (recognizing the idle and in-flight labels) and retries until the row appears — no "scroll once first" friction.
- Bilingual README (en/zh), CHANGELOG, CONTRIBUTING, LICENSE, release-check + post-publish-check scripts, Playwright rail verification script.

### Changed

- Replaced the earlier drawer-based design (header trigger pill + `shell.overlay` drawer + module-level relay bridge) with the single session-scoped rail, which reads `useSession` directly — simpler and one additive slot instead of two.
- Wave hover changed from height growth to **width widening** via transform:scaleX (150% / 125%) — no reflow, no horizontal scrollbar, no layout drift while sliding. Rail is now pointer-events:auto (wheel scrolls anywhere on it, including the gaps) with overflow-x:hidden. Hover color follows the theme (primary label token).
