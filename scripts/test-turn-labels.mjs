#!/usr/bin/env node
/**
 * Behavioural test for the rail's LABEL rules — the regression gate for the
 * `(no user message)` defect.
 *
 * Why this exists: the rail labels a turn from three sources (the journal fold,
 * the loaded window's host preview, and the host `turnOutline` projection). A
 * turn with NO human prompt is a first-class state — the host's own
 * `turn/start` doc says rejection, empty input, cancellation, or failure "may
 * close it with no step", and `turn/start` is logged before the prompt is
 * claimed, so goal continuations, plugin wakings, subagent settlements and
 * compaction checkpoints all open turns without one. The defect was that the
 * data layer FABRICATED `(no user message)` in that case (and the journal fold
 * happily labelled such turns with the injected payload), which shadowed both
 * the localized turn-number label and the official outline fallback. Official
 * dsh has no such string: `TurnNavigator.tsx` renders
 * `preview.prompt || t('chat.turnNavigation.turn', { turn })`.
 *
 * The test imports the REAL source modules through Node's type stripping — no
 * bundle, no React, no GUI — so it can pin the semantics the visual layer
 * depends on.
 *
 * Negative controls (scripts/test-negative-controls.mjs) restore each defect and
 * assert this file fails.
 */
import assert from 'node:assert/strict'
import { buildTurns } from '../src/client/history.ts'
import { extractTurns } from '../src/client/turns.ts'
import { mergeRailTurns } from '../src/client/merge.ts'
import { tooltipText, formatTime } from '../src/client/label.ts'
import { en, zh } from '../src/client/locales.ts'

// ── fixtures ───────────────────────────────────────────────────────────────
const T0 = 1_700_000_000_000

/** One durable log event (`surfaceOp` absent = legacy log, i.e. appended). */
const event = (type, seq, data, surfaceOp) => ({ type, seq, time: T0 + seq * 1000, data, ...(surfaceOp === undefined ? {} : { surfaceOp }) })
const turnStart = (turn, seq) => event('turn/start', seq, { turn })
const turnEnd = (turn, seq) => event('turn/end', seq, { turn })
const human = (seq, text, seqOverride) => event('user/message', seq, { source: { kind: 'user' }, content: [{ type: 'text', text }] }, seqOverride)
const injected = (seq, kind, text) => event('user/message', seq, { source: { kind }, content: [{ type: 'text', text }] }, 'append')

/** Translator over a real dictionary (same contract the rail's `t` has). */
const translator = (dict) => (key, params) => String(dict[key]).replace('{n}', String(params?.n ?? ''))

// ── journal fold: who may label a turn ─────────────────────────────────────
{
  const turns = buildTurns([
    turnStart(1, 0),
    human(1, '  真正的用户提示词  '),
    turnEnd(1, 2),
    turnStart(2, 3),
    injected(3, 'goal', '<goal_round>Objective: internal payload</goal_round>'),
    turnEnd(2, 5),
    turnStart(3, 6),
    event('user/message', 7, { source: { kind: 'compact-checkpoint' }, content: [{ type: 'text', text: 'checkpoint summary' }] }, { op: 'replace' }),
    turnEnd(3, 8),
    turnStart(4, 9),
    human(9, '   '),
    turnEnd(4, 11),
    turnStart(5, 12),
    turnEnd(5, 13),
  ])

  assert.equal(turns.length, 5, 'the fold keeps every started turn')

  assert.equal(turns[0].fullText, '真正的用户提示词', 'a human prompt labels its turn (full text, trimmed)')
  assert.equal(turns[0].summary, '真正的用户提示词', 'a short human prompt is also the bounded summary')

  assert.equal(turns[1].summary, '', 'a machine-woken turn keeps an empty label in the journal fold')
  assert.equal(turns[1].fullText, '', 'a machine-woken turn never surfaces its injected payload')
  assert.ok(
    !JSON.stringify(turns[1]).includes('goal_round'),
    'the journal fold never copies injected payload text into a turn label',
  )

  assert.equal(turns[2].summary, '', 'a replaced (compaction checkpoint) message never labels its turn')
  assert.equal(turns[3].summary, '', 'a whitespace-only prompt does not label its turn')
  assert.equal(turns[4].summary, '', 'a turn closed with no user message at all keeps an empty label')

  for (const turn of turns) {
    assert.ok(
      !JSON.stringify(turn).includes('no user message'),
      'no data-layer path fabricates a "(no user message)" placeholder',
    )
  }

  const long = buildTurns([turnStart(1, 0), human(1, 'x'.repeat(200)), turnEnd(1, 2)])
  assert.equal(long[0].summary.length, 80, 'the journal summary stays bounded to 80 chars')
  assert.equal(long[0].fullText.length, 200, 'the journal full text stays unbounded')
}

