# dsh-turn-nav

An external [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that adds a **turn navigation drawer** to the conversation interface — so you can see every turn at a glance, jump to any turn's start, and know which turn you're currently reading.

## Why

In the default DSH web UI, finding a specific turn in a long conversation means scrolling — a lot. There's no overview of how many turns happened, what each turn was about, or where the current scroll position sits. `dsh-turn-nav` solves this:

- A **trigger pill** in the session header shows the turn count.
- Clicking it opens a **right-side drawer** listing every turn with its index, the user's message summary, and a timestamp.
- Clicking a turn **scrolls the conversation** to that turn's start and briefly highlights it.
- The **current turn follows** as you scroll the conversation — the matching list item highlights automatically.

## Installation

```sh
dsh plugin --profile web add dsh-turn-nav
```

Then restart `dsh web`:

```sh
dsh web
```

## Usage

1. Open any conversation with at least one completed turn.
2. A "轮次 / Turns" pill with a count appears in the session header's right side.
3. Click it to open the drawer. Click any turn to jump to it. Scroll the conversation and the drawer highlights your current turn.
4. Click the pill again or the drawer's close button to dismiss.

## How it works

The plugin registers two additive slots — **no DSH source code is modified**:

| Slot | Scope | Role |
|------|-------|------|
| `conversation.session.header.utilities` | session | Trigger pill; reads `useSession` to extract turns |
| `shell.overlay` | root | Right-side drawer; reads turns via a module-level relay |

The session-scope trigger has access to `useSession` (the live `ConversationSnapshot`); it extracts the turn list from `chat.timeline.turnOrder` + `turnTimings` and publishes it to a module-level observable store. The root-scope drawer reads that store via `useSyncExternalStore` and renders the list.

Jump-to-turn locates the turn's first chat-node key via `chat.locations.getTurn(turn)`, finds the DOM element with `data-chat-anchor-key="<key>"`, and calls `scrollIntoView`. The scroll-follow listener finds the topmost visible `[data-chat-anchor-key]` row and reverse-maps it to a turn number.

## Compatibility

- DeepSeek Harness (dsh) with the web client (`dsh web`).
- Requires `conversation.session.header.utilities` and `shell.overlay` slot declarations (present in current DSH).

## License

MIT
