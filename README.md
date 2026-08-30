# DSH Smoothly Turn Nav (DSH STN)

**English · [简体中文](README.zh.md)**

**Every turn of your conversation, one glance away.**

DSH Smoothly Turn Nav (**DSH STN**) is an external plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) that puts a **piano-key turn rail** on the right edge of every conversation — a vertical column of tiny capsules, one per turn. It gives you a full minimap of the conversation: **every turn ever made** (not just the ones currently loaded), hover previews, click-to-jump to any turn's start, and follow-scroll highlighting. It can also **replace the official built-in turn rail**, which has no off-switch of its own.

![Turn navigation rail](docs/turn-nav-rail.png)

## Why

In the default DSH web UI, the official turn rail only shows the **currently loaded window** of turns — in a long conversation, most turns are invisible until you scroll and load more. DSH STN solves this:

- **Full history at a glance** — every persisted turn is shown as plain data, including turns far outside the loaded window. No scrolling, no loading, no waiting.
- **Hover to preview** — the capsule glows with the theme color and widens in a wave ripple; a DSH-style tooltip shows the turn's number, time, and user-message summary.
- **Click to jump anywhere** — jumps to any turn's start, even turns not yet loaded (the window is extended on demand with instant feedback).
- **Know where you are** — the current turn is highlighted as you scroll.

## Features

| | |
|---|---|
| 🗺️ **Full-history minimap** | All turns visible immediately — read from the persisted session log as data, **zero prepends** into the conversation flow on open (long sessions stay responsive) |
| 🎹 **Piano-key design** | One capsule per turn, ~3px tall, right-aligned on the right edge; auto-sizing (up to 30vh) with an internal hidden scrollbar |
| 🌊 **Wave hover** | Hovered capsule glows with the theme color and widens 150% leftward; its two neighbours widen 125% — a ripple across the rail |
| 💬 **Rich tooltip** | Turn number, timestamp, and full user-message summary, always fully inside the viewport |
| 🎯 **Jump to any turn** | Precise `scrollTop` targeting (no `scrollIntoView` fights); out-of-window jumps extend the window on demand with a "Locating turn N…" pulse + bubble; the oldest-turn jump loads to the **true first turn** (`hasMore = false`) |
| 👁️ **Follow-scroll highlight** | The capsule of the turn at the reading line is tinted as you scroll |
| ⬆️⬇️ **Scroll buttons** | Click or hover-hold to scroll the rail; greyed out when there is nothing to scroll |
| 🎛️ **Rail mode switch** | Settings → General → *Turn navigation*: `DSH official` / `DSH STN` (default) / `Hide all` — persisted across reloads |
| 🔌 **Pure external plugin** | No DSH source code modified; no host changes; no new dependencies; read-only DOM access |

## vs. the official DSH turn rail

The official built-in `TurnNavigator` has **no off-switch** and is always rendered in the chat view. DSH STN is the upgrade:

| Capability | DSH official rail | DSH STN |
|---|---|---|
| Turns shown | Only the **loaded window** | **Every persisted turn** (full history) |
| Jump to a turn outside the window | ❌ Not visible, not reachable | ✅ On-demand window extension + feedback |
| Long-session open performance | Window rendering | **Zero prepend** — no flow re-render, no stall |
| Follow-scroll highlight | ✅ | ✅ |
| Hover preview | Prompt + response (≤160 chars each) | Number + time + full summary tooltip |
| Wave ripple animation | ❌ | ✅ |
| Scroll buttons (click / hover-hold) | ❌ | ✅ |
| Rail height | Fixed band, compressed proportionally (≤420px) | Auto-sized (≤30vh), internal scroll |
| Narrow viewport (<900px) | Auto-hidden | Auto-hidden (mirrors official) |
| Hide / switch rail | ❌ No off-switch | ✅ Settings → General → 3 modes |
| Keyboard reachable | ✅ (focus ring) | ✅ (buttons) |
| Source | Built-in, cannot be disabled | External plugin, **can be replaced/disabled** |

