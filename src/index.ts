/**
 * dsh-turn-navigator host half (Node). No tools, routes, or system prompts — this
 * plugin is pure client UI (a session-header trigger + an overlay drawer).
 * The empty apply satisfies the cordis bundle contract; the browser half
 * (exports["./client"]) does all the work.
 *
 * @param _ctx - cordis context (unused — no host-side registrations).
 */
import type { Context } from '@deepseek-ai/cordis'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function apply(_ctx: Context): void {
  // Intentionally empty: no host-side contributions.
}
