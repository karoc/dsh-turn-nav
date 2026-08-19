/**
 * Turn navigation rail: a vertical "piano-key" rail floating on the right
 * edge of the conversation. One capsule per turn (grey, ~3px tall), stacked
 * vertically. Hovering a capsule makes it glow white and grow (with the two
 * neighbours slightly raised — a wave ripple), and shows the full turn info
 * in a DSH Tooltip. Clicking a capsule jumps the conversation to that turn's
 * start.
 *
 * Registered into `conversation.session.header.utilities` (session scope), so
 * this component reads the live `ConversationSnapshot` directly via
 * `useSession` — no cross-scope bridge needed.
 *
 * Also drives "auto-load older history": the conversation paginates its
 * window (a "Load earlier" button appears at the top when `hasMore`); this
 * rail keeps clicking it until all history is loaded, so every turn is
 * reachable. The same load-and-retry loop backs click-to-jump when the target
 * row is not yet rendered.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDownOutline14, IconChevronUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { extractTurns, firstNodeKeyOfTurn, type ConversationSnapshotLike, type TurnEntry } from './turns.ts'
import type { TurnNavKey } from './locales.ts'

/** Structural session-standard props (session scope, framework-injected). */
interface SessionStandardProps {
  useSession?: <T,>(selector: (snapshot: ConversationSnapshotLike) => T) => T
}

/** Injected face from the registration. */
export interface RailInjected {
  t: (key: TurnNavKey, params?: Record<string, unknown>) => string
}

/** Full props of the rail component. */
export type RailProps = SessionStandardProps & RailInjected

/** Scrollport selector: the active conversation's scroll container. */
const SCROLL_SELECTOR = '[data-conversation-scroll]'
/** Chat row anchor attribute: each rendered row carries its node key. */
const ANCHOR_ATTR = 'data-chat-anchor-key'
/** CSS class for the jump highlight flash. */
const HIGHLIGHT_CLASS = 'tn-jump-highlight'

/** Loaded-but-not-found retry window for click-to-jump (ms). */
const JUMP_TIMEOUT_MS = 5000
/** Delay between auto-load button clicks — lets the conversation render the
 *  prepended page (a heavy full-flow re-render) before the next one. */
const LOAD_RENDER_SETTLE_MS = 900
/** Cap on pages auto-loaded per session open. Every page prepend re-renders
 *  the whole conversation flow, so on a long conversation (hundreds of turns,
 *  thousands of DOM rows) loading too much up-front stalls the UI. We pull a
 *  few pages so the rail has more than the initial window, then stop — the
 *  rest loads on-demand via scroll/click. */
const MAX_AUTO_PAGES = 5
/** Pages the rail-top scroll may load in ONE continuous pass before requiring
 *  the user to scroll away and back — prevents holding the rail at its top
 *  from pulling the entire history into the DOM at once. */
const MAX_CONTINUOUS_SCROLL_PAGES = 3
/** Cap on pages loaded while hunting a specific turn's row (click-to-jump). */
const MAX_JUMP_PAGES = 40
/** Extra vertical margin when scrolling a target row into view. */
const JUMP_MARGIN_PX = 16

/** Localized "Load earlier" paging button labels — idle AND in-flight (the
 *  conversation swaps the label to a "loading…" copy while a page is being
 *  fetched; we must still recognize the button so loading state is tracked). */
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

/**
 * Find the "Load earlier" paging button inside the conversation flow, or null
 * when all history is already loaded (button absent) / currently loading
 * (button disabled).
 */
function findLoadOlderButton(): HTMLButtonElement | null {
  const scrollport = findScrollport()
  if (scrollport === undefined) return null
  // The paging button lives at the top of the chat flow column.
  const candidates = scrollport.querySelectorAll<HTMLButtonElement>('button')
  for (const btn of candidates) {
    if (isLoadOlderButton(btn)) return btn
  }
  return null
}

/**
 * Wait for a chat row with the given node key to appear in the DOM, driving
 * the "load earlier" button meanwhile (the target turn may live in a not-yet
 * loaded page). Resolves with the row, or null on timeout / page cap.
 */
