/**
 * Module-level drawer visibility state shared by the session-header trigger
 * and the shell.overlay drawer entry. A bare observable pair
 * (subscribe/getSnapshot) consumed through React's useSyncExternalStore —
 * no store machinery needed for a single boolean that two sibling entries
 * must agree on.
 *
 * Also tracks the "pending turn" — when the user clicks a turn item, we
 * record it so the drawer can optionally scroll to it on the next render
 * (useful if the drawer re-opens). Set to null after consumption.
 */
const listeners = new Set<() => void>()
let open = false
let pendingTurn: number | null = null

function emit(): void {
  for (const fn of listeners) fn()
}

/** Subscribe to visibility changes; returns an unsubscribe. */
export function subscribeDrawer(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Current visibility snapshot. */
export function getDrawerOpen(): boolean {
  return open
}

/** Current pending turn (for auto-scroll after open), or null. */
export function getPendingTurn(): number | null {
  return pendingTurn
}

/** Consume the pending turn (read-and-clear). */
export function consumePendingTurn(): number | null {
  const val = pendingTurn
  pendingTurn = null
  return val
}

/** Open the drawer (called from the session-header trigger). */
export function openDrawer(): void {
  if (open) return
  open = true
  emit()
}

/** Close the drawer (called from the overlay's close control). */
export function closeDrawer(): void {
  if (!open) return
  open = false
  emit()
}

/** Toggle the drawer. */
export function toggleDrawer(): void {
  if (open) closeDrawer()
  else openDrawer()
}

/** Set a pending turn (used when jumping from outside the drawer). */
export function setPendingTurn(turn: number): void {
  pendingTurn = turn
  emit()
}
