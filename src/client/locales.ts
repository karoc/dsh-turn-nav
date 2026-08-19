/** Copy dictionaries for the dsh-turn-navigator plugin. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  rail: 'Turn navigation',
  turnLabel: 'Turn {n}',
  noSummary: '(no user message)',
  locatingTurn: 'Locating turn {n}…',
  locateFailed: 'Could not locate turn {n}',
}

/** The turn-nav copy key set. */
export type TurnNavKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: { [Key in keyof typeof en]: string } = {
  rail: '轮次导航',
  turnLabel: '第 {n} 轮',
  noSummary: '（无用户消息）',
  locatingTurn: '正在定位第 {n} 轮…',
  locateFailed: '无法定位第 {n} 轮',
}
