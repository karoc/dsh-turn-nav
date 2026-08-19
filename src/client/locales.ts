/** Copy dictionaries for the dsh-turn-navigator plugin. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  trigger: 'Turns',
  triggerCount: '{n}',
  title: 'Turn navigation',
  close: 'Close',
  empty: 'No turns yet in this session.',
  turnLabel: 'Turn {n}',
  running: 'running',
}

/** The turn-nav copy key set. */
export type TurnNavKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: { [Key in keyof typeof en]: string } = {
  trigger: '轮次',
  triggerCount: '{n}',
  title: '轮次定位',
  close: '关闭',
  empty: '此会话暂无轮次。',
  turnLabel: '第 {n} 轮',
  running: '进行中',
}
