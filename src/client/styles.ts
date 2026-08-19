/**
 * Design-token styles for the turn-nav drawer (external plugin, no CSS
 * modules available). Re-declared against the official `--dsw-alias-*`
 * semantic tokens, namespaced under `tn-` to avoid collisions. Tokens carry
 * no fallback because the host theme always defines them on the app root.
 */
export const TURN_NAV_STYLES = `
/* Session-header trigger: a compact pill button matching the header
   utilities style (h28 r14, icon + label). */
.tn-trigger {
  display: inline-flex; align-items: center; gap: 4px;
  height: 28px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; line-height: 18px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
  white-space: nowrap;
}
.tn-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.tn-trigger-active {
  color: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
}
.tn-trigger-count {
  font-size: 11px; line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

/* Drawer: fixed right-side panel, full height, with a semi-transparent
   click-through backdrop. */
.tn-backdrop {
  position: fixed; inset: 0; z-index: 40;
  background: transparent;
  pointer-events: none;
}
.tn-drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 300px; max-width: 90vw;
  z-index: 41;
  display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-layer-1);
  border-left: 1px solid var(--dsw-alias-border-l2);
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.12);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  pointer-events: auto;
  animation: tn-slide-in 180ms ease-out;
}
@keyframes tn-slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.tn-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  flex: none;
}
.tn-header-title {
  margin: 0; font-size: 14px; line-height: 22px; font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.tn-header-count {
  font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.tn-header-spacer { flex: 1; }
.tn-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border: none; border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.tn-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

/* Turn list: scrollable body. */
.tn-list {
  flex: 1; overflow-y: auto;
  padding: 8px;
}

/* One turn entry: clickable row. */
.tn-item {
  display: flex; flex-direction: column; gap: 3px;
  width: 100%;
  padding: 10px 12px;
  border: none; border-left: 3px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.tn-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.tn-item-current {
  border-left-color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
}
.tn-item-current:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}
.tn-item-row {
  display: flex; align-items: baseline; gap: 6px;
}
.tn-item-index {
  flex: none;
  font-size: 12px; line-height: 18px; font-weight: 600;
  color: var(--dsw-alias-brand-primary);
  font-variant-numeric: tabular-nums;
}
.tn-item-time {
  flex: none;
  font-size: 11px; line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.tn-item-summary {
  font-size: 13px; line-height: 19px;
  color: var(--dsw-alias-label-secondary);
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tn-status-dot {
  width: 6px; height: 6px; border-radius: 50%; flex: none;
  background: var(--dsw-alias-label-tertiary);
}
.tn-status-running {
  background: var(--dsw-alias-brand-primary);
  animation: tn-pulse 1.4s ease-in-out infinite;
}
@keyframes tn-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Empty state. */
.tn-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px; line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
}

/* Highlight flash on the jumped-to row in the conversation flow. */
@keyframes tn-highlight-flash {
  0% { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, transparent); }
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