function waitForRow(scrollport: HTMLElement, key: string, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    let pages = 0
    const check = (): void => {
      const row = scrollport.querySelector<HTMLElement>(`[${ANCHOR_ATTR}="${CSS.escape(key)}"]`)
      if (row !== null) {
        resolve(row)
        return
      }
      if (Date.now() > deadline || pages >= MAX_JUMP_PAGES) {
        resolve(null)
        return
      }
      const btn = findLoadOlderButton()
      if (btn !== null && !btn.disabled) {
        btn.click()
        pages += 1
      }
      setTimeout(check, 150)
    }
    check()
  })
}

/**
 * Jump to a turn: locate its first chat-node row (auto-loading earlier
 * history until it renders) and scroll the conversation flow to it, with a
 * brief highlight flash.
 */
async function jumpToTurn(snapshot: ConversationSnapshotLike | undefined, turn: number): Promise<void> {
  if (snapshot === undefined) return
  const key = firstNodeKeyOfTurn(snapshot, turn)
  if (key === undefined) return
  const scrollport = findScrollport()
  if (scrollport === undefined) return

  const row = await waitForRow(scrollport, key, JUMP_TIMEOUT_MS)
  if (row === null) return

  // Precise scroll: compute the row's position in scrollport coordinates and
  // set scrollTop directly (more predictable than scrollIntoView, which walks
  // every scrollable ancestor and can fight the shell's own scroll management).
  const targetTop = row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop
  scrollport.scrollTop = Math.max(0, targetTop - JUMP_MARGIN_PX)

  // Temporary highlight flash.
  row.classList.add(HIGHLIGHT_CLASS)
  setTimeout(() => row.classList.remove(HIGHLIGHT_CLASS), 1500)
}

