/**
 * Turn navigation rail: a vertical "piano-key" rail floating on the right
 * edge of the conversation. One capsule per turn, stacked vertically.
 * Hovering a capsule makes it glow with the theme color and widen (a wave
 * ripple) and shows the full turn info in a tooltip; clicking a capsule jumps
 * the conversation to that turn's start.
 *
 * Registered into `conversation.session.header.utilities` (session scope), so
 * this component reads the live `ConversationSnapshot` via `useSession`.
 *
 * DATA & PERFORMANCE: the rail's turn list is read from the HOST through the
 * `sessions.history` browser→host RPC — every persisted turn (including ones
 * far outside the conversation's window) is shown as plain data, with ZERO
 * prepends into the conversation flow. The flow window is only extended
 * (via the "Load earlier" paging button) on demand, when a capsule is
 * clicked to jump to a turn that is not yet in the window. This keeps a very
 * long conversation (hundreds of turns) responsive: opening it never re-
 * renders the flow, and jumping loads only what is needed to reach the target.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDownOutline14, IconChevronUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { extractTurns, firstNodeKeyOfTurn, turnOfNodeKey, type ChatSnapshotLike, type ConversationSnapshotLike } from './turns.ts'
import {
  fetchAllTurns,
  fetchJournalTurns,
  type HistoryApi,
  type HistoryTurn,
  type JournalHandle,
  type SessionAccessHandle,
} from './history.ts'
import { getRailMode, subscribeRailMode } from './mode.ts'
import type { TurnNavKey } from './locales.ts'

/** Display entry for the rail (covers both history-derived and window-derived turns). */
export interface RailTurn {
  turn: number
  index: number
  summary: string
  fullText: string
  startTime: number | undefined
  status: string
}

/** Structural session-standard props (session scope, framework-injected).
 *  0.1.2+ split the conversation data out of `useSession` into `useChat`:
 *  `useSession` now yields SessionSnapshot (lifecycle fields), `useChat`
 *  yields ChatSnapshot (the turn data we read). We type `useSession` loosely
 *  (it is only used as a legacy fallback on older dsh where it carried the
 *  old `.chat`-wrapped snapshot) and read turn data from `useChat`. */
interface SessionStandardProps {
  useSession?: <T,>(selector: (snapshot: unknown) => T) => T
  useChat?: <T,>(selector: (chat: ChatSnapshotLike) => T) => T
  sessionId?: string
}

/** Injected face from the registration. */
export interface RailInjected {
  t: (key: TurnNavKey, params?: Record<string, unknown>) => string
  /** The browser→host sessions API (pre-0.1.2), used to read history as data. */
  api?: HistoryApi
  /** The 0.1.2+ Typert Remote `session/page` channel (full-history journal). */
  journal?: JournalHandle
  /** The official session store face (window seqs, hasMore, loadOlder). */
  sessionAccess?: SessionAccessHandle
}

/** Full props of the rail component. */
export type RailProps = SessionStandardProps & RailInjected

/** Scrollport selector: the active conversation's scroll container. */
const SCROLL_SELECTOR = '[data-conversation-scroll]'
/** Chat row anchor attribute: each rendered row carries its node key. */
const ANCHOR_ATTR = 'data-chat-anchor-key'
/** CSS class for the jump highlight flash. */
const HIGHLIGHT_CLASS = 'tn-jump-highlight'

/** Delay between loadOlder clicks while expanding the window to a clicked turn. */
const LOAD_RENDER_SETTLE_MS = 900
/** Cap on pages loaded while expanding the window to a clicked turn. */
const MAX_JUMP_PAGES = 100
/** Bounded wait for the official session binding/window to appear on mount. */
const JOURNAL_BINDING_WAIT_MS = 15000
/** Extra vertical margin when scrolling a target row into view. */
const JUMP_MARGIN_PX = 16

/** Localized "Load earlier" paging button labels — idle AND in-flight. */
const LOAD_OLDER_TEXTS = new Set([
  '加载更早', 'Load earlier', 'Load earlier…',
  '加载中', '加载中…', 'Loading', 'Loading…',
])

function isLoadOlderButton(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').trim()
  return LOAD_OLDER_TEXTS.has(text)
}

