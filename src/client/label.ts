/**
 * Rail label composition — the ONE place the capsule's tooltip body is decided.
 *
 * Two content lines, mirroring the official rail's preview (`TurnNavigator.tsx`
 * renders a prompt line and a bounded response line): the turn's HUMAN prompt
 * when one was read (journal turns carry the full first human message;
 * loaded-window turns the host's bounded preview), and the host's bounded
 * RESPONSE preview when the turn has one.
 *
 * A turn with no human prompt (a goal continuation, a plugin waking, a
 * background-job notice, a subagent settlement, a compaction checkpoint) is
 * still a Turn: the tooltip leads with its localised NUMBER — exactly the
 * official fallback (`preview.prompt || t('chat.turnNavigation.turn', {turn})`)
 * — and shows the response beneath it, which is often the only content such a
 * turn has. Official dsh contains no `(no user message)` string, and neither do
 * we.
 *
 * The response is NEVER derived from the transcript by this plugin: it is the
 * host projection's value (`turnOutline.response`, or the loaded window's own
 * `response` for turns it holds), so the rail stays a read-only label over
 * host-computed data.
 *
 * Kept free of React so `scripts/test-turn-labels.mjs` can pin the rule without
 * rendering (the component passes its own `t`).
 */

/** Text-bearing part of one rail entry (the label channels). */
export interface LabelEntry {
  /** True turn number from the timeline / log — the label's `{n}`. */
  turn: number
  /** Unix epoch ms of the turn's start, when known. */
  startTime: number | undefined
  /** Full first human prompt (journal turns), when read. */
  fullText: string
  /** Bounded host preview of the same prompt (window turns), when read. */
  summary: string
  /** Bounded host preview of the turn's final response, when the host has one. */
  response?: string
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
 * Tooltip body for one turn: turn number, time when known, the human prompt when
 * one was read, and the response preview when the host has one.
 *
 * The prompt line is OMITTED when empty: the leading label already IS the turn
 * number, so repeating it (a raw official-style prompt fallback would) spends
 * the bubble's most valuable line on nothing.
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
  const prompt = (entry.fullText || entry.summary).trim()
  const response = (entry.response ?? '').trim()
  const lines = [label]
  if (time !== '') lines.push(time)
  if (prompt !== '') lines.push(prompt)
  if (response !== '') lines.push(response)
  return lines.join('\n')
}
