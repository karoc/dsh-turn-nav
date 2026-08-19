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
/* Wrapper: fixed column on the right edge (scroll buttons + rail + tooltip).
   The whole wrapper is pointer-events:auto so the wheel scrolls the rail
   anywhere on it; buttons sit above and below the rail. */
.tn-wrap {
  position: fixed;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 30;
  pointer-events: auto;
}
/* Up/down scroll controls at the top and bottom of the rail. Disabled (grey,
   no pointer/hover-scroll) when there is nothing to scroll in that
   direction. */
.tn-scroll-btn {
  flex: none;
  width: 26px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.tn-scroll-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.tn-scroll-btn:disabled {
  color: var(--dsw-alias-label-tertiary);
  opacity: 0.45;
  cursor: default;
}
/* Rail: AUTO-SIZING vertical column — its length grows with the turn count,
   capped at 30vh; once the cap is hit it scrolls internally. The scrollbar is
   HIDDEN (scrollbar-width:none + webkit) so its appear/disappear never shifts
   layout; scrolling is via wheel over the rail, the up/down buttons (click or
   hover-hold), or the rail-top auto-load. Buttons are packed flush (no gap)
   so hovering slides continuously without dead zones. */
.tn-rail {
  display: flex;
  flex-direction: column;
  width: 26px;
  height: auto;
  max-height: 30vh;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.tn-rail::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
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
   hover widening uses transform:scaleX (NOT width) with transform-origin on
   the RIGHT, so it grows LEFTWARD only (right-aligned — the right edge never
   moves), never reflows the rail or adds a horizontal scrollbar. */
.tn-cap {
  width: 12px;
  height: 3px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l3);
  transform-origin: right center;
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
/* Custom tooltip bubble: mirrors the DSH tooltip visual (dark plate, white
   text, pre-line for multi-line info), fixed-positioned to the LEFT of the
   rail so it never falls outside the browser window. */
.tn-tip {
  position: fixed;
  right: 40px; /* rail 26px + wrapper right 6px + 8px gap */
  z-index: 100;
  width: max-content;
  max-width: 50vw;
  padding: 3px 7px;
  border-radius: 8px;
  background: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-static-neutral-bluish-00);
  font-size: 13px;
  line-height: 20px;
  white-space: pre-line;
  overflow-wrap: break-word;
  pointer-events: none;
  animation: tn-tooltip-in 150ms var(--ds-ease-in-out);
}
@keyframes tn-tooltip-in {
  from { opacity: 0; }
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
