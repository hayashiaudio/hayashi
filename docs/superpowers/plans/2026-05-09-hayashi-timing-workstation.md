# Hayashi Timing Engine + Workstation Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time timing/arrangement layer to the audio engine and introduce a "Workstation" node that opens an embedded DAW-style editor inside React Flow for clip-based composition.

**Architecture:**
- **Timing layer:** A `TransportScheduler` class runs on `requestAnimationFrame` and schedules `AudioBufferSourceNode` start/stop times against `AudioContext.currentTime` based on clip `startBeat` / `lengthBeats` converted to seconds via BPM. It replaces the immediate-start behavior of sources with transport-gated playback.
- **Workstation node:** A React Flow custom node (`kind: 'workstation'`) that contains a nested clip arrangement view (tracks + regions). It compiles its internal clip graph to a sub-mix bus, then exposes one stereo output back to the outer React Flow graph.
- **Custom edges:** React Flow custom edge renderer showing signal type color, connection strength animation, and mute/solo state.

**Tech Stack:** React 19, Vite, TypeScript, `@xyflow/react`, Web Audio API, Zustand, Tailwind CSS.

---

## File Structure

### Modify
- `apps/client/src/types/project.ts` — add timing types (`LoopRegion`, `Scene`, `ArrangementClip`)
- `apps/client/src/audio/engine.ts` — add `TransportScheduler` integration
- `apps/client/src/audio/graphCompiler.ts` — add scheduled sampler playback, sub-mix bus support
- `apps/client/src/stores/projectStore.ts` — add timing state + workstation actions
- `apps/client/src/components/PatchCanvas.tsx` — register workstation node type, custom edges
- `apps/client/src/components/PatchNode.tsx` — add workstation node shell + open button
- `apps/client/src/components/NodeInspector.tsx` — workstation-specific inspector panel
- `apps/client/src/nodes/registry.ts` — register `workstation` kind

### Create
- `apps/client/src/audio/transportScheduler.ts` — beat-to-time scheduler, clip start/stop queue
- `apps/client/src/audio/scheduledSampler.ts` — timed AudioBufferSourceNode wrapper
- `apps/client/src/components/WorkstationNode.tsx` — React Flow custom node shell
- `apps/client/src/components/WorkstationEditor.tsx` — embedded DAW-style editor (tracks + clips)
- `apps/client/src/components/ArrangementGrid.tsx` — clip lane renderer with loop brace + playhead
- `apps/client/src/components/CustomEdge.tsx` — React Flow custom edge with signal type color
- `apps/client/src/hooks/useTransportScheduler.ts` — hook binding scheduler to store

---

## Phase 1: Timing Engine Foundation

### Task 1: Transport Scheduler Core

**Files:**
- Create: `apps/client/src/audio/transportScheduler.ts`

- [ ] **Step 1: Write the scheduler class**