// ── window path: only a human node labels a turn ───────────────────────────
{
  const nodes = new Map([
    ['u1', { key: 'u1', kind: 'user', data: { kind: 'user', seq: 1, time: T0, content: [{ type: 'text', text: '窗口内的提示词' }] } }],
    ['a2', { key: 'a2', kind: 'assistant-step', data: { blocks: [{ kind: 'text', text: 'assistant text' }] } }],
    ['c3', { key: 'c3', kind: 'context', data: { content: [{ type: 'text', text: 'runtime context text' }] } }],
    ['t4', { key: 't4', kind: 'turn-trigger', data: { content: [{ type: 'text', text: 'goal text' }] } }],
  ])
  const chat = {
    order: ['u1', 'a2', 'c3', 't4'],
    nodes: { get: (key) => nodes.get(key) },
    locations: { getTurn: (turn) => (turn === 1 ? ['u1', 'a2'] : turn === 2 ? ['c3', 'a2'] : ['t4']) },
    timeline: {
      turnOrder: [1, 2, 3],
      turns: new Map([
        [1, { turn: 1, start: { time: T0 }, status: 'closed' }],
        [2, { turn: 2, start: { time: T0 + 1000 }, status: 'closed' }],
        [3, { turn: 3, start: { time: T0 + 2000 }, status: 'open' }],
      ]),
    },
  }

  const turns = extractTurns(chat)
  assert.equal(turns.length, 3, 'the window path keeps every timeline turn')
  assert.equal(turns[0].fullText, '窗口内的提示词', 'a window turn with a human node carries its prompt')
  assert.equal(turns[1].summary, '', 'a window turn without a human node keeps an empty label')
  assert.equal(turns[1].fullText, '', 'a window turn never peeks at assistant or context text')
  assert.equal(turns[2].summary, '', 'a turn-trigger (machine-woken) window turn keeps an empty label')
}

// ── merge: blank channels never shadow a labelled one ──────────────────────
{
  const history = [{ turn: 1, index: 1, summary: '', fullText: '', startTime: T0, status: 'closed' }]
  const window = [{ turn: 1, index: 1, summary: '窗口预览', fullText: '窗口预览', startTime: T0 + 5, status: 'open' }]
  const merged = mergeRailTurns(history, window, undefined)
  assert.equal(merged[0].summary, '窗口预览', 'a blank journal entry never shadows a labelled window entry')
  assert.equal(merged[0].status, 'open', 'the window keeps its live status on a shared turn')

  const outline = [
    { turn: 1, prompt: 'outline 提示词' },
    { turn: 2, prompt: '' },
    { turn: 3, prompt: '第三轮的人类提示词' },
  ]
  const empty = [{ turn: 1, index: 1, summary: '', fullText: '', startTime: T0, status: 'closed' }]
  const withOutline = mergeRailTurns(empty, [], outline)
  assert.equal(withOutline[0].summary, 'outline 提示词', 'the host outline labels a turn its own channel could not read')
  assert.equal(withOutline[1].summary, '', 'an outline entry with no human prompt stays unlabelled')
  assert.equal(withOutline[2].summary, '第三轮的人类提示词', 'the outline labels turns missing from both read channels')
  assert.deepEqual(withOutline.map((entry) => entry.index), [1, 2, 3], 'the merged list re-derives every index')

  const bothEmpty = mergeRailTurns([], empty.map((entry) => ({ ...entry, turn: 9 })), [])
  assert.equal(bothEmpty[0].summary, '', 'a turn no channel could label keeps an empty summary (label time decides)')
}

// ── tooltip: the localized turn number is the fallback ─────────────────────
{
  const unlabelled = { turn: 3, startTime: T0, fullText: '', summary: '' }
  const enTooltip = tooltipText(unlabelled, translator(en))
  const zhTooltip = tooltipText(unlabelled, translator(zh))
  assert.ok(enTooltip.endsWith('Turn 3'), 'the tooltip body falls back to the localized turn label (en)')
  assert.ok(zhTooltip.endsWith('第 3 轮'), 'the tooltip body falls back to the localized turn label (zh)')
  assert.ok(
    !enTooltip.includes('no user message') && !zhTooltip.includes('无用户消息'),
    'the tooltip never renders a fabricated placeholder for a turn without a human prompt',
  )

  const labelled = tooltipText({ turn: 7, startTime: T0, fullText: '真实提示词', summary: '真实提示词' }, translator(en))
  assert.ok(labelled.includes('真实提示词'), 'the tooltip shows the prompt when one was read')
  assert.ok(labelled.startsWith('Turn 7'), 'the tooltip always leads with the turn number')

  assert.equal(formatTime(undefined), '', 'an unknown start time renders no time line')
}

console.log('PASS — turn labels (journal/window/outline merge + localized fallback, no fabricated placeholder)')
