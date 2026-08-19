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
   the rail past the viewport. The whole rail is pointer-events:auto so the
   wheel scrolls the rail anywhere on it (including the gaps between turns);
   a fixed width + overflow-x:hidden keeps it from ever gaining a horizontal
   scrollbar. */
.tn-rail {
  position: fixed;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 26px;
  max-height: 60vh;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  z-index: 30;
  pointer-events: auto;
}
/* Per-turn hotspot: a wider/taller transparent button so the tiny capsule
   still has a comfortable hover/click target. Fixed size — excess turns make
   the rail scroll, they never compress it. */
.tn-cap-btn {
  flex: none;
  min-height: 10px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
}
/* The visible capsule itself: grey, ~3px tall, ~12px wide by default. The
   hover widening uses transform:scaleX (NOT width), so it never reflows the
   rail or adds a horizontal scrollbar — no layout drift while sliding. */
.tn-cap {
  width: 12px;
  height: 3px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l3);
  transform-origin: center;
  transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
  flex: none;
}
/* Hovered capsule: glow with the theme's primary label color and widen 150%
   (the wave peak). Theme-following (dark theme = white, light theme = dark). */
.tn-cap-btn.tn-cap-hot .tn-cap {
  transform: scaleX(1.5);
  background: var(--dsw-alias-label-primary);
  box-shadow: 0 0 6px color-mix(in srgb, var(--dsw-alias-label-primary) 55%, transparent);
}
/* Adjacent capsule: slightly wider (125%) — the wave's near neighbours. */
.tn-cap-btn.tn-cap-warm .tn-cap {
  transform: scaleX(1.25);
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
