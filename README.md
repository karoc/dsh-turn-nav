# dsh-turn-navigator

An external [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that adds a **piano-key turn rail** to the conversation interface — a vertical column of tiny capsules on the right edge of the conversation, one per turn, so you can see every turn at a glance, hover to preview it, and click to jump to its start.

## Why

In the default DSH web UI, finding a specific turn in a long conversation means scrolling — a lot. There's no overview of how many turns happened, what each turn was about, or where the current scroll position sits. `dsh-turn-navigator` solves this with a minimap-style rail:

- A **vertical capsule per turn** floats on the right edge of the conversation (grey, ~3px tall, piano-key style).
- **Hovering** a capsule makes it glow white and grow — with the two neighbouring capsules slightly raised too, so sliding across the rail ripples like a wave — and shows the full turn info (index, timestamp, user-message summary) in a native DSH tooltip.
- **Clicking** a capsule scrolls the conversation to that turn's start and briefly highlights it.
- **Older history auto-loads**: the conversation paginates its window; the plugin keeps loading earlier pages so every turn is reachable, with no manual "Load earlier" clicks.

## Installation

```sh
dsh plugin --profile web add dsh-turn-navigator
```

Then restart `dsh web`:

```sh
dsh web
```

## Usage

1. Open any conversation with at least one completed turn.
2. A vertical rail of grey capsules appears on the right edge of the conversation (one capsule per turn). The rail is height-capped (60vh) and scrolls internally, so a very long conversation never pushes it past the viewport.
3. Hover a capsule to see the turn's index, timestamp, and user-message summary in a DSH tooltip (the capsule glows white and widens 150% — the two neighbours widen a little too, a wave ripple across the rail).
4. Click a capsule to jump to that turn's start; the target row briefly highlights.
5. Older history loads automatically — the rail fills its visible height first, and scrolling the rail to its top keeps loading earlier turns. No manual "Load earlier" clicks needed.

## How it works

The plugin registers **one additive slot** — **no DSH source code is modified**:

| Slot | Scope | Role |
|------|-------|------|
| `conversation.session.header.utilities` | session | The floating turn rail; reads `useSession` directly |

Because the rail is session-scoped, it reads the live `ConversationSnapshot` straight from the framework `useSession` kit and renders as `position: fixed` (so it does not occupy the header's flex row).

- **Turn extraction**: `chat.timeline.turnOrder` + `turns` map for boundaries; `chat.locations.getTurn(turn)` for each turn's node keys; the first `kind === 'user'` node's first text block for the summary; `turnTimings` for the timestamp. Turns without a user message fall back to their first node's kind.
- **Jump-to-turn**: locate the turn's first chat-node key, find the DOM row via `data-chat-anchor-key="<key>"`, compute its position in the `[data-conversation-scroll]` scrollport, and set `scrollTop` precisely (more predictable than `scrollIntoView`). If the target row is not yet rendered (older page not loaded), it auto-clicks the "Load earlier" button and retries until the row appears — no "scroll once first" friction.
- **Auto-load (stall-free)**: the conversation paginates its history — each page prepend re-renders the whole flow, so loading everything at once would stall the UI. The rail instead (a) slowly fills its visible height after open (slow cadence, back-pressure, page cap), then (b) keeps loading earlier turns while the rail is scrolled near its top — scroll-driven, the same way the conversation itself loads. Clicking a capsule also loads on demand to reach its turn. A shared busy-lock prevents the auto-load and scroll-load paths from ever clicking the paging button concurrently.

## Compatibility

- DeepSeek Harness (dsh) with the web client (`dsh web`).
- Requires the `conversation.session.header.utilities` slot declaration (present in current DSH).

## License

MIT
