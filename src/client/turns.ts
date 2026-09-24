/**
 * Turn extraction: derive a flat list of conversation turns from the
 * ConversationSnapshot, each carrying its turn number, the first user-message
 * summary, and a start timestamp.
 *
 * The snapshot shape is declared structurally here (not imported from the
 * runtime package) so the external bundle compiles without pulling the
 * runtime's merged types. At runtime the real ConversationSnapshot flows in
 * through the framework `useSession` hook and satisfies these structural
 * contracts.
 */

/** One ContentBlock narrowed to the text arm we read for summaries. */
interface TextBlock { type: 'text'; text: string }

/** A finalized user-message chat node. */
interface UserNode {
  kind: 'user'
  seq: number
  time: number
  content: readonly { type: string; text?: string }[]
}

/** A chat view node from the ChatSnapshot store (erased). */
interface ChatViewNode {
  readonly key: string
  readonly kind: string
  readonly data: unknown
}

/** ChatSnapshot structural contract (subset we read) — the value the new
 *  `useChat` session hook returns (0.1.2+ refactor: conversation data moved
 *  from `snapshot.chat` into the dedicated ChatSnapshot). */
export interface ChatSnapshotLike {
  readonly order: readonly string[]
  readonly nodes: { get(key: string): ChatViewNode | undefined }
  readonly locations: { getTurn(turn: number): readonly string[] }
  readonly timeline: {
    readonly turnOrder: readonly number[]
    readonly turns: ReadonlyMap<number, {
      readonly turn: number
      readonly start?: { time: number }
      readonly end?: { time: number }
      readonly status: string
    }>
  }
  /** New (0.1.2+) navigation projection: the loaded Turns the rail addresses. */
  readonly navigation?: {
    items(): readonly {
      readonly turn: number
      readonly anchorKey: string
      readonly prompt: string
      readonly response: string
    }[]
  }
  readonly legacy?: {
    readonly turnTimings?: ReadonlyMap<number, { readonly startTime: number; readonly endTime?: number }>
  }
}

/** Deprecated alias for the OLD pre-0.1.2 conversation snapshot (had `.chat`). */
export interface ConversationSnapshotLike {
  readonly chat: ChatSnapshotLike
  readonly turnTimings?: ReadonlyMap<number, { readonly startTime: number; readonly endTime?: number }>
}

/** One extracted turn for the navigation list. */
export interface TurnEntry {
  /** True turn number (from the timeline / turn-start event) — the UI label. */
  turn: number
  /** Position within THIS source's list (the merged rail list re-derives it). */
  index: number
  /** First ~80 chars of the first user message in this turn. */
  summary: string
  /** Full first user-message text (for tooltip / accessibility). */
  fullText: string
  /** Unix epoch ms from turnTimings or turn.start. */
  startTime: number | undefined
  /** Turn status from the timeline. */
  status: string
}

const SUMMARY_MAX_CHARS = 80

/**
 * Extract the text of the first `type: 'text'` content block from a node's
 * content array.
 */
function firstText(content: readonly { type: string; text?: string }[] | undefined): string {
  if (content === undefined) return ''
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') return block.text
  }
  return ''
}

/**
 * Derive the flat turn list from a chat snapshot.
 *
 * For each turn in `timeline.turnOrder`, the function looks up the turn's
 * chat-node keys via `locations.getTurn`, finds the first node whose `kind`
 * is `'user'`, and extracts the text summary from its content blocks. The
 * timestamp comes from `legacy.turnTimings` (preferred) or `turn.start.time`.
 *
 * Accepts BOTH the new (0.1.2+) ChatSnapshot (from `useChat`) and the legacy
 * `ConversationSnapshot` (which had a `.chat` field) — so an upgrade never
 * crashes if the host is still on the older shape.
 *
 * @param snap - the chat snapshot (structural subset).
 * @returns ordered turn entries (empty when the snapshot has no turns).
 */
