/**
 * Design-token styles for the turn-nav piano-key rail (external plugin, no
 * CSS modules available). Re-declared against the official `--dsw-alias-*`
 * semantic tokens, namespaced under `tn-` to avoid collisions. Tokens carry
 * no fallback because the host theme always defines them on the app root.
 *
 * Wave hover: hovering a capsule makes it glow white and grow; its two
 * neighbours rise slightly too, so sliding across the rail ripples like a
 * wave (hot = hovered, warm = adjacent).
 */
export const TURN_NAV_STYLES = `
/* Rail: fixed vertical column on the right edge, centered vertically,
   capped in height so a long conversation does not overflow the viewport.
   The capsules divide the available height evenly (flex: 1), so the rail
   doubles as a proportional minimap of the whole conversation. */
.tn-rail {
  position: fixed;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 70vh;
  z-index: 30;
  pointer-events: none; /* the column is only a layout box; buttons opt in */
}
/* Per-turn hotspot: a wider/taller transparent button so the tiny capsule
   still has a comfortable hover/click target. flex: 1 divides the rail
   height across turns. */
.tn-cap-btn {
  pointer-events: auto;
  flex: 1;
  min-height: 8px;
  width: 24px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
}
/* The visible capsule itself: grey, ~3px tall, ~12px wide by default. */
.tn-cap {
  width: 12px;
  height: 3px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l3);
  transition: height 150ms ease, width 150ms ease, background 150ms ease, border-radius 150ms ease;
  flex: none;
}
/* Hovered capsule: glow white and grow (the wave peak). */
.tn-cap-btn.tn-cap-hot .tn-cap {
  height: 16px;
  width: 18px;
  border-radius: 3px;
  background: var(--dsw-alias-label-primary);
  box-shadow: 0 0 6px var(--dsw-alias-label-primary);
}
/* Adjacent capsule: slightly raised (the wave's near neighbours). */
.tn-cap-btn.tn-cap-warm .tn-cap {
  height: 8px;
  width: 15px;
  background: var(--dsw-alias-label-secondary);
}

/* Jump highlight flash on the target row in the conversation flow. */
@keyframes tn-highlight-flash {
  0% { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent); }
  100% { background: transparent; }
}
.tn-jump-highlight {
  animation: tn-highlight-flash 1500ms ease-out;
  border-radius: 4px;
}
`

/**
 * Inject {@link TURN_NAV_STYLES} once, tagged by plugin id so re-evaluation
 * and repeated mounts stay idempotent (mirrors the dsh-kanban pattern).
 * @param pluginId - stable plugin id used as the style tag marker.
 */
export function injectTurnNavStyles(pluginId: string): void {
  if (typeof document === 'undefined') return
  const selector = `style[data-dsh-plugin-css="${pluginId}"]`
  if (document.querySelector(selector) !== null) return
  const tag = document.createElement('style')
  tag.setAttribute('data-dsh-plugin-css', pluginId)
  tag.textContent = TURN_NAV_STYLES
  document.head.appendChild(tag)
}

// Inject at module evaluation rather than from an `apply` closure. The loader
// executes this factory after the DOM head exists, and a module-top-level call
// is a preserved side effect: the whole module cannot be tree-shaken away
// leaving a dangling reference.
injectTurnNavStyles('dsh-turn-navigator')
