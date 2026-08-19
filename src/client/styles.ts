/**
 * Design-token styles for the turn-nav piano-key rail (external plugin, no
 * CSS modules available). Re-declared against the official `--dsw-alias-*`
 * semantic tokens, namespaced under `tn-` to avoid collisions. Tokens carry
 * no fallback because the host theme always defines them on the app root.
 *
 * Wave hover: hovering a capsule makes it glow white and WIDEN (150%);
 * its two neighbours widen a little too (125%), so sliding across the rail
 * ripples like a wave (hot = hovered, warm = adjacent). Height stays ~3px.
 */
export const TURN_NAV_STYLES = `
/* Rail: fixed vertical column on the right edge, centered vertically, with a
   hard height cap and internal scroll — a long conversation must never push
   the rail past the viewport. Each turn is a fixed-size hotspot; once the
   rail is full it scrolls. */
.tn-rail {
  position: fixed;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 60vh;
  overflow-y: auto;
  scrollbar-width: thin;
  z-index: 30;
  pointer-events: none; /* the column is only a layout box; buttons opt in */
}
/* Per-turn hotspot: a wider/taller transparent button so the tiny capsule
   still has a comfortable hover/click target. Fixed size — excess turns make
   the rail scroll, they never compress it. */
.tn-cap-btn {
  pointer-events: auto;
  flex: none;
  min-height: 10px;
  width: 26px;
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
  transition: width 160ms ease, background 160ms ease, border-radius 160ms ease, box-shadow 160ms ease;
  flex: none;
}
/* Hovered capsule: glow WHITE and widen to 150% (the wave peak). Fixed white,
   theme-independent (label tokens flip dark in light themes). */
.tn-cap-btn.tn-cap-hot .tn-cap {
  width: 18px;
  border-radius: 3px;
  background: #ffffff;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.7);
}
/* Adjacent capsule: slightly wider (125%) — the wave's near neighbours. */
.tn-cap-btn.tn-cap-warm .tn-cap {
  width: 15px;
  background: var(--dsw-alias-border-l2);
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
