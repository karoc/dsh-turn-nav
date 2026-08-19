/**
 * Module-level snapshot relay: the session-scope trigger component receives
 * `useSession` (the conversation snapshot) and writes the extracted turns +
 * a snapshot reference here; the root-scope drawer reads them through
 * `useSyncExternalStore`.
 *
 * This bridges the scope gap: `conversation.session.header.utilities` is
 * session-scoped (gets useSession), while `shell.overlay` is root-scoped
 * (only gets useSessions). The relay is a bare observable pair — no store
 * machinery needed.
 */
import { extractTurns, type ConversationSnapshotLike, type TurnEntry } from './turns.ts'

interface RelayState {
  /** Extracted turn list (ordered). */
  turns: TurnEntry[]
  /** Live snapshot reference for key→turn reverse lookup + jump targeting. */
  snapshot: ConversationSnapshotLike | undefined
}

const listeners = new Set<() => void>()
let state: RelayState = { turns: [], snapshot: undefined }

function emit(): void {
  for (const fn of listeners) fn()
}

/** Subscribe to relay state changes; returns an unsubscribe. */
export function subscribeTurns(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Current relay state snapshot. */
export function getTurns(): RelayState {
  return state
}

/**
 * Update the relay from a session-scope component that has `useSession`.
 * Called on every snapshot change; only emits when the turn list actually
 * changed (reference-equal turns array means no re-render needed).
 *
 * @param snapshot - the live ConversationSnapshot (structural subset).
 */
export function publishTurns(snapshot: ConversationSnapshotLike | undefined): void {
  const turns = extractTurns(snapshot)
  // Avoid spurious emits: only update when the turns array content changed.
  // We do a shallow comparison since extractTurns builds a fresh array each
  // call; compare by length + first/last summary + turn numbers.
  const prev = state.turns
  const changed = prev.length !== turns.length
    || turns.some((t, i) => t.turn !== prev[i]?.turn || t.summary !== prev[i]?.summary)
  if (!changed && state.snapshot === snapshot) return
  state = { turns, snapshot }
  emit()
}
