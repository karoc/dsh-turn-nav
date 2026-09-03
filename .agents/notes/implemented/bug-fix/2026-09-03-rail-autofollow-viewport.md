# Agent Note: rail-autofollow-viewport

Status: implemented

## Problem

The rail is height-capped at 30vh with an internal (hidden) scrollbar, so on long sessions the capsule for the CURRENT (active) turn routinely sits outside the rail's visible band — on open the capsule list starts at the top while the reading position is at the tail. The rail had follow-scroll highlighting (`activeTurn`) but never scrolled its OWN viewport, so in a long session the active capsule stayed invisible while the user read far-down content.

## Decision

In `src/client/TurnNavRail.tsx` a new effect tracks `[activeTurn, turns]`: it locates the active capsule (`turns.findIndex(e => e.turn === activeTurn)` → the corresponding `.tn-cap-btn`), and only when that capsule is NOT fully inside the rail's viewport rect does it call the existing `centerCapsule(index)` (same centered scroll as click activation). A new `pointerOverRailRef` (set on `onMouseEnter`, cleared on `onMouseLeave` of `.tn-wrap`) guards the effect: while the pointer is over the rail the auto-follow is skipped so browsing is never yanked. Verified headless against a 79-turn session (rail scrollHeight 790 vs clientHeight 180): on open the rail is scrolled so the active (tail) capsule is visible with a non-zero scrollTop.
## Alternatives considered

**No follow at all (status quo)**: exactly the reported defect — active capsule invisible in long sessions. **Unconditionally center on every `activeTurn` change**: would yank the rail out from under a user who is mid-browse — rejected in favor of the pointer-over guard.
## Consequences

Cost: a per-change `findIndex` + two `getBoundingClientRect()` reads on every `activeTurn`/`turns` bump — negligible for capsule lists of hundreds; the guard adds one boolean ref with no re-render. Bought: the rail's visible band always tracks the reading position automatically while never fighting the user's own rail interaction. Follow-up: if a future redesign drops the height cap, this effect becomes a no-op (capsule always in view) and can be removed.

