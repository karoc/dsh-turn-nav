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
import { markLabel, tooltipText, formatTime } from '../src/client/label.ts'
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

// ── window path (0.1.2+ navigation projection) ─────────────────────────────
{
  const nodes = new Map([
    ['u1', { key: 'u1', kind: 'user', data: { kind: 'user', seq: 1, time: T0, content: [{ type: 'text', text: '窗口内的提示词' }] } }],
    ['t4', { key: 't4', kind: 'turn-trigger', data: { content: [{ type: 'text', text: 'goal text' }] } }],
  ])
  const chat = {
    order: ['u1', 't4'],
    nodes: { get: (key) => nodes.get(key) },
    locations: { getTurn: (turn) => (turn === 1 ? ['u1'] : ['t4']) },
    navigation: {
      items: () => [
        { turn: 1, anchorKey: 'u1', prompt: '窗口内的提示词', response: '第一轮的回复预览' },
        { turn: 2, anchorKey: 't4', prompt: '', response: '窗口里的回复预览' },
      ],
    },
    timeline: {
      turnOrder: [1, 2],
      turns: new Map([
        [1, { turn: 1, start: { time: T0 }, status: 'closed' }],
        [2, { turn: 2, start: { time: T0 + 1000 }, status: 'closed' }],
      ]),
    },
  }
  const turns = extractTurns(chat)
  assert.equal(turns[0].response, '第一轮的回复预览', 'a loaded window turn carries the host response projection')
  assert.equal(turns[1].response, '窗口里的回复预览', 'a machine-woken window turn carries its response preview')
  assert.equal(turns[1].summary, '', 'a machine-woken window turn still has no prompt')
}

// ── window path (legacy timeline, no navigation projection) ────────────────
{
  const nodes = new Map([
    ['u1', { key: 'u1', kind: 'user', data: { kind: 'user', seq: 1, time: T0, content: [{ type: 'text', text: 'legacy 提示词' }] } }],
  ])
  const chat = {
    nodes: { get: (key) => nodes.get(key) },
    locations: { getTurn: () => ['u1'] },
    timeline: {
      turnOrder: [1],
      turns: new Map([[1, { turn: 1, start: { time: T0 }, status: 'closed' }]]),
    },
  }
  const turns = extractTurns(chat)
  assert.equal(turns[0].fullText, 'legacy 提示词', 'the legacy timeline path still labels from a human node')
  assert.equal(turns[0].response, '', 'the legacy timeline path carries no response (the outline merge fills it)')
}

