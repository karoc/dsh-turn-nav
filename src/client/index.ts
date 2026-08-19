/**
 * dsh-turn-navigator client plugin: registers one slot entry —
 *   `conversation.session.header.utilities` (session scope): the piano-key
 *   turn rail floating on the right edge of the conversation.
 *
 * The rail is session-scoped, so it reads the live `ConversationSnapshot`
 * directly via the framework `useSession` kit — no cross-scope bridge needed.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the shell's SlotMap merges (the 'conversation.session
// .header.utilities' entry) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TurnNavRail, type RailInjected } from './TurnNavRail.tsx'
import { en, zh, type TurnNavKey } from './locales.ts'
// Side-effect import: injects the design-token styles at module evaluation
// (module-top-level side effects survive tree-shaking, unlike a closure-only
// call, which rolldown dropped and crashed the whole web client).
import './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The turn-nav rail copy. */
    'dsh-turn-navigator': TurnNavKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'dsh-turn-navigator'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Browser plugin body: registers the turn rail into the session header
 * utilities seat.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-turn-navigator: copy dictionaries')

  const t = ctx.locale.bind(NS) as (key: TurnNavKey, params?: Record<string, unknown>) => string

  // Session-header utilities: the floating turn rail (session scope gives
  // useSession). It renders as position:fixed, so it does not occupy the
  // header's flex row.
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'dsh-turn-navigator',
    order: 20,
    locale: NS,
    inject: (): RailInjected => ({
      t,
    }),
  }, TurnNavRail))
}
