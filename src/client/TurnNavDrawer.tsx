/**
 * Turn navigation drawer: a right-side fixed panel listing every
 * conversation turn (index + user-message summary + timestamp). Clicking a
 * turn scrolls the conversation flow to that turn's first node and briefly
 * highlights it. The current turn (topmost visible row) is highlighted in the
 * list as the user scrolls the conversation.
 *
 * Registered into `shell.overlay` (root scope), so it receives the global
 * `useSessions` hook. The turn list + snapshot reference arrive through the
 * module-level relay (populated by the session-scope trigger component).
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  closeDrawer, consumePendingTurn, getDrawerOpen, getPendingTurn, subscribeDrawer,
} from './drawer-state.ts'
import { getTurns, subscribeTurns } from './turns-store.ts'
import {
  firstNodeKeyOfTurn, turnOfNodeKey,
  type TurnEntry,
} from './turns.ts'
import type { TurnNavKey } from './locales.ts'

/** Structural session list state (global standard props). */
interface SessionListStateLike {
  current?: string
  byId?: Record<string, unknown>
}

/** Structural global standard props (root scope, framework-injected). */
interface GlobalStandardProps {
  useSessions?: <T,>(selector: (snapshot: SessionListStateLike) => T) => T
}

/** Injected face from the registration. */
export interface DrawerInjected {
  t: (key: TurnNavKey, params?: Record<string, unknown>) => string
}

/** Full props of the drawer overlay component. */
export type DrawerProps = GlobalStandardProps & DrawerInjected

/** Scrollport selector: the active conversation's scroll container. */
const SCROLL_SELECTOR = '[data-conversation-scroll]'
/** Chat row anchor attribute: each rendered row carries its node key. */
const ANCHOR_ATTR = 'data-chat-anchor-key'
/** CSS class for the jump highlight flash. */
const HIGHLIGHT_CLASS = 'tn-jump-highlight'

/** Rate-limit for scroll-follow (ms between highlight recomputes). */
const SCROLL_THROTTLE_MS = 100

/**
 * Format a Unix-epoch-ms timestamp as a short HH:MM string.
 */
function formatTime(ms: number | undefined): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return ''
  const date = new Date(ms)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Find the scrollport element (the conversation scroll container).
 * Returns undefined if not found.
 */
function findScrollport(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(SCROLL_SELECTOR) ?? undefined
}

/**
 * Find the topmost visible chat-anchor row in the scrollport viewport.
 * Returns its node key, or undefined when no row is visible.
 */
function topVisibleAnchorKey(): string | undefined {
  const scrollport = findScrollport()
  if (scrollport === undefined) return undefined
  const viewport = scrollport.getBoundingClientRect()
  const rows = scrollport.querySelectorAll<HTMLElement>(`[${ANCHOR_ATTR}]`)
  for (const row of Array.from(rows)) {
    const rect = row.getBoundingClientRect()
    if (rect.bottom > viewport.top && rect.top < viewport.bottom) {
      return row.getAttribute(ANCHOR_ATTR) ?? undefined
    }
  }
  return undefined
}

/**
 * The drawer overlay component: renders the turn list while open, null
 * otherwise.
 */
