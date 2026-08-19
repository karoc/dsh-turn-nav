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

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDownOutline14, IconChevronUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { extractTurns, firstNodeKeyOfTurn, type ConversationSnapshotLike } from './turns.ts'
import { fetchAllTurns, type HistoryApi, type HistoryTurn } from './history.ts'
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

/** Structural session-standard props (session scope, framework-injected). */
interface SessionStandardProps {
  useSession?: <T,>(selector: (snapshot: ConversationSnapshotLike) => T) => T
  sessionId?: string
}

/** Injected face from the registration. */
export interface RailInjected {
  t: (key: TurnNavKey, params?: Record<string, unknown>) => string
  /** The browser→host sessions API, used to read history as data. */
  api?: HistoryApi
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

/** Tooltip body for one turn: index, time, full summary. */
function tooltipText(entry: RailTurn, t: (key: TurnNavKey, params?: Record<string, unknown>) => string): string {
  const time = formatTime(entry.startTime)
  const label = t('turnLabel', { n: String(entry.index) })
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
export function TurnNavRail({ useSession, sessionId, t, api }: RailProps) {
  const snapshot = useSession?.((s: ConversationSnapshotLike) => s)
  // Latest snapshot for async handlers (click-to-jump reads it after loads).
  const snapshotRef = useRef<ConversationSnapshotLike | undefined>(snapshot)
  snapshotRef.current = snapshot

  // Turns currently in the conversation window (transitional + latest turns).
  const windowTurns = useMemo(() => extractTurns(snapshot), [snapshot])
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
  const railRef = useRef<HTMLDivElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const hoverScrollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Read the full persisted history from the host as DATA (no prepends into
  // the flow — this is what keeps long sessions responsive). Incremental
  // callback fills the rail page by page.
  useEffect(() => {
    if (api === undefined || sessionId === undefined) return
    let cancelled = false
    void fetchAllTurns(api, sessionId, (pageTurns) => {
      if (!cancelled) setHistoryTurns(pageTurns)
    }).then((finalTurns) => {
      if (!cancelled) setHistoryTurns(finalTurns)
    })
    return () => { cancelled = true }
  }, [api, sessionId])

  // Display list: full history, plus any window-only (latest, still-running)
  // turns not yet persisted, ordered by turn number.
  const turns = useMemo<RailTurn[]>(() => {
    if (historyTurns.length === 0) return windowTurns
    const historySet = new Set(historyTurns.map((entry) => entry.turn))
    const extras = windowTurns.filter((entry) => !historySet.has(entry.turn))
    return [...historyTurns, ...extras].sort((a, b) => a.turn - b.turn)
  }, [historyTurns, windowTurns])

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

    // Ensure the target turn is inside the window (extend if not).
    const inWindow = snapshotRef.current?.chat.timeline.turnOrder.includes(turn) === true
    if (!inWindow) {
      let extended = false
      for (let i = 0; i < MAX_JUMP_PAGES; i += 1) {
        const snap = snapshotRef.current
        if (snap !== undefined && snap.chat.timeline.turnOrder.includes(turn)) { extended = true; break }
        const btn = findLoadOlderButton()
        if (btn === null) break // no more history — target unreachable
        if (btn.disabled) { await sleep(150); continue }
        btn.click()
        await sleep(LOAD_RENDER_SETTLE_MS)
      }
      if (!extended) return false
    }

    // Locate the turn's first node and scroll to it.
    const snap = snapshotRef.current
    if (snap === undefined) return false
    const key = firstNodeKeyOfTurn(snap, turn)
    if (key === undefined) return false
    const row = scrollport.querySelector<HTMLElement>(`[${ANCHOR_ATTR}="${CSS.escape(key)}"]`)
    if (row === null) return false
    const targetTop = row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop
    scrollport.scrollTop = Math.max(0, targetTop - JUMP_MARGIN_PX)

    // Temporary highlight flash.
    row.classList.add(HIGHLIGHT_CLASS)
    setTimeout(() => row.classList.remove(HIGHLIGHT_CLASS), 1500)
    return true
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

  if (turns.length === 0) return null

  return (
    <div className="tn-wrap" role="navigation" aria-label={t('rail')} onMouseLeave={() => { setHoverIndex(-1); stopHoverScroll() }}>
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
          return (
            <button
              key={entry.turn}
              type="button"
              className={`tn-cap-btn${cls}${loading ? ' tn-loading' : ''}`}
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
