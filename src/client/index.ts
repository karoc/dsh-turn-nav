/**
 * dsh-turn-navigator client plugin: registers two slot entries —
 *   1. `conversation.session.header.utilities` (session scope): a compact
 *      trigger pill that shows the turn count and publishes the turn list to
 *      the module-level relay.
 *   2. `shell.overlay` (root scope): the right-side drawer that lists every
 *      turn and supports click-to-jump + scroll-follow highlight.
 *
 * The scope gap (session-scope trigger has `useSession`; root-scope drawer
 * only has `useSessions`) is bridged by the `turns-store` relay: the trigger
 * publishes on every snapshot change, the drawer reads through
 * `useSyncExternalStore`.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the shell's SlotMap merges (the 'conversation.session
// .header.utilities' and 'shell.overlay' entries) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TurnNavDrawer, type DrawerInjected } from './TurnNavDrawer.tsx'
import { TurnNavTrigger, type TriggerInjected } from './TurnNavTrigger.tsx'
import { en, zh, type TurnNavKey } from './locales.ts'
// Side-effect import: injects the design-token styles at module evaluation
// (module-top-level side effects survive tree-shaking, unlike a closure-only
// call, which rolldown dropped and crashed the whole web client).
import './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The turn-nav drawer copy. */
    'dsh-turn-navigator': TurnNavKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'dsh-turn-navigator'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Browser plugin body: registers the session-header trigger and the overlay
 * drawer.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-turn-navigator: copy dictionaries')

  const t = ctx.locale.bind(NS) as (key: TurnNavKey, params?: Record<string, unknown>) => string

  // Session-header trigger: the "轮次" pill that toggles the drawer and
  // publishes the turn list (session scope gives useSession).
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'dsh-turn-navigator',
    order: 20,
    locale: NS,
    inject: (): TriggerInjected => ({
      t,
    }),
  }, TurnNavTrigger))

  // Shell overlay drawer: the right-side navigation panel while open, null
  // otherwise (root scope gives useSessions; turns arrive via the relay).
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-turn-navigator',
    order: 20,
    locale: NS,
    inject: (): DrawerInjected => ({
      t,
    }),
  }, TurnNavDrawer))
}
