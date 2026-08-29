/**
 * dsh-turn-navigator client plugin: registers one slot entry —
 *   `conversation.session.header.utilities` (session scope): the piano-key
 *   turn rail floating on the right edge of the conversation.
 *
 * The rail is session-scoped, so it reads the live `ConversationSnapshot`
 * directly via the framework `useSession` kit — no cross-scope bridge needed.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the shell's SlotMap merges (the 'conversation.session
// .header.utilities' entry) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { TurnNavRail, type RailInjected } from './TurnNavRail.tsx'
import { en, zh, type TurnNavKey } from './locales.ts'
import type {
  JournalHandle,
  JournalPageRequest,
  JournalPageResult,
  SessionAccessHandle,
} from './history.ts'
// Side-effect import: injects the design-token styles at module evaluation
// (module-top-level side effects survive tree-shaking, unlike a closure-only
// call, which rolldown dropped and crashed the whole web client).
import './styles.ts'

/** Structural subset of the official client sessions service (`ctx.sessions`,
 *  provided by @deepseek-ai/dsh-api-session-controller/client). */
interface SessionsServiceLike {
  binding?(sessionId: string): {
    session?: { loadOlder?(): Promise<unknown> }
    eventSource?: {
      getSnapshot?(): {
        entries?: readonly { event?: { seq?: number } }[]
        hasMore?: boolean
      }
    }
  } | undefined
}

/** Structural subset of the mounted `remote.session` namespace service
 *  (`ctx.get('remote.session')` — the inject-gate-free store read). */
interface SessionNamespaceLike {
  page?(request: unknown, signal?: AbortSignal): Promise<unknown>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The turn-nav rail copy. */
    'dsh-turn-navigator': TurnNavKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'dsh-turn-navigator'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection']

/**
 * Browser plugin body: registers the turn rail into the session header
 * utilities seat.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-turn-navigator: copy dictionaries')

  const t = ctx.locale.bind(NS) as (key: TurnNavKey, params?: Record<string, unknown>) => string
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const api = connection?.api

  // 0.1.2+ full-history channels (both provided by the base web assembly; both
  // absent on older hosts — the rail then degrades gracefully):
  //   journal        → ctx.remote.session.page  (Typert Remote history paging)
  //   sessionAccess  → ctx.sessions            (official window store)
  // The `remote.session` namespace is mounted asynchronously during boot, so
  // the handles are resolved lazily: each call re-checks only the handles that
  // are still missing, so an early call (before the mount finished) is
  // naturally retried on the next render.
  //
  // NOTE on cordis gating: `ctx.get('remote')` returns a traced service proxy
  // whose `.session` access forwards to the context property `remote.session`
  // — which the proxy gates behind the plugin `inject` list and throws
  // "cannot get property without inject". Reading the namespace service
  // directly via `ctx.get('remote.session')` (the mixed-in `reflect.get`,
  // documented as the inject-free store read) bypasses the gate.
  let journal: JournalHandle | undefined
  let sessionAccess: SessionAccessHandle | undefined
  const resolveHandles = (): void => {
    if (journal !== undefined && sessionAccess !== undefined) return
    const sessionNamespace = ctx.get('remote.session') as SessionNamespaceLike | undefined
    if (journal === undefined && typeof sessionNamespace?.page === 'function') {
      journal = {
        page: (request, signal) =>
          (sessionNamespace as { page: (r: JournalPageRequest, s?: AbortSignal) => Promise<JournalPageResult> })
            .page(request, signal),
      }
    }
    if (sessionAccess === undefined) {
      const sessionsService = ctx.get('sessions') as SessionsServiceLike | undefined
      if (sessionsService !== undefined && typeof sessionsService.binding === 'function') {
        sessionAccess = {
          windowSeq(sessionId) {
            const entries = sessionsService.binding?.(sessionId)?.eventSource?.getSnapshot?.()?.entries ?? []
            return {
              firstSeq: entries[0]?.event?.seq,
              lastSeq: entries.at(-1)?.event?.seq,
            }
          },
          hasMore(sessionId) {
            return sessionsService.binding?.(sessionId)?.eventSource?.getSnapshot?.()?.hasMore ?? false
          },
          async loadOlder(sessionId) {
            const face = sessionsService.binding?.(sessionId)?.session
            if (face === undefined || typeof face.loadOlder !== 'function') return false
            try { await face.loadOlder(); return true } catch { return false }
          },
        }
      }
    }
  }
  resolveHandles()

  // Session-header utilities: the floating turn rail (session scope gives
  // useSession). It renders as position:fixed, so it does not occupy the
  // header's flex row.
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'dsh-turn-navigator',
    order: 20,
    locale: NS,
    inject: (): RailInjected => {
      resolveHandles()
      return {
        t,
        api: api as RailInjected['api'],
        journal,
        sessionAccess,
      }
    },
  }, TurnNavRail))
}