## Installation

```sh
dsh plugin --profile web add dsh-turn-navigator
```

Then restart `dsh web`:

```sh
dsh web
```

## Usage

0. **Choose which rail to show** (Settings → General → **Turn navigation**): `DSH official` (the built-in rail), `DSH STN` (this plugin's rail — **default**), or `Hide all`. The official rail has no off-switch, so choosing DSH STN hides it with a stylesheet override and our rail takes over the right-edge center position. The choice persists across reloads.
1. Open any conversation with at least one completed turn.
2. A vertical rail of grey capsules appears on the right edge (one per turn). It **auto-sizes** — short conversations get a short rail, long ones hit the 30vh cap and scroll internally (hidden scrollbar, no layout jitter).
3. **Hover** a capsule: it glows, widens in a wave, and shows the turn's index, timestamp, and summary in a tooltip to the left of the rail.
4. **Click** a capsule to jump to that turn's start. Out-of-window turns pulse the capsule and show a "Locating turn N…" bubble while the window is extended on demand; the target row is highlighted on arrival. The activated capsule centers in the rail (unless it is the first or last turn).
5. **Scroll** with the mouse wheel, the up/down buttons, or hover-hold on the buttons.

## How it works

The plugin registers **two additive slots** — **no DSH source code is modified**:

| Slot | Scope | Role |
|------|-------|------|
| `conversation.session.header.utilities` | session | The floating turn rail (renders `position: fixed`; reads the live chat snapshot via the framework `useChat`/`useSession` kit) |
| `settings.general.item` | root | The *Turn navigation* mode switch in Settings → General |

- **Full history as data**: on dsh 0.1.2+ the rail pages the same persisted log the official window reads, through the Typert Remote `session/page` channel (`ctx.remote.session` — mounted by the base web assembly; **no host changes, no new dependencies**). On older dsh it uses the `sessions.history` RPC. Every turn is derived from raw `turn/start` / `user/message` / `turn/end` events as plain data.
- **On-demand jumps**: clicking a turn already in the window scrolls directly; for a turn outside it, the rail extends the window page by page through the official session store (`loadOlder`, with the authoritative `hasMore` as the loop terminator) until the target is in view — the only path that touches the flow, and it runs only when you click.
- **Precise scrolling**: the rail locates the turn's first chat-node key, finds its DOM row via `data-chat-anchor-key`, and sets the scrollport's `scrollTop` directly (more predictable than `scrollIntoView`).
- **Replacing the official rail**: the official rail lives inside the conversation scroll container; a container-scoped stylesheet rule (driven by the mode switch) hides it, and the rail takes over its right-edge center position. If a future dsh changes that structure, the worst case is the official rail reappearing (side by side) — never a crash.
- **Read-only**: the plugin never writes to DSH state, never sends data anywhere, and only reads the DOM for targeting.

## Compatibility

- DeepSeek Harness (dsh) with the web client (`dsh web`).
- Requires the `conversation.session.header.utilities` and `settings.general.item` slot declarations (present in current DSH).
- Default `DSH STN` mode hides the official rail (stylesheet override) and centers our rail in its place; `DSH official` mode shows the built-in rail instead; `Hide all` hides both. Both rails auto-hide below 900px width.
- Coexists with full-screen plugin pages (e.g. the kanban board): the rail sits below their overlay layer.

## Development

- `pnpm typecheck` / `pnpm test` — TypeScript check (tsdown does not typecheck).
- `pnpm bundle` — build the module-table client bundle into `lib/`.
- `scripts/verify-*.mjs` — Playwright acceptance scripts against a live `dsh web` (rail, full-history journal, mode switch, jump, feedback, overlay, sizing, UI).
- `pnpm release:check` — release gates (version, tag, tree, build, registry).

## License

MIT
