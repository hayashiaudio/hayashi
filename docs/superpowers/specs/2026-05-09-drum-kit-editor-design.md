# Design: Drum Kit Editor (drumPad)

> Date: 2026-05-09
> Scope: Transform the existing `drumPad` node into an MPC-style 16-pad drum kit with live triggering, asset assignment, and render-to-sample recording.

---

## 1. Goal

The `drumPad` node currently acts as a single-sample trigger with a generic patch node UI. This design turns it into a full drum machine:
- 16 assignable pads in a popup editor (MPC-style 4x4 grid).
- Asset sidebar with drag-and-drop assignment.
- Live pad triggering into a submix bus.
- Record mode that captures pad hits, then renders to an offline `AudioBuffer`, encodes to WAV, stores in IndexedDB as a new `Asset`, and wires the rendered beat as the node's downstream output.

---

## 2. Data Model

All state lives in Zustand (`projectStore`). The `drumPad` node params remain a flat `Record<string, number | string | boolean>`:

| Param | Type | Default | Purpose |
|---|---|---|---|
| `gain` | `number` | 0.8 | Master kit volume |
| `pad0` … `pad15` | `string` | `""` | Asset ID assigned to each slot |
| `pad0_name` … `pad15_name` | `string` | `""` | Custom pad label (fallback to asset name) |
| `outputAssetId` | `string` | `""` | Rendered beat asset ID (empty = no render) |
| `outputLoop` | `boolean` | `false` | Whether the rendered beat loops |
| `mode` | `string` | `"live"` | `"live"` or `"rendered"`. Live = pad trigger submix. Rendered = sampler-style playback of `outputAssetId`. |

No new types are added to `project.ts`. The existing `PatchNode`, `Asset`, and `Clip` types are sufficient.

---

## 3. Architecture

### 3.1 Components

| File | Role |
|---|---|
| `apps/client/src/components/DrumKitEditor.tsx` | Modal popup editor. 4x4 grid, asset sidebar, record/transport controls. Reads from / writes to `projectStore`. |
| `apps/client/src/components/DrumKitNode.tsx` | React Flow custom node shell for `drumPad` (replaces generic patch node rendering, or extends it). Shows pad count, output asset hint, open button. |
| `apps/client/src/audio/drumEngine.ts` | Live pad trigger engine: submix GainNode map, buffer decode, `AudioBufferSourceNode` creation. Offline render pipeline. |

### 3.2 Audio Flow

```
┌─────────────────────────────────────────┐
│            DrumKitEditor UI              │
│   (pad click → drumEngine.triggerPad)   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│           drumEngine.ts                  │
│  padSubmixes: Map<nodeId, GainNode>      │
│  • triggerPad: decode asset, create      │
│    AudioBufferSourceNode → submix        │
│  • renderOffline: schedule hits into     │
│    OfflineAudioContext → WAV → Asset     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│        graphCompiler.ts (drumPad)        │
│  IF mode === "rendered" && outputAssetId │
│    → compile like sampler (loopable)     │
│  ELSE                                    │
│    → compile submix GainNode only        │
│      (live triggers feed it dynamically)│
└─────────────────────────────────────────┘
```

### 3.3 Store Actions

In `projectStore.ts`:
- `updateDrumPadKit(nodeId, assignments)` — batch-update multiple `padX` params at once to avoid 16 separate re-renders.
- `addDrumKitAsset(asset)` — thin wrapper over `addAsset` with auto-generated name.

---

## 4. UI Design

### 4.1 Visual Direction

Dark, tactile, industrial — MPC hardware translated to software.
- **Colors:** Charcoal pads (`#1f1f1f`) with amber/yellow active glow (`#ed922f`). Dim unassigned pads. Record button: pulsing red (`#d95757`).
- **Typography:** `IBM Plex Mono` for pad labels and beat counters. `Poppins` for headers.
- **Layout:** Modal overlay matching `WorkstationEditor` dimensions and styling. Asymmetric sidebar on the left, pad grid on the right.
- **Motion:** CSS keyframes for pad press (brightness bump + box-shadow). Record button pulse via CSS animation.