/** Tooltip body for one turn: index, time, full summary. */
function tooltipText(entry: TurnEntry, index: number, t: (key: TurnNavKey, params?: Record<string, unknown>) => string): string {
  const time = formatTime(entry.startTime)
  const label = t('turnLabel', { n: String(index) })
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
 * and renders a floating vertical capsule per turn.
 */
export function TurnNavRail({ useSession, t }: RailProps) {
  const snapshot = useSession?.((s: ConversationSnapshotLike) => s)
  const turns = useMemo(() => extractTurns(snapshot), [snapshot])
  const [hoverIndex, setHoverIndex] = useState(-1)
  const [hoverY, setHoverY] = useState(0)
  const [tipTop, setTipTop] = useState(0)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const autoPagesRef = useRef(0)
  const loadBusyRef = useRef(false)
  const railRef = useRef<HTMLDivElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const hoverScrollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load one page of older history with a busy lock + render settle. Shared by
  // the initial auto-load loop and the rail-top scroll trigger, so the two
  // never click the paging button concurrently. `then(loaded)` reports whether
  // a page was actually fetched (button found and clicked), so callers count
  // real pages only.
  const loadMoreOnce = useCallback((then: (loaded: boolean) => void): void => {
    if (loadBusyRef.current) {
      then(false)
      return
    }
    const btn = findLoadOlderButton()
    if (btn === null || btn.disabled) {
      then(false)
      return
    }
    loadBusyRef.current = true
    btn.click()
    // Let the prepended page render (a heavy full-flow re-render) before the
    // lock releases, so back-to-back pages never pile up on the main thread.
    setTimeout(() => {
      loadBusyRef.current = false
      then(true)
    }, LOAD_RENDER_SETTLE_MS)
  }, [])

  // Initial auto-load: fill the rail's visible height with a few pages at a
  // slow cadence, then stop (page cap or rail-full) — the rest is loaded on
  // demand by scrolling the rail to its top. Prevents a very long
  // conversation from stalling the UI by prepending every page back-to-back.
  const hasTurns = turns.length > 0
  useEffect(() => {
    if (!hasTurns) return
    autoPagesRef.current = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const tick = (): void => {
      if (stopped || autoPagesRef.current >= MAX_AUTO_PAGES) return
      const rail = railRef.current
      // Stop once the rail is visually full (content taller than its box).
      if (rail !== null && rail.scrollHeight > rail.clientHeight + 2) return
      if (findLoadOlderButton() === null) return // no more history — stop
      loadMoreOnce((loaded) => {
        if (loaded) autoPagesRef.current += 1
        if (!stopped) timer = setTimeout(tick, 300)
      })
    }
    timer = setTimeout(tick, 300)
    return () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [hasTurns, loadMoreOnce])

  // Rail-top scroll: keep loading older history (unbounded, user-driven) while
  // the rail is scrolled near its top — the way the conversation itself loads
  // on scroll. Scrolling away or reaching the end stops it. While near the
  // top, keep retrying (queued) until a page actually loads or history ends.
  useEffect(() => {
    const rail = railRef.current
    if (rail === null) return
    // Pages loaded in the current continuous "held at the top" pass. Scrolling
    // away resets it, so a user must deliberately scroll back to the top to
    // pull more — a long conversation can never be fully loaded by holding.
    let passPages = 0
    const onScroll = (): void => {
      if (rail.scrollTop > 60) {
        passPages = 0 // scrolled away — next pass starts fresh
        return
      }
      if (passPages >= MAX_CONTINUOUS_SCROLL_PAGES) return // pass quota used
      const btn = findLoadOlderButton()
      if (btn === null) return // no more history — stop
      if (loadBusyRef.current || btn.disabled) {
        // Busy (auto-load or another scroll pass in flight) or the page is
        // still loading: retry shortly rather than drop this scroll.
        setTimeout(onScroll, 150)
        return
      }
      loadBusyRef.current = true
      passPages += 1
      btn.click()
      setTimeout(() => {
        loadBusyRef.current = false
        if (rail.scrollTop <= 60 && passPages < MAX_CONTINUOUS_SCROLL_PAGES) setTimeout(onScroll, 150)
      }, LOAD_RENDER_SETTLE_MS)
    }
    rail.addEventListener('scroll', onScroll, { passive: true })
    return () => rail.removeEventListener('scroll', onScroll)
  }, [hasTurns])

  // Track whether there is more content above/below the rail's viewport, to
  // enable/disable the scroll buttons. Re-evaluates on rail scroll and on any
  // turn-list change (loading, prepends, new turns).
  useEffect(() => {
    const rail = railRef.current
    if (rail === null) return
    const update = (): void => {
      setCanScrollUp(rail.scrollTop > 2)
      setCanScrollDown(rail.scrollTop < rail.scrollHeight - rail.clientHeight - 2)
    }
    update()
    rail.addEventListener('scroll', update, { passive: true })
    // Also re-evaluate when turns change (content grows/shrinks).
    const ro = new ResizeObserver(update)
    ro.observe(rail)
    return () => {
      rail.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [turns.length])

  const hoverEntry = hoverIndex >= 0 ? turns[hoverIndex] : undefined

  // Position the tooltip bubble vertically centered on the hovered capsule,
  // clamped so the WHOLE bubble stays inside the viewport (a tall bubble must
  // not run off the bottom). Measured after render so the real height is used.
  useEffect(() => {
    if (hoverEntry === undefined) return
    const tip = tipRef.current
    if (tip === null) return
    const h = tip.offsetHeight
    setTipTop(Math.max(8, Math.min(hoverY - h / 2, window.innerHeight - h - 8)))
  }, [hoverEntry, hoverY])

  // Stop any hover-driven auto-scroll on unmount.
  useEffect(() => () => stopHoverScroll(), [])

  // Hover-driven auto-scroll on the up/down buttons: while the pointer rests
  // on an enabled button, scroll continuously until it is disabled or the
  // pointer leaves.
  const startHoverScroll = (dir: 1 | -1): void => {
    stopHoverScroll()
    const rail = railRef.current
    if (rail === null) return
    const step = () => {
      const r = railRef.current
      if (r === null) return
      // Stop once this direction has no more content.
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

  // Center the activated capsule in the rail (except when it is the first or
  // last turn — those naturally sit at the edges).
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
          return (
            <button
              key={entry.turn}
              type="button"
              className={`tn-cap-btn${cls}`}
              onMouseEnter={(e) => {
                setHoverIndex(i)
                const rect = e.currentTarget.getBoundingClientRect()
                setHoverY(rect.top + rect.height / 2)
              }}
              onClick={() => {
                void jumpToTurn(snapshot, entry.turn)
                centerCapsule(i)
              }}
              aria-label={tooltipText(entry, entry.index, t).replace(/\n/g, ' — ')}
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
      {/* Custom tooltip bubble anchored to the LEFT of the rail. Rendered via
          a portal to document.body so it stays position:fixed relative to the
          VIEWPORT — being a child of .tn-wrap (which has a transform) would
          make the wrapper the containing block and misplace it. */}
      {hoverEntry !== undefined && createPortal(
        <div ref={tipRef} className="tn-tip" style={{ top: tipTop }} role="tooltip">
          {tooltipText(hoverEntry, hoverEntry.index, t)}
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
