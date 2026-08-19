/**
 * Session-header trigger button: a compact pill that shows the turn count
 * and toggles the navigation drawer.
 *
 * This component is registered into `conversation.session.header.utilities`
 * (session scope), so it receives the framework session kit: `useSession`
 * (the conversation snapshot selector hook) and `sessionId`. The trigger
 * reads the turn count from the snapshot and publishes the full turn list
 * to the module-level relay so the root-scope drawer can consume it.
 */

import { useSyncExternalStore } from 'react'
import { IconListPenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { getDrawerOpen, subscribeDrawer, toggleDrawer } from './drawer-state.ts'
import { extractTurns, type ConversationSnapshotLike } from './turns.ts'
import { publishTurns } from './turns-store.ts'
import type { TurnNavKey } from './locales.ts'

/** Structural session-standard props (session scope, framework-injected). */
interface SessionStandardProps {
  useSession?: <T,>(selector: (snapshot: ConversationSnapshotLike) => T) => T
}

/** Injected face from the registration. */
export interface TriggerInjected {
  t: (key: TurnNavKey, params?: Record<string, unknown>) => string
}

/** Full props of the trigger component. */
export type TriggerProps = SessionStandardProps & TriggerInjected

/** The trigger pill button rendered in the session header utilities. */
export function TurnNavTrigger({ useSession, t }: TriggerProps) {
  const drawerOpen = useSyncExternalStore(subscribeDrawer, getDrawerOpen)
  // Read the snapshot once and publish turns to the relay. We select the
  // whole snapshot reference (stable between changes) so the selector
  // re-runs only when the snapshot identity changes.
  const snapshot = useSession?.(s => s)
  const turnCount = useSession?.(s => extractTurns(s).length) ?? 0

  // Publish turns whenever the snapshot changes. This runs during render
  // (cheap: extractTurns is pure + memoized by reference equality in the
  // relay's publishTurns). Using a layout-free approach: publish in the
  // render body is fine because the relay is an external store, and React
  // guarantees the drawer re-renders via its own useSyncExternalStore.
  if (snapshot !== undefined) publishTurns(snapshot)

  // Hide the trigger when there are no turns (blank session / loading).
  if (turnCount === 0) return null

  return (
    <button
      type="button"
      className={`tn-trigger${drawerOpen ? ' tn-trigger-active' : ''}`}
      aria-label={t('trigger')}
      aria-pressed={drawerOpen}
      onClick={toggleDrawer}
    >
      <IconListPenOutline16 size={14} />
      <span>{t('trigger')}</span>
      <span className="tn-trigger-count">{t('triggerCount', { n: String(turnCount) })}</span>
    </button>
  )
}