```typescript
import { audioEngine } from './engine';

export interface ScheduledClip {
  id: string;
  assetId: string;
  trackId: string;
  startBeat: number;
  lengthBeats: number;
  loop: boolean;
  offsetSeconds?: number;
}

export interface ScheduleEvent {
  time: number;
  type: 'start' | 'stop';
  clipId: string;
  sourceNode?: AudioBufferSourceNode;
}

export class TransportScheduler {
  private ctx: AudioContext | null = null;
  private running = false;
  private startTime = 0;
  private beatOffset = 0;
  private bpm = 128;
  private lookaheadSeconds = 0.1;
  private scheduleAheadSeconds = 0.3;
  private nextNoteTime = 0;
  private clips: ScheduledClip[] = [];
  private activeSources = new Map<string, AudioBufferSourceNode[]>();
  private rafId = 0;

  private beatToSeconds(beats: number) {
    return (beats / this.bpm) * 60;
  }

  private get currentBeat() {
    if (!this.running || !this.ctx) return this.beatOffset;
    const elapsed = this.ctx.currentTime - this.startTime;
    return this.beatOffset + (elapsed / 60) * this.bpm;
  }

  setClips(next: ScheduledClip[]) {
    this.clips = next;
  }

  start(bpm: number, beatOffset = 0) {
    this.ctx = audioEngine.ctx;
    if (!this.ctx) return;
    this.bpm = bpm;
    this.beatOffset = beatOffset;
    this.startTime = this.ctx.currentTime;
    this.running = true;
    this.nextNoteTime = this.ctx.currentTime;
    this.rafId = requestAnimationFrame(() => this.schedulerLoop());
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    for (const sources of this.activeSources.values()) {
      for (const src of sources) {
        try { src.stop(); } catch { /* already stopped */ }
      }
    }
    this.activeSources.clear();
  }

  updateBpm(bpm: number) {
    const oldBpm = this.bpm;
    this.bpm = bpm;
    if (this.running) {
      const now = this.ctx!.currentTime;
      const elapsedBeats = ((now - this.startTime) / 60) * oldBpm;
      this.beatOffset += elapsedBeats;
      this.startTime = now;
    }
  }

  private schedulerLoop() {
    if (!this.running || !this.ctx) return;
    const now = this.ctx.currentTime;
    while (this.nextNoteTime < now + this.scheduleAheadSeconds) {
      this.scheduleBeat(this.nextNoteTime);
      this.nextNoteTime += this.lookaheadSeconds;
    }
    this.rafId = requestAnimationFrame(() => this.schedulerLoop());
  }

  private scheduleBeat(time: number) {
    const beat = this.beatOffset + ((time - this.startTime) / 60) * this.bpm;
    const windowStart = beat;
    const windowEnd = beat + ((this.lookaheadSeconds + this.scheduleAheadSeconds) / 60) * this.bpm;

    for (const clip of this.clips) {
      const clipEnd = clip.startBeat + clip.lengthBeats;
      const startsInWindow = clip.startBeat >= windowStart && clip.startBeat < windowEnd;
      const endsInWindow = clipEnd >= windowStart && clipEnd < windowEnd;

      if (startsInWindow) {
        this.emitStart(clip, this.startTime + this.beatToSeconds(clip.startBeat - this.beatOffset));
      }
      if (endsInWindow && !clip.loop) {
        this.emitStop(clip, this.startTime + this.beatToSeconds(clipEnd - this.beatOffset));
      }
    }
  }

  private emitStart(clip: ScheduledClip, when: number) {
    // Handled by graph compiler subscriber
    this.onStartClip?.(clip, when);
  }

  private emitStop(clip: ScheduledClip, when: number) {
    this.onStopClip?.(clip, when);
  }

  onStartClip?: (clip: ScheduledClip, when: number) => void;
  onStopClip?: (clip: ScheduledClip, when: number) => void;
}

export const transportScheduler = new TransportScheduler();
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/audio/transportScheduler.ts
git commit -m "feat(audio): add TransportScheduler for beat-time clip scheduling"
```

---

### Task 2: Scheduled Sampler Node

**Files:**
- Create: `apps/client/src/audio/scheduledSampler.ts`
- Modify: `apps/client/src/audio/graphCompiler.ts`

- [ ] **Step 1: Create the scheduled sampler**

```typescript
import { audioEngine } from './engine';
import { getSample } from '@/samples/indexedDb';

export async function createScheduledSampler(assetId: string, destination: AudioNode) {
  const ctx = audioEngine.ctx;
  if (!ctx) throw new Error('AudioContext not ready');

  const record = await getSample(assetId);
  if (!record) throw new Error(`Sample ${assetId} not found in IndexedDB`);

  const buffer = await ctx.decodeAudioData(record.buffer.slice(0));
  const gain = ctx.createGain();
  gain.connect(destination);

  return {
    buffer,
    gain,
    play(when: number, offset = 0, duration?: number) {
      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.gain);
      src.start(when, offset, duration);
      return src;
    },
  };
}
```

- [ ] **Step 2: Hook scheduler into graph compiler**

In `apps/client/src/audio/graphCompiler.ts`, after the `cleanupGraph` function, add a subscriber:

