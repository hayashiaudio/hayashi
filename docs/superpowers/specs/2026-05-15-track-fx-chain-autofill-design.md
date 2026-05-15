---
title: Track FX Chain Autofill Staging Area
date: 2026-05-15
author: Claude
---

## Problem

Users wire processor nodes in the patch canvas (`sampler → filter → delay → workstation`) but must manually drag each processor into the track FX chain row. Dragging across panels inside a Discord Activity iframe is awkward and many users never discover the feature.

## Solution

A **live staging area** inside the track FX chain row. Processors sitting in the patch graph between `track.sourceNodeId` and `track.workstationNodeId` appear as ghosted suggestion slots. Clicking a suggestion appends it to `track.fxChain`.

## Data Flow

Inside `TrackFxChain.tsx`, compute `suggestedIds` via BFS inside a `useMemo`:

1. Start from `track.sourceNodeId`.
2. Traverse edges where the **current node** is the `sourceNodeId` and the target is a **processor** node (kind in `registry.ts` category `processor`).
3. Do not traverse edges that originate from `track.workstationNodeId`; processors wired after the workstation are out of scope.
4. Collect processor IDs in BFS traversal order.
5. Exclude IDs already present in `track.fxChain`.
6. Memoize against `nodes`, `edges`, `track.sourceNodeId`, `track.workstationNodeId`, and `fxChain`.

No new store fields or Yjs schema changes.

## UI

The FX chain row keeps active slots on the left. After the last active slot (and before the manual `+` dropzone), render suggested slots:

- **Style:** same rounded pill shape as active slots, opacity `0.45`, colored by processor kind.
- **Label:** abbreviated kind label (e.g., "F" for filter), same font as active slots.
- **Hover:** opacity rises to `0.75`; a small `+` icon or "Add" overlay appears.
- **Click:** calls `updateTrackFxChain(trackId, [...fxChain, suggestedId])`, appending the processor to the active chain. The slot immediately promotes to full active styling.
- **Manual dropzone:** the existing dashed `+` box remains as a fallback for dragging nodes directly from the patch canvas.

## Edge Cases

| Case | Behavior |
|------|----------|
| No `sourceNodeId` / `workstationNodeId` | `suggestedIds` empty; no UI change |
| No path found between source and workstation | `suggestedIds` empty; no UI change |
| Circular graph | BFS `visited` set prevents infinite loop |
| Branching graph (multiple paths) | BFS collects all reachable processors; user picks which to add |
| Processor already in `fxChain` | Excluded from suggestions |
| Suggestion clicked while transport running | `updateTrackFxChain` triggers `graphCompiler.ts` track-bus rebuild; new FX is live on next clip schedule |

## Dependencies

- `TrackFxChain.tsx` — add BFS logic and suggested-slot rendering
- `apps/client/src/nodes/registry.ts` — use `NodeCategory === 'processor'` to determine traversable kinds
- `graphCompiler.ts` — no changes; existing `buildTrackBuses` already rebuilds FX on `fxChain` mutation

## Non-Goals

- Automatic insertion order based on graph depth; BFS order is sufficient
- Removing a processor from the patch canvas does not auto-remove it from `fxChain`; user must delete from the row manually (existing behavior)
- No new keyboard shortcuts or context menus

## Testing Checklist

- [ ] Suggested slots appear when a filter is wired between sampler and workstation
- [ ] Suggested slots disappear once processor is added to active chain
- [ ] Clicking suggestion appends processor to FX chain end
- [ ] Audio graph rebuilds correctly after suggestion is clicked
- [ ] Empty suggestion state when no processor path exists
- [ ] Circular graph does not cause infinite loop
- [ ] Manual dropzone still works after implementing suggestions
