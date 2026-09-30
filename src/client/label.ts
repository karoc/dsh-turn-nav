/**
 * Rail label composition — the ONE place the capsule's tooltip body is decided.
 *
 * The body is the turn's human prompt when one was read (journal turns carry the
 * full first human message; loaded-window turns carry the host's bounded
 * preview), and otherwise the LOCALIZED turn label. That fallback is exactly
 * what the official rail does (`TurnNavigator.tsx`:
 * `preview.prompt || t('chat.turnNavigation.turn', { turn })`), and official dsh
 * has no `(no user message)` string at all: a turn with no human prompt (a goal
 * continuation, a plugin waking, a subagent settlement, a compaction
 * checkpoint) is still a Turn, so it is labelled by its NUMBER — never by a
 * fabricated placeholder.
 *
 * Kept free of React so `scripts/test-turn-labels.mjs` can pin the rule without
 * rendering (the component passes its own `t`).
 */

/** Text-bearing part of one rail entry (the two label channels). */
export interface LabelEntry {
  /** True turn number from the timeline / log — the label's `{n}`. */
  turn: number
  /** Unix epoch ms of the turn's start, when known. */
  startTime: number | undefined
  /** Full first human prompt (journal turns), when read. */
  fullText: string
  /** Bounded host preview (window turns), when read. */
  summary: string
}

/** Translator bound to this plugin's namespace. */
export type LabelTranslator = (key: 'turnLabel', params?: Record<string, unknown>) => string

/** Short HH:MM from a Unix-epoch-ms timestamp (empty when unknown). */
export function formatTime(ms: number | undefined): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return ''
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * Tooltip body for one turn: the turn number, its time when known, and the
 * prompt — falling back to the localized turn label when no human prompt was
 * read.
 *
 * @param entry - the rail entry being previewed.
 * @param t - the plugin's translator (provides `turnLabel`).
 * @returns the multi-line tooltip text (the rail also renders it as the
 *   capsule's `aria-label`, newlines flattened).
 */
export function tooltipText(entry: LabelEntry, t: LabelTranslator): string {
  const time = formatTime(entry.startTime)
  // The label is the TRUE turn number (`entry.turn`), not a list position:
  // window-only extras carry a window-local index, which made merged lists show
  // e.g. "第 38 轮" followed by "第 2 轮".
  const label = t('turnLabel', { n: String(entry.turn) })
  const body = entry.fullText || entry.summary || label
  const lines = [label]
  if (time !== '') lines.push(time)
  lines.push(body)
  return lines.join('\n')
}