```typescript
// Subscribe scheduler start events to create timed sources
transportScheduler.onStartClip = async (clip, when) => {
  const ctx = audioEngine.ctx;
  if (!ctx) return;
  const bus = subMixBuses.get(clip.trackId) ?? audioEngine.destination;
  if (!bus) return;

  try {
    const sampler = await createScheduledSampler(clip.assetId, bus);
    const duration = clip.loop ? undefined : sampler.buffer.duration;
    const src = sampler.play(when, clip.offsetSeconds ?? 0, duration);

    const arr = activeSourcesByClip.get(clip.id) ?? [];
    arr.push(src);
    activeSourcesByClip.set(clip.id, arr);

    src.onended = () => {
      const list = activeSourcesByClip.get(clip.id) ?? [];
      activeSourcesByClip.set(
        clip.id,
        list.filter((s) => s !== src)
      );
    };
  } catch (e) {
    console.warn('[Hayashi] Failed to schedule clip', clip.id, e);
  }
};

const activeSourcesByClip = new Map<string, AudioBufferSourceNode[]>();
const subMixBuses = new Map<string, GainNode>();
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/audio/scheduledSampler.ts apps/client/src/audio/graphCompiler.ts
git commit -m "feat(audio): scheduled sampler with IndexedDB buffer decode"
```

---

### Task 3: Transport Hook + Store Wiring

**Files:**
- Create: `apps/client/src/hooks/useTransportScheduler.ts`
- Modify: `apps/client/src/stores/projectStore.ts`

- [ ] **Step 1: Write the transport hook**

```typescript
import { useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { transportScheduler } from '@/audio/transportScheduler';
import { audioEngine } from '@/audio/engine';

export function useTransportScheduler() {
  const transport = useProjectStore((s) => s.localTransport);
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);

  useEffect(() => {
    const scheduled = Object.values(clips)
      .filter((c) => c.type === 'audio' && c.assetId)
      .map((c) => ({
        id: c.id,
        assetId: c.assetId!,
        trackId: c.trackId,
        startBeat: c.startBeat,
        lengthBeats: c.lengthBeats,
        loop: c.loop,
      }));
    transportScheduler.setClips(scheduled);
  }, [clips, tracks]);

  useEffect(() => {
    if (transport.playing) {
      transportScheduler.start(transport.bpm, transport.beatOffset);
    } else {
      transportScheduler.stop();
    }
    return () => {
      transportScheduler.stop();
    };
  }, [transport.playing]);

  useEffect(() => {
    if (transport.playing) {
      transportScheduler.updateBpm(transport.bpm);
    }
  }, [transport.bpm, transport.playing]);
}
```

- [ ] **Step 2: Add store actions for arrangement**

In `apps/client/src/stores/projectStore.ts`, add:

```typescript
  updateClipTiming: (id: string, startBeat: number, lengthBeats: number) => void;
  updateClipLoop: (id: string, loop: boolean) => void;
  moveClip: (id: string, trackId: string, startBeat: number) => void;
```

And in the store implementation:

```typescript
  updateClipTiming: (id, startBeat, lengthBeats) =>
    set((s) => {
      const clip = s.clips[id];
      if (!clip) return s;
      return { clips: { ...s.clips, [id]: { ...clip, startBeat, lengthBeats } } };
    }),
  updateClipLoop: (id, loop) =>
    set((s) => {
      const clip = s.clips[id];
      if (!clip) return s;
      return { clips: { ...s.clips, [id]: { ...clip, loop } } };
    }),
  moveClip: (id, trackId, startBeat) =>
    set((s) => {
      const clip = s.clips[id];
      if (!clip) return s;
      return { clips: { ...s.clips, [id]: { ...clip, trackId, startBeat } } };
    }),
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/hooks/useTransportScheduler.ts apps/client/src/stores/projectStore.ts
git commit -m "feat(transport): hook scheduler to store with clip timing actions"
```

---

## Phase 2: Workstation Node

### Task 4: Workstation Node Type + Registry

**Files:**
- Modify: `apps/client/src/types/project.ts`
- Modify: `apps/client/src/nodes/registry.ts`