export function TurnNavDrawer({ t }: DrawerProps) {
  const drawerOpen = useSyncExternalStore(subscribeDrawer, getDrawerOpen)
  // getTurns returns the STABLE relay state reference (only replaced on
  // publish), so useSyncExternalStore's getSnapshot is stable.
  const relayState = useSyncExternalStore(subscribeTurns, getTurns)
  const list = relayState.turns
  const snapshot = relayState.snapshot

  const [currentTurn, setCurrentTurn] = useState<number | undefined>(undefined)

  // Scroll-follow: listen to the conversation scrollport and highlight the
  // topmost visible turn. Only active while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return
    const scrollport = findScrollport()
    if (scrollport === undefined) return

    let lastFire = 0
    let frame: number | undefined
    const update = (): void => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = undefined
        const now = Date.now()
        if (now - lastFire < SCROLL_THROTTLE_MS) return
        lastFire = now
        const key = topVisibleAnchorKey()
        if (key !== undefined) {
          const turn = turnOfNodeKey(snapshot, key)
          setCurrentTurn(turn ?? undefined)
        }
      })
    }
    scrollport.addEventListener('scroll', update, { passive: true })
    // Initial compute.
    update()
    return () => {
      scrollport.removeEventListener('scroll', update)
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [drawerOpen, snapshot])

  // Handle pending turn (auto-jump when opening via external trigger).
  const pendingTurn = useSyncExternalStore(subscribeDrawer, getPendingTurn)
  useEffect(() => {
    if (!drawerOpen || pendingTurn === null) return
    const turn = consumePendingTurn()
    if (turn !== null) void jumpToTurn(snapshot, turn)
  }, [drawerOpen, pendingTurn, snapshot])

  if (!drawerOpen) return null

  return (
    <>
      <div className="tn-backdrop" onClick={closeDrawer} />
      <aside className="tn-drawer" role="dialog" aria-label={t('title')}>
        <div className="tn-header">
          <h2 className="tn-header-title">{t('title')}</h2>
          <span className="tn-header-count">{t('triggerCount', { n: String(list.length) })}</span>
          <div className="tn-header-spacer" />
          <button type="button" className="tn-close" aria-label={t('close')} onClick={closeDrawer}>
            <IconCloseOutline16 size={16} />
          </button>
        </div>
        <div className="tn-list">
          {list.length === 0 ? (
            <div className="tn-empty">{t('empty')}</div>
          ) : (
            list.map((entry) => (
              <TurnItem
                key={entry.turn}
                entry={entry}
                isCurrent={entry.turn === currentTurn}
                snapshot={snapshot}
                t={t}
              />
            ))
          )}
        </div>
      </aside>
    </>
  )
}

/** One turn list item. */
function TurnItem({
  entry, isCurrent, snapshot, t,
}: {
  entry: TurnEntry
  isCurrent: boolean
  snapshot: ReturnType<typeof getTurns>['snapshot']
  t: (key: TurnNavKey, params?: Record<string, unknown>) => string
}) {
  const ref = useRef<HTMLButtonElement>(null)

  // Scroll the drawer item into view when it becomes the current turn.
  useEffect(() => {
    if (isCurrent && ref.current !== null) {
      ref.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isCurrent])

  const handleClick = useCallback(() => {
    void jumpToTurn(snapshot, entry.turn)
  }, [snapshot, entry.turn])

  const isRunning = entry.status === 'open'

  return (
    <button
      ref={ref}
      type="button"
      className={`tn-item${isCurrent ? ' tn-item-current' : ''}`}
      onClick={handleClick}
      title={entry.fullText || t('turnLabel', { n: String(entry.index) })}
    >
      <div className="tn-item-row">
        <span className="tn-item-index">#{entry.index}</span>
        {isRunning && <span className="tn-status-dot tn-status-running" />}
        <span className="tn-item-time">{formatTime(entry.startTime)}</span>
      </div>
      <div className="tn-item-summary">{entry.summary}</div>
    </button>
  )
}

/**
 * Jump to a turn: scroll the conversation flow to that turn's first node and
 * briefly highlight it.
 */
async function jumpToTurn(
  snapshot: ReturnType<typeof getTurns>['snapshot'],
  turn: number,
): Promise<void> {
  const key = firstNodeKeyOfTurn(snapshot, turn)
  if (key === undefined) return
  const scrollport = findScrollport()
  if (scrollport === undefined) return

  const row = scrollport.querySelector<HTMLElement>(`[${ANCHOR_ATTR}="${CSS.escape(key)}"]`)
  if (row === null) return

  row.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Temporary highlight flash.
  row.classList.add(HIGHLIGHT_CLASS)
  setTimeout(() => row.classList.remove(HIGHLIGHT_CLASS), 1500)
}
