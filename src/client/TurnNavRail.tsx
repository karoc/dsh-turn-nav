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

import { useEffect, useMemo, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
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
/** Delay between auto-load button clicks (lets loadingOlder settle). */
const AUTO_LOAD_INTERVAL_MS = 350
/** Extra vertical margin when scrolling a target row into view. */
const JUMP_MARGIN_PX = 16

/** Localized "Load earlier" button labels (the top paging button). */
function isLoadOlderButton(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').trim()
  return text === '加载更早' || text === 'Load earlier' || text === 'Load earlier…'
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
 * Auto-load all older history: repeatedly click the "Load earlier" button
 * (if present) until it disappears (hasMore === false). Each click pulls one
 * page and prepends it; the button is disabled while a page is in flight, so
 * we re-check on an interval rather than click-spamming.
 */
function autoLoadOlder(stop: () => boolean): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const tick = (): void => {
    if (stopped || stop()) return
    const btn = findLoadOlderButton()
    if (btn === null) return // all history loaded
    if (!btn.disabled) btn.click()
    timer = setTimeout(tick, AUTO_LOAD_INTERVAL_MS)
  }
  timer = setTimeout(tick, 200)
  return () => {
    stopped = true
    if (timer !== null) clearTimeout(timer)
  }
}

/**
 * Wait for a chat row with the given node key to appear in the DOM, driving
 * the "load earlier" button meanwhile (the target turn may live in a not-yet
 * loaded page). Resolves with the row, or null on timeout.
 */
function waitForRow(scrollport: HTMLElement, key: string, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const check = (): void => {
      const row = scrollport.querySelector<HTMLElement>(`[${ANCHOR_ATTR}="${CSS.escape(key)}"]`)
      if (row !== null) {
        resolve(row)
        return
      }
      if (Date.now() > deadline) {
        resolve(null)
        return
      }
      const btn = findLoadOlderButton()
      if (btn !== null && !btn.disabled) btn.click()
      setTimeout(check, 120)
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

  // Auto-load older history while this session's conversation is mounted:
  // keep clicking the "Load earlier" button until every turn is in the window.
  useEffect(() => {
    if (turns.length === 0) return
    // Re-arm whenever the turn list grows (new pages) or the snapshot changes.
    return autoLoadOlder(() => false)
  }, [turns.length])

  if (turns.length === 0) return null

  return (
    <div className="tn-rail" role="navigation" aria-label={t('rail')}>
      {turns.map((entry, i) => {
        const dist = hoverIndex === -1 ? Infinity : Math.abs(i - hoverIndex)
        const cls = dist === 0 ? ' tn-cap-hot' : dist === 1 ? ' tn-cap-warm' : ''
        return (
          <Tooltip
            key={entry.turn}
            label={() => tooltipText(entry, entry.index, t)}
            side="right"
            delayMs={150}
          >
            <button
              type="button"
              className={`tn-cap-btn${cls}`}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(-1)}
              onClick={() => void jumpToTurn(snapshot, entry.turn)}
              aria-label={tooltipText(entry, entry.index, t).replace(/\n/g, ' — ')}
            >
              <span className="tn-cap" />
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