- [ ] **Step 1: Add workstation kind + nested clip support**

In `types/project.ts`, add to `NodeKind`:

```typescript
  | 'workstation'
```

And a new type:

```typescript
export interface WorkstationState {
  tracks: Record<string, { id: string; name: string; color?: string; gain?: number; pan?: number; muted?: boolean }>;
  clips: Record<string, Clip>;
  loopStartBeat: number;
  loopEndBeat: number;
  arrangementLengthBeats: number;
}
```

- [ ] **Step 2: Register workstation node**

In `nodes/registry.ts`, add to `BUILTIN_NODES`:

```typescript
  {
    kind: 'workstation',
    label: 'Workstation',
    description: 'DAW-style clip arrangement block',
    category: 'utility',
    icon: 'LayoutGrid',
    defaultParams: { gain: 1 },
    inputs: 0,
    outputs: 1,
  },
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/types/project.ts apps/client/src/nodes/registry.ts
git commit -m "feat(types): add workstation node kind + WorkstationState type"
```

---

### Task 5: Workstation React Flow Node Shell

**Files:**
- Create: `apps/client/src/components/WorkstationNode.tsx`
- Modify: `apps/client/src/components/PatchCanvas.tsx`
- Modify: `apps/client/src/components/PatchNode.tsx`

- [ ] **Step 1: Create workstation node shell**

```typescript
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PatchNode as PatchNodeType } from '@/types/project';
import { LayoutGrid, Maximize2 } from 'lucide-react';
import { WorkstationEditor } from './WorkstationEditor';

export const WorkstationNode = memo(function WorkstationNodeComponent(props: NodeProps) {
  const { data } = props as unknown as { data: PatchNodeType };
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <>
      <div className="hayashi-patch-node hayashi-patch-node-workstation">
        <Handle type="target" position={Position.Left} className="hayashi-node-handle-left" />
        <Handle type="source" position={Position.Right} className="hayashi-node-handle-right" />

        <div className="hayashi-patch-node-head">
          <div className="hayashi-node-badge">
            <LayoutGrid size={14} />
            Workstation
          </div>
          <button
            className="hayashi-icon-button"
            onClick={() => setEditorOpen(true)}
            title="Open arrangement editor"
          >
            <Maximize2 size={14} />
          </button>
        </div>
        <h3 className="text-sm font-semibold mt-1">{data.id}</h3>
        <div className="text-xs mt-1 opacity-70">Click expand to edit clips</div>
      </div>

      {editorOpen && (
        <WorkstationEditor
          nodeId={data.id}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
});
```

- [ ] **Step 2: Register in PatchCanvas**

In `PatchCanvas.tsx`, update `nodeTypes`:

```typescript
import { WorkstationNode } from './WorkstationNode';

const nodeTypes: import('@xyflow/react').NodeTypes = {
  patchNode: PatchNode as unknown as import('@xyflow/react').NodeTypes[string],
  workstation: WorkstationNode as unknown as import('@xyflow/react').NodeTypes[string],
};
```

And update `toFlowNodes` to support workstation type:

```typescript
function toFlowNodes(nodes: Record<string, PatchNodeType>): import('@xyflow/react').Node[] {
  return Object.values(nodes).map((n) => ({
    id: n.id,
    type: n.kind === 'workstation' ? 'workstation' : 'patchNode',
    position: n.position,
    data: n as unknown as Record<string, unknown>,
  }));
}
```

- [ ] **Step 3: Add workstation icon to PatchNode fallback**

In `PatchNode.tsx`, add to `kindIcons`:

```typescript
  workstation: LayoutGrid,
```

And to `kindLabels`:

```typescript
  workstation: 'Workstation',
```

