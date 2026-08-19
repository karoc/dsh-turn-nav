/**
 * Session-history reading: fetch the conversation's persisted history from the
 * HOST via the browser→host RPC `sessions.history`, and derive the full turn
 * list (turn number, timestamp, first user-message summary) WITHOUT rendering
 * anything into the conversation flow.
 *
 * This is the key to the rail's performance: the conversation flow is
 * windowed (only a page of events is materialized as DOM), and extending it
 * via `loadOlder` re-renders the whole flow — expensive on long sessions.
 * Reading history directly as data keeps the rail full (every turn, including
 * ones far outside the window) with zero DOM re-renders; the flow window is
 * only extended on demand, when a capsule is clicked.
 */

/** Structural subset of one wire history entry. */
export interface HistoryEventLike {
  type: string
  seq: number
  time: number
  data: { turn?: number; content?: readonly { type: string; text?: string }[]; [key: string]: unknown }
}

/** Structural subset of the history page response. */
export interface HistoryEntryLike {
  event: HistoryEventLike
}

/** Structural browser→host sessions API (subset we use). */
export interface HistoryApi {
  sessions: {
    history(payload: {
      sessionId: string
      beforeSeq?: number
      maxMessages?: number
    }): Promise<{
      result?: { ok: boolean; value?: { events: HistoryEntryLike[]; hasMore: boolean } }
      error?: { code: string; message?: string }
    }>
  }
}

/** One turn entry derived from history (same shape as window-derived entries). */
export interface HistoryTurn {
  turn: number
  index: number
  summary: string
  fullText: string
  startTime: number | undefined
  /** Seq of this turn's `turn/start` event — used to decide window inclusion. */
  startSeq: number | undefined
  status: string
}

const SUMMARY_MAX_CHARS = 80
/** Safety cap on history pages read (50 events each). */
const MAX_HISTORY_PAGES = 500

function firstText(content: readonly { type: string; text?: string }[] | undefined): string {
  if (content === undefined) return ''
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') return block.text
  }
  return ''
}

function truncate(text: string): string {
  return text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS - 1)}…` : text
}

/**
 * Read the full persisted history of a session and derive every turn.
 *
 * Pages are requested newest-first (a page walks back via `beforeSeq`); all
 * events are collected, sorted by seq ascending, then folded into turns.
 * `onPage` is called after each page with the turns derived so far (the rail
 * can render incrementally without waiting for the whole history).
 *
 * @param api - the browser→host sessions API.
 * @param sessionId - the session to read.
 * @param onPage - incremental callback (turns so far, in ascending turn order).
 */
export async function fetchAllTurns(
  api: HistoryApi,
  sessionId: string,
  onPage: (turns: HistoryTurn[]) => void,
): Promise<HistoryTurn[]> {
  const allEvents: HistoryEventLike[] = []
  let beforeSeq: number | undefined
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const response = await api.sessions.history({ sessionId, beforeSeq, maxMessages: 50 })
    if (response.result === undefined || response.result.ok !== true) break
    const value = response.result.value
    if (value === undefined) break
    const { events, hasMore } = value
    if (events.length === 0) break
    for (const entry of events) allEvents.push(entry.event)
    onPage(buildTurns(allEvents))
    if (!hasMore) break
    beforeSeq = events[0].event.seq
  }
  allEvents.sort((a, b) => a.seq - b.seq)
  const turns = buildTurns(allEvents)
  onPage(turns)
  return turns
}

/** Fold a (seq-ascending) event list into ordered turns. */
function buildTurns(events: readonly HistoryEventLike[]): HistoryTurn[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  const turns: HistoryTurn[] = []
  let current: { turn: number; startSeq: number; time: number; summary: string; fullText: string } | null = null
  for (const event of sorted) {
    switch (event.type) {
      case 'turn/start': {
        if (current !== null) turns.push(closeTurn(current))
        const turn = typeof event.data.turn === 'number' ? event.data.turn : NaN
        if (Number.isFinite(turn)) {
          current = { turn, startSeq: event.seq, time: event.time, summary: '', fullText: '' }
        }
        break
      }
      case 'turn/end': {
        if (current !== null && event.data.turn === current.turn) {
          turns.push(closeTurn(current))
          current = null
        }
        break
      }
      case 'user/message': {
        if (current !== null && current.summary === '') {
          const text = firstText(event.data.content)
          current.summary = truncate(text)
          current.fullText = text
          current.time = event.time
        }
        break
      }
      default:
        break
    }
  }
  if (current !== null) turns.push(closeTurn(current))
  turns.sort((a, b) => a.turn - b.turn)
  return turns.map((turn, i) => ({ ...turn, index: i + 1 }))
}

function closeTurn(t: { turn: number; startSeq: number; time: number; summary: string; fullText: string }): HistoryTurn {
  return {
    turn: t.turn,
    index: 0, // patched below in buildTurns
    summary: t.summary || '(no user message)',
    fullText: t.fullText,
    startTime: Number.isFinite(t.time) ? t.time : undefined,
    startSeq: t.startSeq,
    status: 'closed',
  }
}
