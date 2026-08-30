# Changelog

## [0.4.0] - 2026-08-29

### Added

- **Rail display mode (Settings → General → Turn navigation)**: three-way choice between `DSH official` (the built-in rail), `DSH STN` (this plugin's rail — default), and `Hide all`. Registered into the official `settings.general.item` seat (root scope), styled like the built-in preference rows (EnterBehaviorRow pattern), persisted browser-locally (localStorage — the official `settingsScope` store needs a Host-registered namespace that an external client-only plugin has no seam to create).
- **Subtractive takeover of the official rail**: the official built-in TurnNavigator has no off-switch, so in `DSH STN` mode it is hidden with a container-scoped stylesheet override (`body.tn-hide-official [data-conversation-scroll] nav { display: none !important }` — our rail is fixed OUTSIDE the conversation scroll container, so the rule cannot match ours), and our rail takes over the right-edge center position. `Hide all` hides both.
- **Official-rail detection fix**: the old check matched `nav[aria-label*="轮次"/"Turn navigation"]` anywhere, which also matched OUR OWN rail (same localized label) — so the rail stayed nudged into the header zone even when the official rail was absent (e.g. 1-turn sessions). The check is now scoped to `[data-conversation-scroll]` and reads the COMPUTED display value, so the nudge follows reality: official visible → we nudge; official hidden by our override → we stay centered.
- **Brand name**: DSH Smoothly Turn Nav (DSH STN) — used in the README, settings row, and changelog.

# Changelog

## [0.3.0] - 2026-08-29

### Added

- **Full history restored on dsh 0.1.2+ (journal channel)**: the 0.2.0 refactor removed the browser→host `sessions.history` RPC, so the rail degraded to loaded-window turns. This release restores the full-history rail in the browser with **zero host changes and zero new dependencies**: the plugin pages the same persisted log the official window reads through the Typert Remote `session/page` endpoint (`ctx.remote.session` — the namespace is mounted by the base web assembly into `ctx.get('remote.session')`, read without adding to the cordis `inject` list because `ctx.get` is the inject-free store read; the traced `ctx.get('remote').session` path would hit the "without inject" gate). Every persisted turn (including turns far outside the window) is shown as plain data, paged incrementally, with no prepends into the conversation flow on open — the same performance story as 0.1.x, now purely client-side.
- **Official-store jump path**: window expansion for out-of-window jumps now goes through the official session store (`sessions.binding(id).session.loadOlder()`), with the authoritative `hasMore` from `binding(id).eventSource.getSnapshot().hasMore` as the loop terminator (no more DOM "Load earlier" button sniffing on 0.1.2+), and row polling instead of fixed sleeps so fast renders jump immediately. The "Load earlier" button path remains as a fallback on older hosts.
- **Journal readiness wait**: the official session binding is staged a moment after the conversation view mounts; the full-history fetch now waits (bounded, 15s) for the window's seq bounds instead of silently skipping, so the rail fills with all turns shortly after open.

### Changed

- History-channel priority: 0.1.2+ journal (`session/page`) → legacy `sessions.history` RPC → window-only turns (each layer degrades gracefully, including when `remote.session` is not yet mounted at boot — handles are resolved lazily and retried at render).

## [0.2.0] - 2026-08-29

### Changed

- **Adapted to dsh 0.1.2+ (ui-chat refactor)**: the conversation data model changed — `ConversationSnapshot` lost its `chat` field and the old `dsh-client-runtime` package was removed. The rail now reads turn data through the new `useChat` hook (ChatSnapshot, `navigation.items()`), falls back to the legacy `.chat`-wrapped snapshot on older dsh, and imports `ClientContext` from `@deepseek-ai/cordis` (with the `dsh-client-ui-renderer/client` merge for `ctx.slots`). This fixes the crash that hid the rail after upgrading.
- **Coexists with the official built-in TurnNavigator**: the official dsh rail (in-chat, always rendered, cannot be disabled) now overlaps-free — when it is present our rail nudges up into the header zone (`.tn-nudge`) instead of the scrollport center. Mirrored the official narrow-viewport hide (`@media max-width: 900px`).
- **Added follow-scroll active-turn highlight**: the capsule for the turn at the reading line is tinted (brand color) as you scroll — a capability the official rail has and we previously lacked.
- **History-as-data is window-scoped on 0.1.2+**: the browser→host `sessions.history` RPC (`connection.api`) was removed in the refactor, so the full-history read is unavailable in the browser on new dsh; the rail degrades to the loaded-window turns (same data as the official rail) and keeps its UI/UX (wave hover, scroll buttons, center-on-click, tooltip, jump feedback, follow highlight). Full-history support is a known follow-up (host-half route) if desired.

## [0.1.1] - 2026-08-19

### Changed

- **History-as-data architecture (fixes stalls on very long sessions)**: the rail's turn list is now read from the HOST through the browser→host `sessions.history` RPC — every persisted turn (including ones far outside the conversation window) is shown as plain data, paged incrementally, with **zero prepends into the conversation flow on open**. Previously the rail extended the flow window by auto-clicking "Load earlier", which re-renders the whole flow per page and stalled the UI on ~150-turn sessions. Now the flow window is only extended **on demand**: clicking a capsule for a turn already in the window scrolls directly; for a turn outside the window, the rail extends the window page by page (respecting the paging button's in-flight state) until the target turn is in the window, then scrolls and highlights it.
- **Immediate jump feedback**: clicking an out-of-window capsule now shows instant feedback — the clicked capsule pulses and a "Locating turn N…" bubble appears beside it (in the DSH tooltip visual style) for the whole duration of the on-demand window extension; on failure a brief "Could not locate turn N" notice shows instead. No more silent waits.
- **Oldest-turn jumps load to the true start**: jumping to the oldest turn now extends the window until there is no more history to load (hasMore false) — previously the window could include the target's boundary while earlier events were still pending, so the jump landed before the true first turn with a "Load earlier" button remaining. Readiness is judged by the target row being actually rendered in the DOM, not just the turn being listed in the window.
- **Bilingual README switch**: README (English default) and README.zh.md now link to each other.
- **Layer stacking**: the rail's z-index is now 10 — above the conversation flow content (max 8) but below full-screen overlays like the kanban board plugin (z-index 50) — matching the header's "Session log" button tier, so an open full-screen page always paints over the rail.
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
