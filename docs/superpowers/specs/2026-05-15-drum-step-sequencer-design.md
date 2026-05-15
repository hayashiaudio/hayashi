---
title: Drum Step Sequencer
date: 2026-05-15
author: Claude
---

## Problem

Users can trigger drum pads manually or via MIDI, but there is no way to program repeating drum patterns visually. A step sequencer is essential for collaborative beatmaking inside Hayashi.

## Solution

Add a 16-step, 16-pad grid inside `DrumKitEditor` where users toggle steps and set per-step velocity. Patterns are stored as `DrumPattern` inside `Clip.pattern`, making them first-class pattern clips that can be placed, looped, resized, and split on the arrangement timeline. The transport scheduler reads pattern clips and calls `triggerPad` for active steps during playback.

## Data Model

### New Types

```typescript
export interface DrumStep {
  active: boolean;
  velocity: number; // 0.0 – 1.0
}

export interface DrumPattern {
  steps: number;       // fixed at 16 for v1
  padCount: number;    // fixed at 16 for v1
  grid: Record<string, DrumStep[]>; // key: `${padIndex}`, value: length-16 array
}
```

### Clip Extension

```typescript
export interface Clip {
  id: string;
  trackId: string;
  type: 'midi' | 'audio' | 'automation';
  startBeat: number;
  lengthBeats: number;
  loop: boolean;
  notes?: MidiNote[];
  assetId?: string;
  pattern?: DrumPattern; // NEW: present when type === 'midi' and source is drumPad
}
```

- When `pattern` is present, the clip is a **drum pattern clip**.
- `lengthBeats` defaults to 4 (one bar at 16th-note resolution) but can be resized.
- `loop: true` means the pattern repeats for the full clip length.

## Transport Scheduler Extension

`TransportScheduler.scheduleBeat` adds a second loop after the audio-clip loop:

1. For each clip where `clip.pattern` exists:
2. Determine `nodeId` from `track.sourceNodeId`.
3. Determine which step indices fall in the current scheduling window.
4. For each active step (`step.active === true`):
   - Compute exact `when` using `beatToSeconds`.
   - Look up `assetId` from `nodes[nodeId].params[pad-${padIndex}]`.
   - Call `triggerPad(nodeId, padIndex, assetId)` at `when`.

No changes to `drumEngine.ts` or `graphCompiler.ts`. Pattern hits reuse the existing submix routing.

## UI: Pattern Editor in DrumKitEditor

### New View Mode

`DrumKitEditor` gains a toggle: **Pads** / **Pattern**.

**Pattern view layout:**
- Top: 16-column step header (1–16)
- Left: pad labels (Kick, Snare, etc.) + mini color dot
- Grid: 16 × up-to-16 cells
  - Empty cell: transparent with faint border
  - Active cell: filled with pad accent color, opacity = `velocity`
  - Hover: slightly brighter
  - Click: toggle active (if inactive, sets velocity to 1.0)
  - Drag on active cell: adjust velocity up/down (0.0–1.0), visual feedback via opacity
- Bottom toolbar:
  - Playhead sweep indicator (orange line moving across steps during playback)
  - "Bounce to Clip" button: creates a `Clip` with `type: 'midi'`, `pattern`, and places it on the arrangement at the playhead
  - Clear pattern button

### Arrangement Grid Visuals

Pattern clips render differently from audio clips:
- Background: warm amber tint (`#d48c2e33`)
- Border: `1px solid #d48c2e99`
- Internal: tiny step grid thumbnail (4×4 or 8×8 mini squares) so users can read the pattern at a glance
- All existing drag, resize, split, and loop behavior works unchanged

## Audio Graph Integration

No new audio nodes. Pattern playback is transport-scheduler driven:
```
transportScheduler → triggerPad(nodeId, padIndex, assetId) → submix → workstation
```

## Yjs Sync

`DrumPattern` is plain JSON. It flows through existing snapshot/hydration:
- `extractSnapshotFromYjs` serializes `clip.pattern` automatically
- `hydrateYjsFromSnapshot` restores it automatically

No custom Yjs types needed.

## Edge Cases

| Case | Behavior |
|------|----------|
| Pattern clip resized to 8 beats (2 bars) | Pattern loops every 4 beats; scheduler handles modulo |
| Pattern clip split | Both halves keep the same pattern data (shallow copy) |
| Pad sample removed after pattern created | Pattern step remains active but `triggerPad` silently skips missing asset |
| Track source changed from drumPad to sampler | Pattern clips on that track are ignored by scheduler (sourceNodeId no longer drumPad) |
| Transport stop mid-pattern | `transportScheduler.stop()` cancels future scheduled hits; `activeSources` cleared |
| Multiple pattern clips on same track | Scheduler processes all clips independently; overlapping hits are additive |

## Dependencies

- `apps/client/src/types/project.ts` — add `DrumStep`, `DrumPattern`, extend `Clip`
- `apps/client/src/audio/transportScheduler.ts` — add pattern scheduling loop
- `apps/client/src/components/DrumKitEditor.tsx` — add Pattern toggle, step grid, velocity drag, bounce button
- `apps/client/src/components/ArrangementGrid.tsx` / `ClipLane.tsx` — distinguish pattern clips visually
- `apps/client/src/stores/projectStore.ts` — add `createPatternClip`, `updatePattern`, `clearPattern` actions
- `apps/client/src/index.css` — add `.hayashi-pattern-cell`, `.hayashi-pattern-cell-active`, `.hayashi-pattern-clip` classes

## Non-Goals

- Piano roll with pitch ranges (out of scope for drum sequencer)
- Per-step probability or ratcheting (future enhancement)
- Pattern export to MIDI file (future enhancement)
- Step sequencing for non-drumPad sources (oscillators, samplers)
- Real-time pattern recording from pad hits

## Testing Checklist

- [ ] Pattern editor toggles between Pads and Pattern view
- [ ] Clicking a step toggles active state
- [ ] Dragging on active step adjusts velocity (0.0–1.0)
- [ ] Transport plays active steps at correct timing
- [ ] Pattern clip appears on arrangement after "Bounce to Clip"
- [ ] Pattern clip loops correctly when resized to multiple bars
- [ ] Splitting a pattern clip produces two valid pattern clips
- [ ] Visual distinction between pattern and audio clips in arrangement
- [ ] Yjs sync preserves pattern data across collaborators
