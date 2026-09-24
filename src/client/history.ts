/**
 * Session-history reading: fetch the conversation's persisted history as data
 * and derive the full turn list (turn number, timestamp, first user-message
 * summary) WITHOUT rendering anything into the conversation flow. Two channels:
 * the 0.1.2+ journal (`ctx.remote.session.page` — {@link fetchJournalTurns})
 * and the legacy browser→host RPC `sessions.history` ({@link fetchAllTurns}).
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

/** Structural browser→host sessions API (subset we use). `sessions.history`
 *  may be absent on newer dsh where the RPC moved — treated as "no full
 *  history" (window-only fallback). */
export interface HistoryApi {
  sessions?: {
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

// ---------------------------------------------------------------------------
// 0.1.2+ journal channel: the Typert Remote `session/page` endpoint. On dsh
// 0.1.2+ the old browser→host `sessions.history` RPC was removed along with
// `connection.api`; its equivalent lives in the mounted `ctx.remote.session`
// namespace (assembled by `@deepseek-ai/dsh-api-remotes/client`). Reading the
// journal pages the SAME persisted log the official window uses, as plain
// data — zero prepends into the conversation flow.
// ---------------------------------------------------------------------------

/** Wire event (structural subset of `SessionWireEvent`). */
export interface JournalWireEvent {
  type: string
  seq: number
  time: number
  data: { turn?: number; content?: readonly { type: string; text?: string }[]; [key: string]: unknown }
}

/** One journal record: a raw event or a packed assistant chunk run. */
export type JournalRecord =
  | { type: 'event'; event: JournalWireEvent }
  | { type: 'chunks'; event: { type: string; seq: number; time: number; data: unknown } }

/** `session/page` request (structural `SessionPageRequest`). */
export interface JournalPageRequest {
  address: { kind: 'session'; sessionId: string }
  throughSeq: number
  beforeSeq?: number
  maxMessages?: number
}

/** `session/page` response (structural `RemoteResult<SessionPage>`). */
export interface JournalPageResult {
  ok: boolean
  value?: { records: JournalRecord[]; hasMore: boolean }
  error?: { code: string; message: string }
}

/** The mounted `ctx.remote.session` namespace face (structural subset). */
export interface JournalHandle {
  page(request: JournalPageRequest, signal?: AbortSignal): Promise<JournalPageResult>
}

/** The official session store face (structural subset of `ctx.sessions`). */
export interface SessionAccessHandle {
  /** Oldest/newest event seq of the loaded window, when one exists. */
  windowSeq(sessionId: string): { firstSeq: number | undefined; lastSeq: number | undefined }
  /** Whether older history remains outside the loaded window (authoritative). */
  hasMore(sessionId: string): boolean
  /** Pull one older page into the official window; resolves false on failure/unavailable. */
  loadOlder(sessionId: string): Promise<boolean>
}

const SUMMARY_MAX_CHARS = 80
/** Safety cap on history pages read (50 events each). */
const MAX_HISTORY_PAGES = 500
/** Journal page size in MESSAGES (user/assistant count) — no host cap, fewer round trips. */
const JOURNAL_PAGE_MESSAGES = 200
/** Safety cap on journal pages read. */
const MAX_JOURNAL_PAGES = 100

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
  api: HistoryApi | undefined,
  sessionId: string,
  onPage: (turns: HistoryTurn[]) => void,
): Promise<HistoryTurn[]> {
  if (api === undefined || typeof api.sessions?.history !== 'function') {
    // eslint-disable-next-line no-console
    console.warn('[dsh-turn-nav] sessions.history RPC unavailable — falling back to window-only turns')
    return []
  }
  const allEvents: HistoryEventLike[] = []
  let beforeSeq: number | undefined
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const response = await api.sessions.history({ sessionId, beforeSeq, maxMessages: 50 })
    if (response.result === undefined || response.result.ok !== true) {
      // eslint-disable-next-line no-console
      console.warn('[dsh-turn-nav] sessions.history page failed', response.error?.code ?? 'no result')
      break
    }
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

/**
 * Read the FULL persisted history through the 0.1.2+ journal channel
 * (`ctx.remote.session.page`), newest page first, walking back via `beforeSeq`
 * until `hasMore` is false. Only events BELOW the loaded window are fetched
 * (the window itself already covers the tail), so the conversation flow is
 * never touched — this is what keeps very long sessions responsive.
 *
 * Returns `undefined` when the journal channel is unavailable (older dsh), so
 * the caller can fall back to the legacy `sessions.history` RPC or to
 * window-only turns.
 *
 * @param journal - the mounted journal namespace face, or undefined.
 * @param sessionId - the session to read.
 * @param window - oldest/newest event seq of the currently loaded window.
 * @param onPage - incremental callback (turns derived so far, ascending).
 * @param signal - optional caller cancellation.
 */
export async function fetchJournalTurns(
  journal: JournalHandle | undefined,
  sessionId: string,
  window: { firstSeq: number | undefined; lastSeq: number | undefined },
  onPage: (turns: HistoryTurn[]) => void,
  signal?: AbortSignal,
): Promise<HistoryTurn[] | undefined> {
  if (journal === undefined || typeof journal.page !== 'function') return undefined
  // No window, or the window already starts at the log's first event: nothing
  // older exists to read (the window covers it).
  if (window.lastSeq === undefined || window.firstSeq === 0) return []
  const before0 = window.firstSeq !== undefined && window.firstSeq > 0 ? window.firstSeq - 1 : undefined
  if (before0 === undefined) return []

  const allEvents: HistoryEventLike[] = []
  let beforeSeq = before0
  for (let page = 0; page < MAX_JOURNAL_PAGES; page += 1) {
    if (signal?.aborted) break
    const result = await journal.page({
      address: { kind: 'session', sessionId },
      throughSeq: window.lastSeq,
      beforeSeq,
      maxMessages: JOURNAL_PAGE_MESSAGES,
    }, signal)
    if (!result.ok || result.value === undefined) {
      // eslint-disable-next-line no-console
      console.warn('[dsh-turn-nav] session/page failed', result.error?.code ?? 'no result')
      break
    }
    const { records, hasMore } = result.value
    if (records.length === 0) break
    for (const record of records) {
      if (record.type === 'event') allEvents.push(record.event)
    }
    onPage(buildTurns(allEvents))
    if (!hasMore) break
    let minSeq = Infinity
    for (const record of records) minSeq = Math.min(minSeq, record.event.seq)
    if (!Number.isFinite(minSeq)) break
    beforeSeq = minSeq
  }
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
