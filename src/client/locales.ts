/** Copy dictionaries for the dsh-turn-navigator plugin (Smoothly Turn Nav / 思磨力轮次胶囊条). */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  rail: 'Turn navigation',
  scrollUp: 'Scroll rail up',
  scrollDown: 'Scroll rail down',
  // Tooltip body fallback when a turn has no human prompt (machine-woken turn,
  // compaction checkpoint, mid-turn window head): the turn is labelled by its
  // NUMBER — the official rail does the same and has no placeholder string.
  turnLabel: 'Turn {n}',
  // Accessible NAME of a capsule — the ACTION, exactly like the official rail
  // (`chat.turnNavigation.jump` / `jumpLoad`). The prompt/response content is
  // exposed through aria-describedby instead of being baked into the name.
  jumpToTurn: 'Jump to turn {n}',
  jumpToTurnLoad: 'Load and jump to turn {n}',
  locatingTurn: 'Locating turn {n}…',
  locateFailed: 'Could not locate turn {n}',
  // Settings → General preference row (which rail to show).
  modeRowTitle: 'Turn navigation',
  modeRowDesc: 'Which turn-navigation rail to display: the DSH built-in, Smoothly TN (Smoothly Turn Nav), or none.',
  modeOfficial: 'DSH official',
  modeSTN: 'Smoothly TN',
  modeHidden: 'Hide all',
}

/** The turn-nav copy key set. */
export type TurnNavKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: { [Key in keyof typeof en]: string } = {
  rail: '轮次导航',
  scrollUp: '向上滚动胶囊条',
  scrollDown: '向下滚动胶囊条',
  turnLabel: '第 {n} 轮',
  jumpToTurn: '跳转到第 {n} 轮',
  jumpToTurnLoad: '加载并跳转到第 {n} 轮',
  locatingTurn: '正在定位第 {n} 轮…',
  locateFailed: '无法定位第 {n} 轮',
  modeRowTitle: '轮次导航',
  modeRowDesc: '选择显示哪个轮次胶囊条：DSH 官方、思磨力轮次胶囊条（Smoothly Turn Nav），或全部隐藏。',
  modeOfficial: 'DSH 官方',
  modeSTN: '思磨力轮次胶囊条',
  modeHidden: '全部隐藏',
}