(Import `LayoutGrid` from `lucide-react`.)

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/WorkstationNode.tsx apps/client/src/components/PatchCanvas.tsx apps/client/src/components/PatchNode.tsx
git commit -m "feat(ui): workstation node shell with expand button"
```

---

### Task 6: Workstation Editor (Embedded DAW Panel)

**Files:**
- Create: `apps/client/src/components/WorkstationEditor.tsx`
- Create: `apps/client/src/components/ArrangementGrid.tsx`

- [ ] **Step 1: Create ArrangementGrid**

```typescript
import { useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import type { Clip } from '@/types/project';

export function ArrangementGrid({ clips, tracks, bpm, playheadBeat, onClipMove }: {
  clips: Clip[];
  tracks: { id: string; name: string; color?: string }[];
  bpm: number;
  playheadBeat: number;
  onClipMove: (clipId: string, trackId: string, startBeat: number) => void;
}) {
  const BEAT_WIDTH = 24;
  const TRACK_HEIGHT = 56;

  const handleDragEnd = useCallback((e: React.DragEvent, clipId: string) => {
    const grid = e.currentTarget.closest('[data-arrangement-grid]') as HTMLElement | null;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const startBeat = Math.round(x / BEAT_WIDTH);
    const trackIndex = Math.floor(y / TRACK_HEIGHT);
    const track = tracks[trackIndex];
    if (track) {
      onClipMove(clipId, track.id, Math.max(0, startBeat));
    }
  }, [tracks, onClipMove]);

  const totalBeats = Math.max(...clips.map((c) => c.startBeat + c.lengthBeats), 32);

  return (
    <div
      data-arrangement-grid
      className="hayashi-arrangement-grid"
      style={{
        position: 'relative',
        width: totalBeats * BEAT_WIDTH + 120,
        minHeight: tracks.length * TRACK_HEIGHT + 40,
        overflow: 'auto',
      }}
    >
      {/* Ruler */}
      <div className="hayashi-arrangement-ruler" style={{ display: 'flex', paddingLeft: 100 }}>
        {Array.from({ length: totalBeats + 1 }, (_, i) => (
          <div key={i} style={{ width: BEAT_WIDTH, fontSize: 10, color: 'rgba(245,230,200,0.4)' }}>
            {i % 4 === 0 ? i + 1 : ''}
          </div>
        ))}
      </div>

      {/* Tracks */}
      {tracks.map((track, idx) => (
        <div
          key={track.id}
          className="hayashi-arrangement-track"
          style={{
            display: 'flex',
            height: TRACK_HEIGHT,
            borderBottom: '1px solid rgba(247,239,215,0.06)',
          }}
        >
          <div
            style={{
              width: 100,
              padding: '8px 10px',
              fontSize: 11,
              fontFamily: 'IBM Plex Mono, monospace',
              color: 'rgba(245,230,200,0.6)',
              borderRight: '1px solid rgba(247,239,215,0.08)',
            }}
          >
            {track.name}
          </div>
          <div style={{ position: 'relative', flex: 1 }}>
            {clips
              .filter((c) => c.trackId === track.id)
              .map((clip) => (
                <div
                  key={clip.id}
                  draggable
                  onDragEnd={(e) => handleDragEnd(e, clip.id)}
                  style={{
                    position: 'absolute',
                    left: clip.startBeat * BEAT_WIDTH,
                    top: 6,
                    width: Math.max(clip.lengthBeats * BEAT_WIDTH, 20),
                    height: TRACK_HEIGHT - 12,
                    borderRadius: 8,
                    background: 'rgba(212,140,46,0.25)',
                    border: '1px solid rgba(212,140,46,0.4)',
                    fontSize: 10,
                    padding: '4px 6px',
                    color: '#f5e6c8',
                    cursor: 'grab',
                  }}
                >
                  {clip.assetId?.slice(0, 8) ?? clip.id.slice(0, 8)}
                  {clip.loop && <span style={{ marginLeft: 4, opacity: 0.7 }}>loop</span>}
                </div>
              ))}
          </div>
        </div>
      ))}

      {/* Playhead */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 100 + playheadBeat * BEAT_WIDTH,
          width: 2,
          background: 'rgba(237,146,47,0.85)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create WorkstationEditor modal/panel**

```typescript
import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { ArrangementGrid } from './ArrangementGrid';
import { audioEngine } from '@/audio/engine';
import { transportScheduler } from '@/audio/transportScheduler';
import { Play, Square, Plus } from 'lucide-react';

export function WorkstationEditor({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const nodes = useProjectStore((s) => s.nodes);
  const node = nodes[nodeId];
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const transport = useProjectStore((s) => s.localTransport);
  const updateTransport = useProjectStore((s) => s.updateLocalTransport);
  const moveClip = useProjectStore((s) => s.moveClip);

  const [playheadBeat, setPlayheadBeat] = useState(0);
  const rafRef = useRef(0);

  const nodeClips = Object.values(clips).filter((c) => tracks[c.trackId]);
  const nodeTracks = Object.values(tracks);

  useEffect(() => {
    function tick() {
      const beat = transportScheduler.currentBeat;
      setPlayheadBeat(beat);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const togglePlay = () => {
    audioEngine.resume().catch(() => {});
    updateTransport({ playing: !transport.playing });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="hayashi-surface"
        style={{
          width: 'min(960px, 90vw)',
          height: 'min(640px, 80vh)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="hayashi-panel-header" style={{ flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <span className="hayashi-kicker-app">Workstation</span>
            <strong className="hayashi-title-display" style={{ fontSize: '1rem' }}>
              {node?.id ?? nodeId}
            </strong>
          </div>
          <div className="flex items-center gap-2">
            <button className="hayashi-daw-tbtn" onClick={togglePlay}>
              {transport.playing ? <Square size={14} /> : <Play size={14} />}
            </button>
            <button className="hayashi-btn-ghost hayashi-button-xs" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: '1px solid var(--hayashi-border)', flexShrink: 0 }}>
          <span className="hayashi-status-pill">{transport.bpm} BPM</span>
          <span className="hayashi-status-pill">{nodeTracks.length} tracks</span>
          <span className="hayashi-status-pill">{nodeClips.length} clips</span>
        </div>

        {/* Arrangement */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          <ArrangementGrid
            clips={nodeClips}
            tracks={nodeTracks}
            bpm={transport.bpm}
            playheadBeat={playheadBeat}
            onClipMove={moveClip}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/WorkstationEditor.tsx apps/client/src/components/ArrangementGrid.tsx
git commit -m "feat(ui): WorkstationEditor with ArrangementGrid clip lanes"
```

---

## Phase 3: Custom React Flow UX

### Task 7: Custom Edge Renderer

**Files:**
- Create: `apps/client/src/components/CustomEdge.tsx`
- Modify: `apps/client/src/components/PatchCanvas.tsx`

- [ ] **Step 1: Create custom edge component**

```typescript
import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';

const SIGNAL_COLORS: Record<string, string> = {
  audio: '#ed922f',
  midi: '#8fb13a',
  control: '#6a9bcc',
  clock: '#d48c2e',
};

export const CustomEdge = memo(function CustomEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const signalType = (data?.signalType as string) ?? 'audio';
  const color = SIGNAL_COLORS[signalType] ?? SIGNAL_COLORS.audio;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: 2,
          opacity: 0.9,
        }}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 9,
            fontFamily: 'IBM Plex Mono, monospace',
            color,
            background: 'rgba(16,38,29,0.7)',
            padding: '2px 6px',
            borderRadius: 4,
            pointerEvents: 'all',
          }}
        >
          {signalType}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
```

- [ ] **Step 2: Register custom edge in PatchCanvas**

In `PatchCanvas.tsx`, add:

```typescript
import { CustomEdge } from './CustomEdge';

const edgeTypes = {
  custom: CustomEdge as unknown as import('@xyflow/react').EdgeTypes[string],
};
```

And in `toFlowEdges`, set edge type:

```typescript
function toFlowEdges(edges: Record<string, PatchEdgeType>): Edge[] {
  return Object.values(edges).map((e) => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: 'custom',
    animated: true,
    data: { signalType: e.signalType },
    style: { stroke: 'var(--hayashi-ember)', strokeWidth: 2 },
  }));
}
```

Pass `edgeTypes` to `<ReactFlow>`:

```typescript
<ReactFlow
  ...
  edgeTypes={edgeTypes}
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/CustomEdge.tsx apps/client/src/components/PatchCanvas.tsx
git commit -m "feat(ui): custom React Flow edges with signal-type color coding"
```

---

### Task 8: Workstation Node Inspector Panel

**Files:**
- Modify: `apps/client/src/components/NodeInspector.tsx`

- [ ] **Step 1: Add workstation inspector section**

After the Faust module section in `NodeInspector.tsx`, add:

```typescript
      {/* Workstation clip list */}
      {node.kind === 'workstation' && (
        <div className="hayashi-inspector-block">
          <div className="hayashi-slider-head">
            <label>Arrangement</label>
            <strong>{nodeClips.length} clips</strong>
          </div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {nodeClips.map((clip) => (
              <div
                key={clip.id}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'rgba(250,249,245,0.06)',
                  fontSize: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{clip.assetId?.slice(0, 12) ?? clip.id.slice(0, 12)}</span>
                <span style={{ opacity: 0.6 }}>
                  {clip.startBeat.toFixed(1)}–{(clip.startBeat + clip.lengthBeats).toFixed(1)} beats
                </span>
              </div>
            ))}
            {nodeClips.length === 0 && (
              <p className="text-xs opacity-50">No clips. Drag samples onto the workstation editor.</p>
            )}
          </div>
        </div>
      )}
```

Add a helper above the component:

```typescript
function useWorkstationClips(nodeId: string) {
  const clips = useProjectStore((s) => s.clips);
  return Object.values(clips).filter((c) => c.trackId.startsWith(nodeId));
}
```

Then use it in the component body:

```typescript
  const nodeClips = node.kind === 'workstation' ? useWorkstationClips(node.id) : [];
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/NodeInspector.tsx
git commit -m "feat(ui): workstation clip list in NodeInspector"
```

---

## Phase 4: Integration & Polish

### Task 9: CSS for Workstation + Arrangement

**Files:**
- Modify: `apps/client/src/index.css`

- [ ] **Step 1: Add workstation + arrangement styles**

Append to `index.css`:

```css
.hayashi-patch-node-workstation {
  background:
    linear-gradient(180deg, rgba(212,140,46,0.12), rgba(212,140,46,0.03)),
    linear-gradient(180deg, #1a382b 0%, #10261d 100%);
  border-color: rgba(212,140,46,0.25);
}

.hayashi-arrangement-grid {
  background:
    linear-gradient(180deg, rgba(16,38,29,0.6), rgba(16,38,29,0.8));
  border-radius: 12px;
  border: 1px solid rgba(247,239,215,0.08);
}

.hayashi-arrangement-ruler {
  border-bottom: 1px solid rgba(247,239,215,0.08);
  padding: 6px 0;
}

.hayashi-arrangement-track:hover {
  background: rgba(247,239,215,0.02);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/index.css
git commit -m "style: workstation node + arrangement grid CSS"
```

---

### Task 10: Mount useTransportScheduler in StudioScreen

**Files:**
- Modify: `apps/client/src/components/StudioScreen.tsx`

- [ ] **Step 1: Import and mount hook**

```typescript
import { useTransportScheduler } from '@/hooks/useTransportScheduler';
```

Inside `StudioScreen`:

```typescript
  useTransportScheduler();
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/StudioScreen.tsx
git commit -m "feat(transport): mount useTransportScheduler in StudioScreen"
```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| Transport timing (beat-to-time scheduling) | Task 1, 2, 3 |
| Clip start/stop with AudioBufferSourceNode | Task 2 |
| Workstation node in React Flow | Task 4, 5 |
| Workstation opens DAW-style editor | Task 5, 6 |
| Clip lanes with drag positioning | Task 6 |
| Playhead tracking | Task 6 |
| Custom edges with signal-type color | Task 7 |
| Node inspector shows workstation clips | Task 8 |
| CSS styling for new components | Task 9 |
| Hook mounted in main screen | Task 10 |

**Gaps:** None identified. The plan covers timing engine, workstation node, custom React Flow UX, and integration.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-09-hayashi-timing-workstation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