/** Find the scrollport (the conversation's scroll container). */
function findScrollport(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(SCROLL_SELECTOR) ?? undefined
}

/** Find the "Load earlier" paging button, or null (absent / mid-flight). */
function findLoadOlderButton(): HTMLButtonElement | null {
  const scrollport = findScrollport()
  if (scrollport === undefined) return null
  const candidates = scrollport.querySelectorAll<HTMLButtonElement>('button')
  for (const btn of candidates) {
    if (isLoadOlderButton(btn)) return btn
  }
  return null
}

/** Promise-based sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/** Keep the jump-feedback bubble inside the viewport vertically. */
function clampFeedbackY(y: number): number {
  return Math.max(24, Math.min(y, window.innerHeight - 24))
}

/** Tooltip body for one turn: turn number, time, full summary. */
function tooltipText(entry: RailTurn, t: (key: TurnNavKey, params?: Record<string, unknown>) => string): string {
  const time = formatTime(entry.startTime)
  // The label is the TRUE turn number (`entry.turn`), not a list position:
  // window-only extras carry a window-local index (restarting at 1), which
  // made merged lists show e.g. "第 38 轮" followed by "第 2 轮".
  const label = t('turnLabel', { n: String(entry.turn) })
  const body = entry.fullText || entry.summary || t('noSummary')
  const lines = [label]
  if (time !== '') lines.push(time)
  lines.push(body)
  return lines.join('\n')
}

/** Short HH:MM from a Unix-epoch-ms timestamp. */
function formatTime(ms: number | undefined): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return ''
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * The piano-key rail. Session scope: reads the conversation snapshot directly
 * and renders a floating vertical capsule per turn (full history read from
 * the host as data; the flow window is extended only on click-to-jump).
 */