// ── merge: blank channels never shadow a labelled one ──────────────────────
{
  const history = [{ turn: 1, index: 1, summary: '', fullText: '', response: '', loaded: false, startTime: T0, status: 'closed' }]
  const window = [{ turn: 1, index: 1, summary: '窗口预览', fullText: '窗口预览', response: '窗口回复', loaded: true, startTime: T0 + 5, status: 'open' }]
  const merged = mergeRailTurns(history, window, undefined)
  assert.equal(merged[0].summary, '窗口预览', 'a blank journal entry never shadows a labelled window entry')
  assert.equal(merged[0].status, 'open', 'the window keeps its live status on a shared turn')

  const outline = [
    { turn: 1, prompt: 'outline 提示词', response: 'outline 回复一' },
    { turn: 2, prompt: '', response: 'outline 回复二' },
    { turn: 3, prompt: '第三轮的人类提示词', response: '' },
  ]
  const empty = [{ turn: 1, index: 1, summary: '', fullText: '', response: '', loaded: false, startTime: T0, status: 'closed' }]
  const withOutline = mergeRailTurns(empty, [], outline)
  assert.equal(withOutline[0].summary, 'outline 提示词', 'the host outline labels a turn its own channel could not read')
  assert.equal(withOutline[1].summary, '', 'an outline entry with no human prompt stays unlabelled')
  assert.equal(withOutline[2].summary, '第三轮的人类提示词', 'the outline labels turns missing from both read channels')
  assert.deepEqual(withOutline.map((entry) => entry.index), [1, 2, 3], 'the merged list re-derives every index')

  assert.equal(merged[0].response, '窗口回复', 'the loaded window response wins over the outline response')
  assert.equal(merged[0].loaded, true, 'a turn the window holds is marked loaded (the official anchor kind)')
  assert.equal(withOutline[0].loaded, false, 'a journal/outline-only turn is marked unloaded')
  assert.equal(
    markLabel({ turn: 46, loaded: true }, translator(en)),
    'Jump to turn 46',
    'a loaded capsule is named by the jump ACTION, like the official rail',
  )
  assert.equal(
    markLabel({ turn: 46, loaded: false }, translator(en)),
    'Load and jump to turn 46',
    'an unloaded capsule announces that it pages history in first (official jumpLoad wording)',
  )
  assert.equal(markLabel({ turn: 7, loaded: true }, translator(zh)), '跳转到第 7 轮', 'the action name is localized (zh)')
  assert.equal(markLabel({ turn: 7, loaded: false }, translator(zh)), '加载并跳转到第 7 轮', 'the load variant is localized (zh)')
  assert.ok(
    !markLabel({ turn: 46, loaded: true }, translator(en)).includes('linux-smoke'),
    'the accessible name never recites the preview content (that is the description)',
  )
  assert.equal(withOutline[0].response, 'outline 回复一', 'the outline response labels a journal turn the window does not hold')
  assert.equal(withOutline[1].response, 'outline 回复二', 'a machine-woken turn keeps the outline response preview')
  assert.equal(withOutline[2].response, '', 'a turn whose response preview is empty stays empty')

  const bothEmpty = mergeRailTurns([], empty.map((entry) => ({ ...entry, turn: 9 })), [])
  assert.equal(bothEmpty[0].summary, '', 'a turn no channel could label keeps an empty summary (label time decides)')
}

// ── tooltip: the localized turn number is the fallback ─────────────────────
{
  const unlabelled = { turn: 3, startTime: T0, fullText: '', summary: '', response: '' }
  const enTooltip = tooltipText(unlabelled, translator(en))
  const zhTooltip = tooltipText(unlabelled, translator(zh))
  assert.ok(enTooltip.startsWith('Turn 3'), 'the tooltip leads with the localized turn label (en)')
  assert.ok(zhTooltip.startsWith('第 3 轮'), 'the tooltip leads with the localized turn label (zh)')
  assert.ok(
    !enTooltip.includes('no user message') && !zhTooltip.includes('无用户消息'),
    'the tooltip never renders a fabricated placeholder for a turn without a human prompt',
  )
  assert.equal(enTooltip.split('\n').length, 2, 'a turn with neither prompt nor response shows label + time only')
  assert.equal(
    tooltipText({ turn: 3, startTime: undefined, fullText: '', summary: '' }, translator(en)).split('\n').length,
    1,
    'an unknown time collapses the tooltip to the label alone',
  )

  // The reported case: a machine-woken turn whose ONLY content is the host's
  // response preview (official rail shows "Turn N" + response there).
  const machineWoken = tooltipText(
    { turn: 46, startTime: T0, fullText: '', summary: '', response: '## linux-smoke 修复闭环 + 一个新门禁' },
    translator(en),
  )
  assert.ok(machineWoken.includes('## linux-smoke 修复闭环 + 一个新门禁'), 'the tooltip shows the host response preview on a turn without a human prompt')
  assert.equal(machineWoken.split('\n').filter((line) => line === 'Turn 46').length, 1, 'the prompt line is not a duplicate of the leading turn label')

  const labelled = tooltipText({ turn: 7, startTime: T0, fullText: '真实提示词', summary: '真实提示词', response: '回复预览' }, translator(en))
  assert.ok(labelled.includes('真实提示词'), 'the tooltip shows the prompt when one was read')
  assert.ok(labelled.endsWith('回复预览'), 'the tooltip appends the response preview after the prompt')
  assert.ok(labelled.startsWith('Turn 7'), 'the tooltip always leads with the turn number')
  assert.equal(labelled.split('\n').length, 4, 'a human turn renders label + time + prompt + response')

  assert.equal(formatTime(undefined), '', 'an unknown start time renders no time line')
}

console.log('PASS — turn labels (journal/window/outline merge + prompt/response previews + localized fallback, no fabricated placeholder)')
