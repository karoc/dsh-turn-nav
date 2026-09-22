/**
 * Rail display mode: WHICH turn rail is shown, if any. This is the plugin's
 * one user-facing preference (settings → General → "Turn navigation").
 *
 *   - `stn`     (default): show OUR rail, hide the OFFICIAL built-in rail.
 *               The official rail has no off-switch, so "hiding" it is done
 *               with a stylesheet override driven by the `tn-hide-official`
 *               body class (see styles.ts). Our rail then takes over the
 *               right-edge center position the official rail used to occupy.
 *   - `official`: hide OUR rail (the official one is the built-in default).
 *   - `hidden` : hide both.
 *
 * Persistence is browser-local (localStorage): the official settings-namespace
 * store (`ctx.settingsScope`) requires a Host-registered namespace, which an
 * external client-only plugin has no seam to create, and the plugin's own host
 * half (if one ever existed) would add version-compat surface for a single
 * scalar preference. localStorage survives reloads, which is all a browser
 * preference needs on a single-machine dsh web.
 */

/** One of the three rail display modes. */
export type RailMode = 'stn' | 'official' | 'hidden'

/** localStorage key owning the persisted mode. */
const STORAGE_KEY = 'dsh-turn-navigator.mode'

/** Default mode: our rail, official rail hidden (subtractive takeover). */
const DEFAULT_MODE: RailMode = 'stn'

const MODES: readonly RailMode[] = ['stn', 'official', 'hidden']

/** Module-level current mode (stable reference for useSyncExternalStore). */
let current: RailMode = readStored()
const listeners = new Set<() => void>()

function readStored(): RailMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (MODES.includes(raw as RailMode)) return raw as RailMode
  } catch {
    // Storage unavailable (private mode, disabled cookies): keep the default.
  }
  return DEFAULT_MODE
}

/** Read the current rail mode (useSyncExternalStore getSnapshot). */
export function getRailMode(): RailMode {
  return current
}

/** Subscribe to rail-mode changes (useSyncExternalStore subscribe). */
export function subscribeRailMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Persist and publish a new rail mode. */
export function setRailMode(mode: RailMode): void {
  if (mode === current) return
  current = mode
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage unavailable: the in-memory choice still applies this session.
  }
  applyModeToBody()
  for (const listener of [...listeners]) {
    try { listener() } catch { /* listener isolation */ }
  }
}

/**
 * Sync the `tn-hide-official` body class with the current mode. The class
 * drives the stylesheet rule that hides the OFFICIAL rail (our rail is hidden
 * by React instead). The official rail is hidden in every mode except
 * `official` (where the user chose to see it). Called at plugin apply (body
 * exists by then) and on every mode change.
 */
export function applyModeToBody(): void {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('tn-hide-official', current !== 'official')
}

/**
 * Drop the `tn-hide-official` body class — the plugin's dispose hook.
 *
 * dsh 0.1.6+ enables the host `hmr` row by default for launcher-provided
 * profiles, so this plugin can be disabled or reloaded LIVE (the dsh Plugins
 * page toggles bundles without a restart). Without this teardown the class
 * outlives the plugin and keeps hiding the OFFICIAL rail, and only a page
 * reload brings it back. Removing the class is the correct "unloaded" state:
 * the official rail is the built-in default whenever this plugin is not applied.
 */
export function clearModeFromBody(): void {
  if (typeof document === 'undefined') return
  document.body.classList.remove('tn-hide-official')
}