export function extractTurns(snap: ChatSnapshotLike | ConversationSnapshotLike | undefined): TurnEntry[] {
  const chat = unwrapChat(snap)
  if (chat === undefined) return []
  const turnTimings = chat.legacy?.turnTimings
    ?? (snap !== undefined && 'turnTimings' in snap ? snap.turnTimings : undefined)

  // 0.1.2+: the loaded-Turn navigation projection is the rail's source of
  // truth (timeline only tracks the current/open turn). Legacy fallback:
  // timeline.turnOrder enumerates every window turn.
  const navItems = chat.navigation?.items?.() ?? []
  if (navItems.length > 0) {
    return navItems.map((item, index) => {
      const loc = chat.timeline.turns.get(item.turn)
      const status = loc?.status ?? 'closed'
      return {
        turn: item.turn,
        index: index + 1,
        summary: item.prompt || '(no user message)',
        fullText: item.prompt || '',
        startTime: turnTimings?.get(item.turn)?.startTime ?? loc?.start?.time,
        status,
      }
    })
  }

  const timeline = chat.timeline
  const turnOrder = timeline.turnOrder
  if (turnOrder.length === 0) return []

  const entries: TurnEntry[] = []
  let displayIndex = 0
  for (const turn of turnOrder) {
    displayIndex += 1
    const loc = timeline.turns.get(turn)
    const status = loc?.status ?? 'unknown'
    const startTime = turnTimings?.get(turn)?.startTime ?? loc?.start?.time

    // Find the first user-message node in this turn.
    let summary = ''
    let fullText = ''
    const keys = chat.locations.getTurn(turn)
    for (const key of keys) {
      const node = chat.nodes.get(key)
      if (node === undefined) continue
      if (node.kind === 'user') {
        const userData = node.data as UserNode | undefined
        if (userData !== undefined) {
          fullText = firstText(userData.content)
          summary = fullText.length > SUMMARY_MAX_CHARS
            ? `${fullText.slice(0, SUMMARY_MAX_CHARS - 1)}…`
            : fullText
        }
        break
      }
      // Fallback: this turn has no user message (e.g. an error/retry turn, a
      // context injection, or a compaction checkpoint). Show the first
      // node's kind + a short text peek so the entry is not a dead label.
      if (summary === '') {
        const peek = peekNodeText(node)
        fullText = peek
        summary = peek.length > SUMMARY_MAX_CHARS
          ? `${peek.slice(0, SUMMARY_MAX_CHARS - 1)}…`
          : peek
      }
    }

    entries.push({
      turn,
      index: displayIndex,
      summary: summary || `[${kindLabel(turn, keys, chat)}]`,
      fullText,
      startTime,
      status,
    })
  }
  return entries
}

/** Narrow either the new ChatSnapshot or the legacy `.chat`-wrapped snapshot to a chat. */
function unwrapChat(snap: ChatSnapshotLike | ConversationSnapshotLike | undefined): ChatSnapshotLike | undefined {
  if (snap === undefined) return undefined
  if ('chat' in snap && snap.chat !== undefined) return snap.chat
  return snap as ChatSnapshotLike
}

/** Best-effort text peek from a non-user chat node's data (erased shape). */
function peekNodeText(node: ChatViewNode): string {
  const data = node.data as Record<string, unknown> | undefined
  if (data === undefined) return ''
  for (const field of ['summary', 'text', 'content', 'message', 'name']) {
    const value = data[field]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
    if (Array.isArray(value)) {
      for (const block of value) {
        if (block !== null && typeof block === 'object') {
          const b = block as Record<string, unknown>
          if (typeof b.text === 'string' && b.text.trim().length > 0) return b.text.trim()
        }
      }
    }
  }
  return ''
}

/** Human label for a turn that has no readable first-node text. */
function kindLabel(turn: number, keys: readonly string[], chat: ChatSnapshotLike): string {
  const first = chat.nodes.get(keys[0] ?? '')
  const kind = first?.kind ?? 'turn'
  return `turn ${turn} (${kind})`
}

/**
 * Find the chat-node key of the first visible node in a given turn — the
 * scroll target for "jump to turn".
 *
 * @param snap - the conversation snapshot.
 * @param turn - the turn number to jump to.
 * @returns the first node key in that turn (typically the user message), or undefined.
 */
export function firstNodeKeyOfTurn(
  snap: ChatSnapshotLike | ConversationSnapshotLike | undefined,
  turn: number,
): string | undefined {
  const chat = unwrapChat(snap)
  if (chat === undefined) return undefined
  const keys = chat.locations.getTurn(turn)
  return keys[0]
}

/**
 * Reverse-lookup: given a chat-node key, find which turn it belongs to.
 *
 * Used by the scroll-follow highlight: the scroll listener finds the topmost
 * visible `[data-chat-anchor-key]` row, then this function maps its key back
 * to a turn number so the rail can highlight the matching entry.
 *
 * @param snap - the conversation snapshot.
 * @param key - the chat-node key from the DOM anchor.
 * @returns the owning turn number, or undefined if not found.
 */
export function turnOfNodeKey(
  snap: ChatSnapshotLike | ConversationSnapshotLike | undefined,
  key: string,
): number | undefined {
  const chat = unwrapChat(snap)
  if (chat === undefined) return undefined
  const { turnOrder, turns } = chat.timeline
  for (const turn of turnOrder) {
    const keys = chat.locations.getTurn(turn)
    if (keys.includes(key)) return turn
  }
  return undefined
}
