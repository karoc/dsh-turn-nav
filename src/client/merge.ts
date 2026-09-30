/**
 * Rail list merge: the three label sources of one turn meet here.
 *
 *  - `history` — turns folded from the persisted log BELOW the loaded window
 *    (full first human prompt);
 *  - `window`  — turns the conversation window holds (the host's bounded
 *    `prompt` preview, empty while a turn has no loaded human node);
 *  - `outline` — the host's whole-log `turnOutline` projection, fed from human
 *    messages only.
 *
 * This mirrors the official merge (`ui-chat/src/client/chat/turn-rail-items.ts`:
 * "a turn present in both sides keeps the loaded anchor, taking an outline
 * preview only where the window's own is empty") with one addition the official
 * side gets for free from its shape: OUR two channels are both optional, so a
 * blank entry from one channel must never shadow a labelled entry from the
 * other — an empty `summary` is a missing read, not a fact about the turn.
 *
 * Pure and React-free, so `scripts/test-turn-labels.mjs` pins the behaviour.
 */

/** One turn as either source derived it (both channels share this shape). */
export interface RailSourceTurn {
  turn: number
  index: number
  summary: string
  fullText: string
  startTime: number | undefined
  status: string
}

/** One `turnOutline` entry (host projection; `prompt` is `''` until a human prompt lands). */
export interface OutlineTurnLike {
  readonly turn: number
  readonly prompt: string
}

/** First string with visible content (empty/whitespace-only counts as absent). */
function firstText(...values: readonly (string | undefined)[]): string {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') return value
  }
  return ''
}

/**
 * Merge the channels into the rail's ascending list.
 *
 * The TURN SET is the union of all three channels: the host outline names every
 * turn of the session (that is how the official rail lists turns outside its
 * window), so a turn neither of our read channels reached still gets a capsule
 * instead of disappearing from the rail.
 *
 * Text resolution per turn: history → window → outline prompt. An outline prompt
 * is bounded (the host caps it at one rail-card line), so it doubles as both the
 * summary and the full text when it is the only source. Anchor fields prefer the
 * history entry's timestamp and the window's live status.
 *
 * @param history - journal-derived turns (may be empty).
 * @param window - loaded-window turns (may be empty).
 * @param outline - the `turnOutline` projection value, absent while the host
 *   unit is unmounted or no baseline carried the key.
 * @returns every known turn, ascending, with the list position as `index`.
 */
export function mergeRailTurns(
  history: readonly RailSourceTurn[],
  window: readonly RailSourceTurn[],
  outline: readonly OutlineTurnLike[] | undefined,
): RailSourceTurn[] {
  const historyByTurn = new Map(history.map((entry) => [entry.turn, entry]))
  const windowByTurn = new Map(window.map((entry) => [entry.turn, entry]))
  const outlineByTurn = new Map((outline ?? []).map((entry) => [entry.turn, entry.prompt]))
  const turns = [...new Set([...historyByTurn.keys(), ...windowByTurn.keys(), ...outlineByTurn.keys()])]
    .sort((a, b) => a - b)

  return turns.map((turn, position) => {
    const fromHistory = historyByTurn.get(turn)
    const fromWindow = windowByTurn.get(turn)
    const fromOutline = outlineByTurn.get(turn)
    const summary = firstText(fromHistory?.summary, fromWindow?.summary, fromOutline)
    return {
      turn,
      index: position + 1,
      summary,
      // The outline's bounded prompt is all we have for turns neither channel
      // could label; showing it beats showing nothing.
      fullText: firstText(fromHistory?.fullText, fromWindow?.fullText, summary),
      startTime: fromHistory?.startTime ?? fromWindow?.startTime,
      status: fromWindow?.status ?? fromHistory?.status ?? 'closed',
    }
  })
}