export function TurnNavRail({ useSession, useChat, sessionId, t, api, journal, sessionAccess }: RailProps) {
  // New (0.1.2+): conversation data comes from `useChat` (ChatSnapshot).
  // Legacy fallback: on older dsh `useSession` returned the old `.chat`-wrapped
  // snapshot — typed loosely here, narrowed by unwrapChat at read time.
  const legacySession = useSession?.((s: unknown) => s) as ConversationSnapshotLike | undefined
  const chat = useChat?.((c: ChatSnapshotLike) => c)
  // Latest chat for async handlers (click-to-jump reads it after loads).
  const chatRef = useRef<ChatSnapshotLike | ConversationSnapshotLike | undefined>(chat ?? legacySession)
  chatRef.current = chat ?? legacySession

  // Turns currently in the conversation window (transitional + latest turns).
  const windowTurns = useMemo(() => extractTurns(chat ?? legacySession), [chat, legacySession])
  // Full turn list read from the host history (incremental).
  const [historyTurns, setHistoryTurns] = useState<HistoryTurn[]>([])
  const [hoverIndex, setHoverIndex] = useState(-1)
  const [hoverY, setHoverY] = useState(0)
  const [tipTop, setTipTop] = useState(0)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  // On-demand jump feedback: which turn is being located (or failed), and the
  // vertical position to anchor the feedback bubble next to.
  const [jumpState, setJumpState] = useState<{ turn: number; y: number; phase: 'loading' | 'error' } | null>(null)
  // Whether the built-in (official) TurnNavigator rail is VISIBLE in the
  // transcript. When it is, we nudge our rail to the header zone to avoid
  // overlapping it — unless the user chose the "DSH STN" mode, whose stylesheet
  // override hides the official rail (the visibility check below then reports
  // false and we stay centered). The check is scoped to the conversation
  // scroll container because our own rail is fixed OUTSIDE it, and it uses the
  // COMPUTED display value so the stylesheet override is respected.
  const [officialRail, setOfficialRail] = useState(false)
  const railRef = useRef<HTMLDivElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const hoverScrollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // True while the pointer is over the rail — the auto-follow scroll must
  // never yank the rail away while the user is browsing it.
  const pointerOverRailRef = useRef(false)

  // Detect the official in-chat TurnNavigator rail so we can avoid overlapping
  // it. Re-checks on an interval + a MutationObserver on the transcript.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const check = (): void => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      const nav = scroll === null
        ? null
        : scroll.querySelector<HTMLElement>('nav[aria-label*="轮次"], nav[aria-label*="Turn navigation"]')
      const visible = nav !== null && getComputedStyle(nav).display !== 'none'
      setOfficialRail((prev) => prev === visible ? prev : visible)
    }
    check()
    timer = setInterval(check, 1500)
    const scroll = document.querySelector('[data-conversation-scroll]')
    const observer = scroll !== null && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(check)
      : null
    if (observer !== null && scroll !== null) observer.observe(scroll, { childList: true, subtree: true })
    return () => {
      if (timer !== null) clearInterval(timer)
      observer?.disconnect()
    }
  }, [])

  // Read the full persisted history from the HOST as DATA (no prepends into
  // the flow — this is what keeps long sessions responsive). Incremental
  // callback fills the rail page by page. Channel priority:
  //   1. 0.1.2+ journal (`ctx.remote.session.page` — reads only the region
  //      below the loaded window, never touching the conversation flow);
  //   2. legacy `sessions.history` RPC (pre-0.1.2 hosts);
  //   3. none — window-only turns (navigation projection).
  useEffect(() => {
    if (sessionId === undefined) return
    let cancelled = false
    const applyPage = (turns: HistoryTurn[]): void => { if (!cancelled) setHistoryTurns(turns) }
    const run = async (): Promise<void> => {
      // The official session binding (and its event window) is staged a moment
      // after the conversation view mounts; wait for it (bounded) so the
      // journal can read the window's seq bounds instead of silently skipping.
      let window = sessionAccess?.windowSeq(sessionId) ?? { firstSeq: undefined, lastSeq: undefined }
      if (sessionAccess !== undefined) {
        const deadline = Date.now() + JOURNAL_BINDING_WAIT_MS
        while (window.lastSeq === undefined && Date.now() < deadline) {
          await sleep(300)
          if (cancelled) return
          window = sessionAccess.windowSeq(sessionId)
        }
      }
      const journalTurns = await fetchJournalTurns(journal, sessionId, window, applyPage)
      if (cancelled) return
      if (journalTurns !== undefined) { setHistoryTurns(journalTurns); return }
      if (api !== undefined) {
        await fetchAllTurns(api, sessionId, applyPage).then((finalTurns) => {
          if (!cancelled) setHistoryTurns(finalTurns)
        })
      }
    }
    void run()
    return () => { cancelled = true }
  }, [api, journal, sessionAccess, sessionId])

  // Rail display mode (settings → Turn navigation): 'stn' shows us (and hides
  // the official rail via the stylesheet override), 'official'/'hidden' hide us.
  const railMode = useSyncExternalStore(subscribeRailMode, getRailMode)

  // Display list: full history, plus any window-only (latest, still-running)
  // turns not yet persisted, ordered by turn number. The merged list
  // re-derives `index` as the list position — sources assign it over their
  // OWN subset (history pages start at 1, window extras restart at 1), so a
  // raw merge leaves duplicate/wrong indices.
  const turns = useMemo<RailTurn[]>(() => {
    if (historyTurns.length === 0) return windowTurns
    const historySet = new Set(historyTurns.map((entry) => entry.turn))
    const extras = windowTurns.filter((entry) => !historySet.has(entry.turn))
    return [...historyTurns, ...extras]
      .sort((a, b) => a.turn - b.turn)
      .map((entry, i) => ({ ...entry, index: i + 1 }))
  }, [historyTurns, windowTurns])

  // Follow-scroll active turn: the turn owning the reading line (top of the
  // visible transcript + a small inset), re-evaluated on scroll via rAF.
  const [activeTurn, setActiveTurn] = useState<number | null>(null)
  useEffect(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    if (scroll === null) return
    let frame: number | null = null
    const compute = (): void => {
      frame = null
      const scrollport = document.querySelector('[data-conversation-scroll]')
      if (scrollport === null) return
      const rect = scrollport.getBoundingClientRect()
      const readingLine = rect.top + Math.min(96, rect.height * 0.2)
      const rows = Array.from(scrollport.querySelectorAll<HTMLElement>('[data-chat-anchor-key]'))
      let row: HTMLElement | null = null
      for (const r of rows) {
        const rr = r.getBoundingClientRect()
        if (rr.bottom > readingLine && rr.top < rect.bottom) { row = r; break }
      }
      const key = row?.getAttribute('data-chat-anchor-key') ?? null
      if (key !== null) {
        setActiveTurn(turnOfNodeKey(chatRef.current, key) ?? null)
      } else if (rows.length > 0) {
        setActiveTurn(null)
      }
    }
    const schedule = (): void => {
      if (frame !== null) return
      frame = requestAnimationFrame(compute)
    }
    scroll.addEventListener('scroll', schedule, { passive: true })
    // also when turns change (new content)
    schedule()
    return () => {
      scroll.removeEventListener('scroll', schedule)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [turns.length])

  // Auto-follow for the RAIL's own viewport: keep the active turn's capsule
  // visible. The rail is capped at 30vh with an internal scrollbar, so in a
  // long session the active capsule routinely sits outside the rail's visible
  // band (e.g. on open the capsule list starts at the top while the reading
  // position is at the tail). Whenever the active capsule is not fully
  // visible, scroll it into view (centered, matching click behavior) — unless
  // the pointer is over the rail, in which case the user is browsing it and
  // we never yank it away.
  useEffect(() => {
    if (activeTurn === null || pointerOverRailRef.current) return
    const index = turns.findIndex((entry) => entry.turn === activeTurn)
    if (index < 0) return
    const rail = railRef.current
    if (rail === null) return
    const btn = rail.querySelectorAll<HTMLElement>('.tn-cap-btn')[index]
    if (btn === undefined) return
    const railRect = rail.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    if (btnRect.top >= railRect.top && btnRect.bottom <= railRect.bottom) return
    centerCapsule(index)
  }, [activeTurn, turns])

  // Track whether there is more content above/below the rail's viewport, to
  // enable/disable the scroll buttons.
  useEffect(() => {
    const rail = railRef.current
    if (rail === null) return
    const update = (): void => {
      setCanScrollUp(rail.scrollTop > 2)
      setCanScrollDown(rail.scrollTop < rail.scrollHeight - rail.clientHeight - 2)
    }
    update()
    rail.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(rail)
    return () => {
      rail.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [turns.length])

  const hoverEntry = hoverIndex >= 0 ? turns[hoverIndex] : undefined

  // Position the tooltip bubble vertically centered on the hovered capsule,
  // clamped so the WHOLE bubble stays inside the viewport.
  useEffect(() => {
    if (hoverEntry === undefined) return
    const tip = tipRef.current
    if (tip === null) return
    const h = tip.offsetHeight
    setTipTop(Math.max(8, Math.min(hoverY - h / 2, window.innerHeight - h - 8)))
  }, [hoverEntry, hoverY])

  // Stop any hover-driven auto-scroll on unmount.
  useEffect(() => () => stopHoverScroll(), [])

  // Hover-driven auto-scroll on the up/down buttons.
  const startHoverScroll = (dir: 1 | -1): void => {
    stopHoverScroll()
    const rail = railRef.current
    if (rail === null) return
    const step = () => {
      const r = railRef.current
      if (r === null) return
      if (dir < 0 && r.scrollTop <= 2) { stopHoverScroll(); return }
      if (dir > 0 && r.scrollTop >= r.scrollHeight - r.clientHeight - 2) { stopHoverScroll(); return }
      r.scrollBy({ top: dir * 24 })
    }
    step()
    hoverScrollRef.current = setInterval(step, 120)
  }

  function stopHoverScroll(): void {
    if (hoverScrollRef.current !== null) {
      clearInterval(hoverScrollRef.current)
      hoverScrollRef.current = null
    }
  }

  // Center the activated capsule in the rail (except first/last).
  const centerCapsule = (index: number): void => {
    const rail = railRef.current
    if (rail === null) return
    const btn = rail.querySelectorAll<HTMLElement>('.tn-cap-btn')[index]
    if (btn === undefined) return
    const railRect = rail.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    const contentTop = railRect.top - rail.scrollTop
    const btnContentTop = btnRect.top - contentTop
    const target = btnContentTop - (rail.clientHeight - btnRect.height) / 2
    rail.scrollTop = Math.max(0, target)
  }

  // Expand the conversation window until a given turn is inside it, then jump.
  // This is the ONLY path that prepends into the flow — it runs on demand,
  // only when the user clicks a capsule for a turn outside the window.
  // Resolves true on success (scrolled + highlighted), false if the target
  // could not be reached.
  const jumpToTurn = async (turn: number): Promise<boolean> => {
    const scrollport = findScrollport()
    if (scrollport === undefined) return false

    // Jumping to the OLDEST turn must load history to the very beginning
    // (hasMore false) — otherwise the window can include the target's boundary
    // while earlier (non-turn or older) events are still pending, and the user
    // lands before the true first turn with a "Load earlier" button remaining.
    const isOldest = turns[0]?.turn === turn

    // Scroll the target row into view and flash it.
    const scrollToRow = (row: HTMLElement): void => {
      const targetTop = row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop
      scrollport.scrollTop = Math.max(0, targetTop - JUMP_MARGIN_PX)
      row.classList.add(HIGHLIGHT_CLASS)
      setTimeout(() => row.classList.remove(HIGHLIGHT_CLASS), 1500)
    }

    // Wait (bounded) for the target turn's first row to materialize in the DOM
    // after a page load — polls the live chat snapshot for the turn's node key
    // instead of a fixed sleep, so fast renders jump immediately.
    const waitForRow = async (timeoutMs: number): Promise<HTMLElement | null> => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const snap = chatRef.current
        const key = snap === undefined ? undefined : firstNodeKeyOfTurn(snap, turn)
        if (key !== undefined) {
          const row = scrollport.querySelector<HTMLElement>(`[${ANCHOR_ATTR}="${CSS.escape(key)}"]`)
          if (row !== null) return row
        }
        await sleep(80)
      }
      return null
    }

    // "Is the target renderable now, and are we done for the oldest turn?"
    const settled = (row: HTMLElement | null): boolean => {
      if (row === null) return false
      if (!isOldest) return true
      const more = sessionAccess !== undefined ? sessionAccess.hasMore(sessionId ?? '') : findLoadOlderButton() !== null
      return !more
    }

    for (let i = 0; i < MAX_JUMP_PAGES; i += 1) {
      const snap = chatRef.current
      const key = snap === undefined ? undefined : firstNodeKeyOfTurn(snap, turn)
      const row = key === undefined
        ? null
        : scrollport.querySelector<HTMLElement>(`[${ANCHOR_ATTR}="${CSS.escape(key)}"]`)

      if (settled(row)) {
        scrollToRow(row as HTMLElement)
        return true
      }

      // Preferred path (0.1.2+): pull one page through the official session
      // store. The store pages by the window's own first seq and publishes the
      // enlarged window synchronously; we then poll for the target row.
      if (sessionAccess !== undefined) {
        if (!sessionAccess.hasMore(sessionId ?? '')) {
          // No more history and the target is still absent: unreachable.
          if (row !== null) { scrollToRow(row); return true }
          return false
        }
        try {
          await sessionAccess.loadOlder(sessionId ?? '')
        } catch {
          return row !== null ? (scrollToRow(row), true) : false
        }
        const awaited = await waitForRow(LOAD_RENDER_SETTLE_MS)
        if (awaited !== null && settled(awaited)) {
          scrollToRow(awaited)
          return true
        }
        // Row not (yet) rendered or oldest-turn still pending: keep paging.
        continue
      }

      // Fallback (older hosts / no session store): click the flow's own
      // "Load earlier" button.
      const btn = findLoadOlderButton()
      if (btn === null) {
        if (row !== null) { scrollToRow(row); return true }
        return false
      }
      if (btn.disabled) { await sleep(150); continue }
      btn.click()
      await sleep(LOAD_RENDER_SETTLE_MS)
    }
    return false
  }

  // Click handler: give immediate feedback (capsule pulse + "locating…"
  // bubble), run the (possibly multi-page) jump, then clear or report failure.
  const handleCapsuleClick = (turn: number, index: number, e: ReactMouseEvent): void => {
    centerCapsule(index)
    const y = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2
    setJumpState({ turn, y, phase: 'loading' })
    void jumpToTurn(turn).then((ok) => {
      if (ok) {
        setJumpState(null)
      } else {
        setJumpState({ turn, y, phase: 'error' })
        setTimeout(() => setJumpState(null), 2500)
      }
    })
  }

  if (turns.length === 0 || railMode !== 'stn') return null

  return (
    <div
      className={`tn-wrap${officialRail ? ' tn-nudge' : ''}`}
      role="navigation"
      aria-label={t('rail')}
      onMouseEnter={() => { pointerOverRailRef.current = true }}
      onMouseLeave={() => { pointerOverRailRef.current = false; setHoverIndex(-1); stopHoverScroll() }}
    >
      {/* Scroll-up control at the top of the rail. */}
      <button
        type="button"
        className="tn-scroll-btn"
        aria-label="scroll rail up"
        disabled={!canScrollUp}
        onClick={() => scrollRail(railRef.current, -1)}
        onMouseEnter={() => { if (canScrollUp) startHoverScroll(-1) }}
        onMouseLeave={stopHoverScroll}
      >
        <IconChevronUpOutline14 size={12} />
      </button>
      <div ref={railRef} className="tn-rail">
        {turns.map((entry, i) => {
          const dist = hoverIndex === -1 ? Infinity : Math.abs(i - hoverIndex)
          const cls = dist === 0 ? ' tn-cap-hot' : dist === 1 ? ' tn-cap-warm' : ''
          const loading = jumpState !== null && jumpState.phase === 'loading' && jumpState.turn === entry.turn
          const isActive = activeTurn === entry.turn
          return (
            <button
              key={entry.turn}
              type="button"
              className={`tn-cap-btn${cls}${loading ? ' tn-loading' : ''}${isActive ? ' tn-cap-active' : ''}`}
              onMouseEnter={(e) => {
                setHoverIndex(i)
                const rect = e.currentTarget.getBoundingClientRect()
                setHoverY(rect.top + rect.height / 2)
              }}
              onClick={(e) => handleCapsuleClick(entry.turn, i, e)}
              aria-label={tooltipText(entry, t).replace(/\n/g, ' — ')}
            >
              <span className="tn-cap" />
            </button>
          )
        })}
      </div>
      {/* Scroll-down control at the bottom of the rail. */}
      <button
        type="button"
        className="tn-scroll-btn"
        aria-label="scroll rail down"
        disabled={!canScrollDown}
        onClick={() => scrollRail(railRef.current, 1)}
        onMouseEnter={() => { if (canScrollDown) startHoverScroll(1) }}
        onMouseLeave={stopHoverScroll}
      >
        <IconChevronDownOutline14 size={12} />
      </button>
      {/* On-demand jump feedback: "locating turn N…" bubble next to the clicked
          capsule while the window is being extended, or a brief failure notice.
          Portal to body so it stays viewport-fixed. */}
      {jumpState !== null && createPortal(
        <div
          className={`tn-jump-feedback${jumpState.phase === 'error' ? ' tn-jump-error' : ''}`}
          style={{ top: clampFeedbackY(jumpState.y) }}
          role="status"
          aria-live="polite"
        >
          {jumpState.phase === 'loading'
            ? t('locatingTurn', { n: String(jumpState.turn) })
            : t('locateFailed', { n: String(jumpState.turn) })}
        </div>,
        document.body,
      )}
      {/* Custom tooltip bubble anchored to the LEFT of the rail. Rendered via
          a portal to document.body so it stays position:fixed relative to the
          VIEWPORT — being a child of .tn-wrap (which has a transform) would
          make the wrapper the containing block and misplace it. */}
      {hoverEntry !== undefined && createPortal(
        <div ref={tipRef} className="tn-tip" style={{ top: tipTop }} role="tooltip">
          {tooltipText(hoverEntry, t)}
        </div>,
        document.body,
      )}
    </div>
  )
}

/** Scroll the rail by roughly one viewport-height (smooth). */
function scrollRail(rail: HTMLDivElement | null, dir: 1 | -1): void {
  if (rail === null) return
  const step = Math.max(60, rail.clientHeight * 0.8)
  rail.scrollBy({ top: dir * step, behavior: 'smooth' })
}
