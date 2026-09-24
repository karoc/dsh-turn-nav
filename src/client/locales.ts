/** Copy dictionaries for the dsh-turn-navigator plugin (Smoothly Turn Nav / 思磨力轮次胶囊条). */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  rail: 'Turn navigation',
  scrollUp: 'Scroll rail up',
  scrollDown: 'Scroll rail down',
  turnLabel: 'Turn {n}',
  noSummary: '(no user message)',
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
  noSummary: '（无用户消息）',
  locatingTurn: '正在定位第 {n} 轮…',
  locateFailed: '无法定位第 {n} 轮',
  modeRowTitle: '轮次导航',
  modeRowDesc: '选择显示哪个轮次胶囊条：DSH 官方、思磨力轮次胶囊条（Smoothly Turn Nav），或全部隐藏。',
  modeOfficial: 'DSH 官方',
  modeSTN: '思磨力轮次胶囊条',
  modeHidden: '全部隐藏',
}
