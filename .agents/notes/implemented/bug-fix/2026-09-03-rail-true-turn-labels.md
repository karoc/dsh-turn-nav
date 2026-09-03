# Agent Note: rail-true-turn-labels

Status: implemented

## Problem

On long sessions the STN rail showed wrong turn numbers in tooltip/aria: users saw "第 38 轮" immediately followed by "第 2 轮". The label text came from `entry.index`, and each source assigned `index` over its OWN subset — the journal history channel re-derives it per page (`buildTurns` maps each page's turns to index 1..N), and window-only extras start at 1 too — so the sorted merged list carried duplicate/restarting indices at every history/window boundary.

## Decision

In `src/client/TurnNavRail.tsx`, the tooltip and button `aria-label` (both go through `tooltipText`) now label the capsule with `entry.turn` — the ABSOLUTE turn number from the timeline/journal — instead of `entry.index`. The merged display list (`useMemo` over historyTurns + window-extras) now re-derives `index` as pure sorted list position via `.sort((a,b)=>a.turn-b.turn).map((e,i)=>({...e,index:i+1}))`. `src/client/turns.ts` field comments were updated: `turn` is the UI label source; `index` is only "position within THIS source's list". Verified headless against the live GUI for a 40-turn (reported-bug) and a 79-turn session: aria-labels parse to strictly increasing 1..N with zero drops/null labels. Negative guarantee: `index` no longer means "turn number" anywhere; any consumer that needs the canonical number must read `turn`.
## Alternatives considered

**Re-index after merge only (keep labels from `index`)**: fixes the displayed restart but the window-only fallback (no journal channel) still labels from 1 each boot — the real-turn `turn` is strictly more correct, so this lost. **Sort by turn but leave stale per-source `index`**: cheapest fix that still mislabels whenever sources overlap — rejected for the same reason.
## Consequences

Cost: one extra `.map` over the merged list per `historyTurns`/`windowTurns` change (trivial; list is ≤ a few hundred capsules) and a semantic fiction removed — nothing else reads `index` as a label anymore. Bought: labels that are identical to the "正在定位第 N 轮" jump feedback and to the true conversation turn number, stable no matter how history paging or window/extras overlap changes. Follow-up: the zh/en locale string `turnLabel` stayed unchanged; only the `n` argument changed source.