### 4.2 Popup Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Drum Kit — drumPad-xyz                       [REC] [▶] [✕]  │
├──────────────┬──────────────────────────────────────────────┤
│ ASSETS       │                                              │
│ Sidebar      │      [0]  [1]  [2]  [3]                    │
│ (samples     │      [4]  [5]  [6]  [7]                    │
│  only,       │      [8]  [9]  [10] [11]                   │
│  draggable)  │      [12] [13] [14] [15]                   │
│              │                                              │
│              │  Selected pad: Kick-909                     │
│              │  [Clear]  [Preview]  [Gain: 1.0]            │
├──────────────┴──────────────────────────────────────────────┤
│ 3 pads loaded  |  Output: "Beat_001.wav" [Play] [Discard]    │
│ [Switch to Live] / [Switch to Rendered]                   │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Interaction States

- **Unassigned pad:** Dark, low opacity. Drop zone highlight on drag-over.
- **Assigned pad:** Shows asset name truncated. Click = trigger + select.
- **Active pad (playing):** Amber glow + slight scale up.
- **Recording:** REC button pulses red. Every pad hit is logged with `audioEngine.ctx.currentTime`. Visual feedback on hit pads even louder.
- **Render complete:** Status bar shows new asset name. Mode auto-switches to `"rendered"`. Rendered beat is playable via the transport or a dedicated preview.
- **Missing asset:** Pad shows red border + "Missing" label. Click is no-op.

---

## 5. Audio Engine Details

### 5.1 Live Triggering

`drumEngine.triggerPad(nodeId: string, padIndex: number)`:
1. Read `node.params['pad${padIndex}']` as asset ID.
2. If empty or missing, return silently.
3. Get `AudioBuffer` from IndexedDB cache (`getCachedSampleBuffer`).
4. Get or create submix `GainNode` for this node ID from `padSubmixes`.
5. Create `AudioBufferSourceNode`, connect to submix.
6. `source.start(audioEngine.ctx.currentTime)`.
7. `source.onended` → disconnect and clean up.

### 5.2 Offline Render

`drumEngine.renderBeat(nodeId: string, hits: DrumHit[]): Promise<AudioBuffer>`:
1. Compute `duration = max(hit.when + bufferDuration) - recordStartTime`.
2. `new OfflineAudioContext(2, ceil(duration * sampleRate), sampleRate)`.
3. For each hit:
   - Decode asset buffer.
   - Create `AudioBufferSourceNode` at `hit.when - recordStartTime`.
   - Connect to offline destination.
   - `source.start(scheduledWhen)`.
4. `ctx.startRendering()` → resolve `AudioBuffer`.

### 5.3 WAV Encoding

`drumEngine.encodeWav(buffer: AudioBuffer): Blob`:
- Convert `AudioBuffer` interleaved channels to 16-bit PCM Int16Array.
- Write WAV header (RIFF, fmt, data chunks).
- Return as `Blob('audio/wav')`.

### 5.4 Asset Creation

After encoding:
1. Store Blob in IndexedDB via existing sample storage.
2. Create `Asset`:
   - `id`: `asset-${crypto.randomUUID().slice(0,8)}`
   - `kind`: `'sample'`
   - `name`: `'Kit Beat ${timestamp}'`
   - `mimeType`: `'audio/wav'`
   - `durationSeconds`: computed from buffer length
   - `sampleRate`, `channels`: from buffer
3. Dispatch `projectStore.addAsset(asset)`.
4. Dispatch `projectStore.updateNodeParams(nodeId, { outputAssetId: asset.id, mode: 'rendered' })`.

### 5.5 Graph Compiler Update

In `graphCompiler.ts`, replace the current `drumPad` case:

```typescript
case 'drumPad': {
  const mode = (node.params.mode as string) ?? 'live';
  const outputAssetId = (node.params.outputAssetId as string) ?? '';

  if (mode === 'rendered' && outputAssetId) {
    // Rendered beat mode: behave like a sampler
    const buffer = await getCachedSampleBuffer(outputAssetId, ctx);
    if (!buffer) break;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = Boolean(node.params.outputLoop);
    const output = createSourceOutput(ctx, node.muted ? 0 : ((node.params.gain as number) ?? 0.8));
    source.connect(output);
    audioNode = output;
    sourceNode = source;
    if (!isSequenced) source.start();
  } else {
    // Live kit mode: submix bus only
    const submix = ctx.createGain();
    submix.gain.value = node.muted ? 0 : ((node.params.gain as number) ?? 0.8);
    audioNode = submix;
    drumEngine.registerSubmix(node.id, submix);
  }
  break;
}
```

---

## 6. YJS & Collaboration

- YJS is currently used only for presence (cursors, focus, user list). Project state is Zustand-only.
- The drum kit editor follows the same pattern: all mutations go through `projectStore`, which is the single source of truth.
- If a future sync layer is added to Zustand, drum kit params will sync automatically because they live in the same `nodes` map as every other node.
- Awareness: when a user opens the drum kit editor, broadcast focus via `useYjsProject.broadcastFocus(nodeId, 'drumKit')` so collaborators see who is editing.

---

## 7. Error Handling

| Scenario | Behavior |
|---|---|
| Pad assigned but asset missing in IndexedDB | Pad shows "Missing" label. Click is no-op. Console warning. |
| Record with zero loaded pads | Disabled record button + tooltip "Assign samples first". |
| Record started but no hits captured | On stop, show toast "No hits recorded" — do not create empty asset. |
| Browser lacks `OfflineAudioContext` | Disable record button. Show tooltip "Rendering not supported in this browser". |
| IndexedDB quota exceeded | Catch in `encodeWav` / store step. Show toast "Storage full — export manually?". |
| Rendered asset deleted externally | On next graph compile, `getCachedSampleBuffer` returns null. Fallback to live mode. |

---

## 8. File Changes

### Create
- `apps/client/src/components/DrumKitEditor.tsx`
- `apps/client/src/components/DrumKitNode.tsx`
- `apps/client/src/audio/drumEngine.ts`

### Modify
- `apps/client/src/stores/projectStore.ts` — add `updateDrumPadKit`, `addDrumKitAsset`.
- `apps/client/src/audio/graphCompiler.ts` — rewrite `drumPad` compile case.
- `apps/client/src/components/PatchCanvas.tsx` — register `drumKit` custom node type.
- `apps/client/src/components/PatchNode.tsx` — optionally route `drumPad` through `DrumKitNode` shell.
- `apps/client/src/components/NodeInspector.tsx` — show drum kit pad list + output asset.
- `apps/client/src/index.css` — add pad grid, active glow, record pulse styles.

---

## 9. Spec Self-Review

- **Placeholder scan:** No TBDs, no TODOs. All param names, file paths, and function signatures are concrete.
- **Internal consistency:** Live mode compiles to submix; rendered mode compiles to sampler. Both respect `node.muted` and `node.params.gain`. The mode param gates the switch. Consistent with existing node behavior.
- **Scope check:** Focused. No step sequencer, no MIDI input, no pattern editor — just pad grid + record + render.
- **Ambiguity check:** "Asset sidebar" means the same draggable sample list already used by AssetLibrary. "Render" means offline AudioBuffer → WAV → IndexedDB Asset. Clear.

---

## 10. Open Questions (none remaining)

All design questions resolved with user:
- Node: existing `drumPad`.
- UI: MPC-style 4x4 grid with asset sidebar.
- Approach: Live Trigger + Render-to-Sample (A).
