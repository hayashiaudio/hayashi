# Collaborative Browser-Based Music Production Lab

## 1. Product Vision

Build a web-first collaborative music production lab where friends can create loops, modular synth patches, samples, effects chains, and audio-reactive visuals together in real time.

The product should work as:

- A normal web app with its own auth, billing, projects, teams, and sharing.
- A Discord Activity integration for social jam sessions.
- Later, an optional native bridge for pro audio plugins, local audio devices, and advanced file access.

Discord should be an entry point, not the entire product.

## 2. Goal

Build a collaborative browser-based music production lab that runs as a Discord Activity and can also become a standalone web app later.

The core loop:

Friends join a Discord Activity, patch synth nodes together, build loops, trigger samples, tweak effects, and create audio-reactive visuals in real time.

Discord should be the social entry point, but the product architecture should not depend on Discord for long-term monetization, identity, storage, or project ownership.

## 3. Product Shape

### MVP Experience

Users can:

- Join a shared jam room from Discord.
- See each other’s cursors, names, avatars, and current instrument focus.
- Add synth/effect/sample/sequencer nodes to a canvas.
- Connect nodes with patch cables.
- Edit parameters live.
- Create loop clips in a step sequencer.
- Drag in samples.
- Hear the shared session locally.
- Save a jam snapshot.
- Export a loop as WAV.

### Core Product Modes

#### Discord Activity Mode

Used for casual friend sessions.

- Fast join.
- Room is keyed by Discord Activity `instanceId`.
- Low-friction temporary projects.
- Uses Discord identity/presence where available.
- Can later prompt users to create a full web account to save/export/share.

Discord Activities are web apps embedded in iframes inside Discord, and the Embedded App SDK handles communication between Discord and the iframed app.

#### Standalone Web App Mode

Used for serious projects.

- Normal web auth.
- User-owned projects.
- Paid plans.
- Larger storage limits.
- Public/private project sharing.
- Team workspaces.
- Optional native bridge later.

## 4. Recommended Stack

### Frontend

- React + Vite
- TypeScript
- React Flow for patch graph UI
- Yjs for CRDT shared project state
- `y-websocket` or custom WebSocket provider
- Tailwind + `shadcn/ui` for UI
- Zustand for local ephemeral UI state
- Three.js / React Three Fiber for visuals
- Tone.js only where it accelerates MVP sequencing and simple utility nodes
- AudioWorklet as the primary realtime audio execution model
- Custom DSP backed by WASM where quality or performance matters
- `faustwasm` as a likely source for selected synth/effect DSP nodes

### Backend

- Node.js/Fastify or Rust/Axum
- WebSocket server for Yjs sync
- Postgres for users/projects/billing metadata
- S3/R2-compatible object storage for samples, exports, and project snapshots
- Redis optional for ephemeral room presence and rate limits

Given your Rust bias, I’d use:

```text
frontend/
  React + Vite + Yjs + React Flow

backend/
  Rust Axum API
  y-websocket-compatible sync service OR separate Node sync service

audio-core/
  AudioWorklet-first runtime
  Faust DSP modules via faustwasm
  Rust/WASM DSP for sampler/runtime-specific pieces

native-bridge/
  later: Tauri/JUCE/CLAP/VST3 bridge
```

## 5. Discord Activity Integration

Use Discord as a launch surface, not the source of truth.

Discord-specific responsibilities:

- Initialize Embedded App SDK.
- Read `instanceId`.
- Authenticate the Discord user when needed.
- Use `instanceId` as the room key.
- Show Discord-aware presence.
- Allow users to invite friends into the Activity.
- Optionally set Rich Presence like “Jamming on Acid Bass Loop.”

Discord’s multiplayer guide specifically recommends using `instanceId` as the key for shared data so users in the same Activity instance load the same shared state.

Basic client flow:

```ts
import { DiscordSDK } from "@discord/embedded-app-sdk";

const discord = new DiscordSDK(DISCORD_CLIENT_ID);

const roomId = discord.instanceId ?? fallbackRoomId();

await discord.ready();

const provider = createYjsProvider({
  roomId: `discord:${roomId}`,
  token: appSessionToken,
});
```

Important abstraction:

```ts
type LaunchContext =
  | {
      mode: "discord";
      discordInstanceId: string;
      discordUserId?: string;
      guildId?: string;
      channelId?: string;
    }
  | {
      mode: "web";
      projectId: string;
      userId: string;
    };
```

Do not hard-code the product around Discord. Treat Discord as one launch context.

## 6. CRDT/Yjs Data Model

Yjs should own collaborative project state. Local UI state should remain outside Yjs unless other people need to see it.

Yjs is a CRDT framework with shared types like maps and arrays that automatically merge concurrent changes without traditional merge conflicts.

### `Y.Doc` Layout

```ts
const ydoc = new Y.Doc();

const project = ydoc.getMap("project");
const nodes = ydoc.getMap("nodes");
const edges = ydoc.getMap("edges");
const clips = ydoc.getMap("clips");
const tracks = ydoc.getMap("tracks");
const scenes = ydoc.getArray("scenes");
const assets = ydoc.getMap("assets");
const automation = ydoc.getMap("automation");
const comments = ydoc.getArray("comments");
```

### Shared Types

#### Project Metadata

```ts
project.set("title", "Friday Night Jam");
project.set("bpm", 128);
project.set("timeSignature", [4, 4]);
project.set("scale", "minor");
project.set("createdBy", userId);
project.set("createdAt", Date.now());
```

#### Nodes

Each patch node is stored as a Y.Map-compatible object.

```ts
type PatchNode = {
  id: string;
  type:
    | "oscillator"
    | "sampler"
    | "filter"
    | "delay"
    | "reverb"
    | "compressor"
    | "sequencer"
    | "mixer"
    | "output"
    | "visualizer";
  position: { x: number; y: number };
  params: Record<string, number | string | boolean>;
  owner?: string;
  muted?: boolean;
  color?: string;
};
```

Store as:

```ts
nodes.set(node.id, node);
```

#### Edges / Patch Cables

```ts
type PatchEdge = {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  signalType: "audio" | "midi" | "control" | "clock";
};
```

#### Clips

```ts
type Clip = {
  id: string;
  trackId: string;
  type: "midi" | "audio" | "automation";
  startBeat: number;
  lengthBeats: number;
  loop: boolean;
  notes?: MidiNote[];
  assetId?: string;
};
```

#### MIDI Notes

```ts
type MidiNote = {
  id: string;
  pitch: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
};
```

#### Assets

Do not store raw audio blobs in Yjs. Store metadata only.

```ts
type Asset = {
  id: string;
  kind: "sample" | "stem" | "preset" | "impulse-response";
  name: string;
  mimeType: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  storageUrl?: string;
  localBlobRef?: string;
  waveformPeaks?: number[];
};
```

Yjs should store references and metadata. Actual audio files go to object storage or browser IndexedDB.

## 7. Presence and Awareness

Use Yjs Awareness for ephemeral collaborative state:

- Cursor position
- Selected node
- Current instrument
- User color
- User name/avatar
- “Currently tweaking cutoff”
- Playback ready status
- Local latency estimate

Yjs Awareness is designed for small, temporary presence states and syncs separately from document state.

Example:

```ts
provider.awareness.setLocalStateField("user", {
  id: userId,
  name,
  avatarUrl,
  color,
});

provider.awareness.setLocalStateField("cursor", {
  x,
  y,
});

provider.awareness.setLocalStateField("focus", {
  nodeId: selectedNodeId,
  param: "filter.cutoff",
});
```

Do not store awareness in the project history.

## 8. Audio Architecture

The audio engine should be deterministic locally but controlled by shared CRDT state.

Rule:

Yjs stores intent/state. AudioWorklet executes sound.

The Web Audio API is intended for synthesis, effects, routing, visualization, and spatial audio in web apps. AudioWorklet is the right primitive for custom low-latency audio processing on a separate audio rendering thread.

### Audio Layers

```text
Yjs project state
      ↓
Audio graph compiler
      ↓
Node runtime backend selection
      ↓
AudioWorklet graph runtime
      ↓
Faust-generated DSP and custom WASM DSP
      ↓
WebAudio output
```

### V1 Audio Engine Decision

For V1, plan around `AudioWorklet` as the primary realtime engine boundary.

Use three runtime backends behind the same app-level node model:

- Native Web Audio for routing, mixing, and simple utility nodes.
- `faustwasm` for selected synth and effect DSP nodes.
- Custom sampler/runtime code for sample playback, transport-coupled behavior, and any node types that do not map cleanly to Faust.

This keeps the collaborative graph and preset model stable while allowing different implementation strategies per node.

### Main Thread

Responsible for:

- React UI
- React Flow graph
- Yjs sync
- Parameter editing
- Asset loading
- Waveform generation
- Scheduling high-level transport commands

### AudioWorklet Thread

Responsible for:

- Sample-accurate DSP
- Oscillators
- Filters
- Envelopes
- Sampler playback
- Effects
- Mixing
- Metering
- Clock/transport processing

### WASM DSP

Do not assume one DSP source for every node type.

V1 recommendation:

- Use `faustwasm` for many synth/effect nodes where high-quality authored DSP is available.
- Keep sampler playback, sample buffer management, voice scheduling, and transport-linked runtime logic custom.
- Use Rust/WASM for product-specific DSP pieces where Faust is not a clean fit.

Possible Rust/WASM modules:

```text
audio-core/
  src/
    sampler.rs
    voice_allocator.rs
    envelope.rs
    smoothing.rs
    transport_clock.rs
    metering.rs
```

Compile custom modules to WASM and load inside AudioWorklet where feasible.

Possible Faust-backed node families:

- oscillator/poly synth voices
- filters
- delay/reverb
- distortion/saturation
- chorus/phaser/flanger
- compressor/limiter

## 9. Graph Compilation

The patch canvas should not directly be the audio graph. Instead, compile the collaborative graph into an internal runtime graph.

```ts
type RuntimeGraph = {
  nodes: RuntimeNode[];
  connections: RuntimeConnection[];
  sampleRate: number;
  blockSize: number;
};
```

Compile when:

- Node added/deleted
- Cable connected/disconnected
- Node type changes
- Asset assignment changes

Update parameters without recompiling:

- `cutoff`
- `resonance`
- `gain`
- `pan`
- `envelope attack/release`
- `wet/dry`
- `delay time`
- `feedback`

Use debounced CRDT observation:

```ts
nodes.observeDeep(() => {
  scheduleGraphRecompile();
});

edges.observeDeep(() => {
  scheduleGraphRecompile();
});
```

## 10. Timing, Transport, and Sync

Do not try to sync raw audio streams between users in MVP. Each client renders audio locally from the same project state.

Shared transport state:

```ts
project.set("transport", {
  playing: true,
  startedAtServerTime: 1770000000000,
  bpm: 128,
  beatOffset: 0,
});
```

Each client computes:

```ts
currentBeat = beatOffset + ((now - startedAtServerTime) / 1000) * (bpm / 60);
```

For MVP, slight drift is acceptable because Discord voice chat already introduces latency. For later pro mode, add:

- server clock synchronization
- latency calibration ping
- Ableton Link-style phase sync
- per-user input monitoring offset
- “local jam” vs “locked arrangement” modes

## 11. Sample Import Pipeline

Use two paths:

### Browser MVP

- Drag/drop file.
- Decode using native `AudioContext.decodeAudioData` first.
- Generate waveform peaks.
- Store file in IndexedDB.
- Store asset metadata in Yjs.
- Upload to object storage if user saves project.

### Browser Audio Analysis (Essentia.js)

Run analysis on decoded PCM immediately after import to auto-populate project metadata.

**Recommended stack: `essentia.js`**

`essentia.js` is a WebAssembly port of MTG's Essentia audio analysis library. It runs entirely in the browser, requires no backend, and gives us BPM, key, onset positions, and chromagrams from a single `AudioBuffer`.

```ts
import { Essentia } from 'essentia.js';

const essentia = new Essentia(EssentiaWASM);

// PCM as Float32Array (mono, downmixed)
const mono = downmixToMono(audioBuffer);

const bpm = essentia.RhythmExtractor(mono);
const key = essentia.KeyExtractor(mono);
const onsets = essentia.OnsetDetector(mono);
const chroma = essentia.Chromagram(mono);
```

**Heuristics**

- **BPM / Tempo**: Use `RhythmExtractor` → novelty function + comb filterbank. Fallback to autocorrelation peak-picking if confidence is low. Clamp to 60–200 BPM. If analysis fails, default to project BPM.
- **Time Signature**: After tempo is known, segment the onset envelope into beat-length windows. Compare accent vectors against 4/4, 3/4, and 6/8 templates. Default to 4/4 unless the pattern strongly contradicts.
- **Key**: Use `KeyExtractor` → chromagram correlated against 24 Krumhansl-Schmuckler major/minor profiles. Returns a key name (e.g., "D minor"). If confidence is below a threshold, show "—" rather than guessing.

**Where it fits**

```text
Drag/drop file
  ↓
AudioContext.decodeAudioData
  ↓
Essentia.js analysis (async, off-main-thread via AudioWorklet or Web Worker)
  ↓
Auto-populate: BPM, timeSignature, key, detected onset grid
  ↓
Store in Yjs asset metadata + IndexedDB
```

This is a UX win: imported loops automatically snap to the project grid.

**Later**

Replace Essentia.js with a custom tiny ONNX classifier trained on onset + chroma features if bundle size becomes a concern. `ort-web` can run this in ~50KB WASM.

### Serious Rust/WASM Path

Add Symphonia-based WASM decoding later for consistent decoding across browser, desktop, and server.

```text
File/Blob
  ↓
Symphonia WASM decoder
  ↓
Float32 PCM
  ↓
resample/channel convert
  ↓
AudioBuffer/sample pool
  ↓
sampler node
```

This becomes especially valuable for FLAC, MP3, M4A, AIFF, WAV, and stem workflows.

Important separation:

- Symphonia is for decoding imported audio assets into PCM.
- Symphonia is not the synth/effects node library.
- Symphonia mainly intersects the graph through sampler and sample-based nodes.

In other words:

```text
asset import -> decode -> PCM/buffer pool -> sampler node -> audio graph
```

This is complementary to the AudioWorklet/Faust/custom-DSP stack rather than competing with it.

## 12. MIDI Support

Add Web MIDI for users with controllers.

Use:

- `navigator.requestMIDIAccess()`
- `WEBMIDI.js` wrapper if you want faster ergonomics
- Map CC messages to selected parameters
- Store mappings in Yjs

Web MIDI is exposed through `navigator.requestMIDIAccess()` and is gated by secure-context/permission constraints in modern browsers.

MIDI mapping model:

```ts
type MidiMapping = {
  id: string;
  deviceName?: string;
  channel?: number;
  cc?: number;
  targetNodeId: string;
  targetParam: string;
  min: number;
  max: number;
};
```

MVP MIDI features:

- Note input
- Record MIDI clips
- Map knobs to params
- Panic button
- Quantize recording

## 13. Visuals System

Visuals should make the product feel magical.

MVP visuals:

- Oscilloscope node
- Spectrum analyzer node
- Audio-reactive background
- Glowing patch cables
- Avatars pulsing when users play notes
- Beat-synced room lighting

Architecture:

```text
AudioWorklet metering
  ↓
SharedArrayBuffer or postMessage meter frames
  ↓
Visualization engine
  ↓
Canvas/WebGL/Three.js
```

Use local meter data, not Yjs, for high-frequency visual data. Do not put FFT frames in CRDT state.

## 14. Persistence Strategy

### Ephemeral Discord Rooms

For rooms launched from Discord:

```text
roomId = discord:${instanceId}
```

Persist:

- Yjs update log
- periodic compacted snapshots
- room metadata
- optional owner if authenticated

Expiration:

- Unsaved rooms expire after 24–72 hours.
- Saved rooms become normal web projects.

### Saved Web Projects

For logged-in users:

```text
projectId = uuid
roomId = project:${projectId}
```

Persist:

- latest Yjs snapshot
- update log
- assets
- exports
- collaborators
- permissions

Storage model:

```sql
projects (
  id uuid primary key,
  owner_id uuid,
  title text,
  bpm int,
  created_at timestamp,
  updated_at timestamp,
  visibility text
);

project_snapshots (
  id uuid primary key,
  project_id uuid,
  yjs_snapshot bytea,
  created_at timestamp
);

project_updates (
  id bigserial primary key,
  project_id uuid,
  update bytea,
  created_at timestamp
);

assets (
  id uuid primary key,
  project_id uuid,
  object_key text,
  mime_type text,
  duration_seconds float,
  sample_rate int,
  channels int,
  created_at timestamp
);
```

## 15. Multiplayer Sync Server

### Option A: Fastest

Use `y-websocket` initially.

Pros:

- Very fast to prototype.
- Standard Yjs provider.
- Good enough for MVP.

Cons:

- Less control over auth, persistence, billing, quotas.

### Option B: Production Custom Provider

Build a custom WebSocket server that speaks Yjs update protocol.

Responsibilities:

- Authenticate user/session.
- Validate room access.
- Apply rate limits.
- Persist updates.
- Broadcast Yjs updates.
- Broadcast awareness updates.
- Compact update logs into snapshots.
- Enforce room size limits.

Recommended path:

- Start with `y-websocket`.
- Add persistence.
- Replace with custom provider once product behavior is clear.

## 16. Conflict Model

Yjs handles structural conflict resolution, but product-level rules still matter.

Examples:

Two users move the same node

- Accept last-writer-wins for position.

Two users edit the same knob

- Use soft ownership.
- Show “Alex is tweaking cutoff.”
- Allow takeover.
- Smooth param changes locally.

Two users edit same MIDI clip

- Use note-level objects with unique IDs.

Better:

```ts
clips.get(clipId).notes.set(noteId, note);
```

Avoid storing the entire piano roll as one giant array.

Two users delete/connect same edge

- Edge IDs are unique. If source/target node disappears, prune invalid edges.

Audio graph invalid state

- Compiler should validate graph before applying.
- No audio cycles unless explicitly supported.
- Required ports exist.
- Output node exists.
- Missing assets become silent placeholder nodes.

## 17. Node Connection Permissions

Node connections have a high blast radius: one accidental disconnect can silence the bus for everyone. The permission model should protect the signal graph while preserving the collaborative "jam circle" feel.

### Recommended Role-Based Model

**Host / Session Director**
- Can always rewire any node (emergency repair).
- Can toggle room between "collaborative" and "director" modes.
- Host-locked by default: output and master bus nodes.

**Participants**
- Can claim unowned instrument nodes by focusing them.
- Own their claimed nodes' inbound and outbound cables.
- Get a "patch latch" workflow: grabbing a cable shows a ghost wire to everyone, but the connection only commits on release if the target port is free.
- Collision resolution: host wins, or fall back to first-come.

**Protected Nodes**
- Output / master bus nodes are host-locked by default.
- These are the "don't break the room" guardrails.

**Session Director Mode (Optional)**
- Only the host can route cables.
- Everyone else can only play parameters and notes.
- Safer for structured sessions, trades some collaborative magic for predictability.

This keeps the social feel alive while preventing chaos.

## 18. Security Model

Important rules:

- Do not trust Discord identity alone for paid project ownership.
- Never expose object storage write credentials directly.
- Use signed upload URLs.
- Validate uploaded file size/type.
- Never store raw access tokens in logs.
- Avoid logging Discord SDK payloads.
- Rate-limit Yjs updates.
- Add max room size and max graph size.
- Sanitize project names/comments.
- Use CSP suitable for Discord iframe embedding.

This is especially important because SDK/logging mishaps can expose sensitive tokens or messages in app logs, as shown by recent Discord SDK-related reporting.

## 19. Suggested MVP Scope

### MVP 0: Local Prototype

Goal: prove patching and sound.

Build:

- React Flow canvas
- WebAudio output
- Oscillator node
- Gain node
- Filter node
- Delay node
- Output node
- Cable connections
- Local transport
- Basic step sequencer

No multiplayer yet.

### MVP 1: Collaborative Patch Graph

Goal: friends can edit together.

Add:

- Yjs document
- WebSocket provider
- Shared nodes/edges
- Shared BPM
- Shared sequencer clips
- Awareness cursors
- Presence avatars
- Room URLs

### MVP 2: Discord Activity

Goal: launch from Discord.

Add:

- Embedded App SDK
- `instanceId` room mapping
- Discord user presence
- Discord-friendly layout
- Activity invite flow
- Rich Presence
- Ephemeral room persistence

### MVP 3: Samples and Export

Goal: create usable loops.

Add:

- Drag/drop samples
- Browser decoding
- Sampler node
- Waveform preview
- MIDI note clips
- Offline WAV bounce
- Save/export loop

### MVP 4: “This Hits” Polish

Goal: make it fun.

Add:

- Beat-synced visuals
- Preset packs
- One-click random patch
- Jam templates
- “Drop” button
- Loop capture
- Reaction buttons
- Avatars pulse when playing
- Shareable jam replay

## 20. File/Folder Structure

```text
apps/
  web/
    src/
      app/
      components/
      discord/
        DiscordProvider.ts
        launchContext.ts
      collab/
        ydoc.ts
        provider.ts
        awareness.ts
      graph/
        PatchCanvas.tsx
        nodes/
        edges/
        graphCompiler.ts
      audio/
        AudioEngine.ts
        workletLoader.ts
        transport.ts
        meters.ts
      midi/
        midiAccess.ts
        mappings.ts
      assets/
        importAudio.ts
        waveform.ts
        indexedDbAssets.ts
      visuals/
        VisualizerCanvas.tsx
      export/
        offlineBounce.ts

packages/
  shared/
    types/
      project.ts
      node.ts
      clip.ts
      asset.ts

  audio-core/
    src/
      lib.rs
      oscillator.rs
      filter.rs
      envelope.rs
      sampler.rs
      delay.rs

  yjs-protocol/
    src/
      room.ts
      auth.ts

services/
  api/
    src/
      main.rs
      routes/
        projects.rs
        assets.rs
        auth.rs
        discord.rs

  sync/
    src/
      main.rs
      rooms.rs
      persistence.rs
      websocket.rs
```

## 21. Core TypeScript Interfaces

```ts
export type ProjectDoc = {
  id: string;
  title: string;
  bpm: number;
  timeSignature: [number, number];
};

export type NodeKind =
  | "oscillator"
  | "sampler"
  | "filter"
  | "gain"
  | "delay"
  | "reverb"
  | "sequencer"
  | "mixer"
  | "output"
  | "visualizer";

export type PatchNode = {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  params: Record<string, unknown>;
};

export type PatchEdge = {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  signalType: "audio" | "midi" | "control" | "clock";
};

export type TransportState = {
  playing: boolean;
  bpm: number;
  beatOffset: number;
  startedAtServerTime?: number;
};

export type UserPresence = {
  id: string;
  name: string;
  avatarUrl?: string;
  color: string;
  cursor?: { x: number; y: number };
  focus?: { nodeId?: string; param?: string };
};
```

## 22. Audio Node MVP Set

Start with a small but expressive node library.

### Generators

- Oscillator
- Noise
- Sampler
- Drum pad
- MIDI input

### Modulators

- LFO
- Envelope
- Step sequencer
- Random source

### Effects

- Gain
- Filter
- Delay
- Reverb
- Distortion
- Compressor
- Bitcrusher

### Utility

- Mixer
- Splitter
- Scope
- Spectrum
- Output

## 23. Offline Bounce

For export, use `OfflineAudioContext`.

Flow:

```text
Yjs project snapshot
  ↓
Compile offline graph
  ↓
Render N bars
  ↓
Encode WAV
  ↓
Download/export/upload
```

MVP export:

- WAV only
- 16/24/32-bit float option later
- Export master loop
- Later: export stems per track

## 24. AI Assistance and Search

V1 priority should be semantic search, not LLM-first generation.

Reasoning:

- Semantic search solves a real retrieval problem for presets, samples, and saved jams.
- It does not sit on the live audio path.
- It is easier to evaluate and constrain than prompt-to-patch generation.
- It improves the product without requiring the patch graph to be LLM-authored.

### V1 Search Scope

Index:

- samples
- presets
- saved projects
- jam snapshots

Search over:

- title
- tags
- user notes
- BPM
- key
- duration
- node kinds used
- collaborator/session metadata

Recommended retrieval stack:

- keyword and structured filters first
- semantic embeddings second
- merge and rerank results in the UI

### LLM Scope After V1

LLM assistance is still useful, but should sit above the normal project model.

Good post-V1 uses:

- prompt-to-preset suggestions
- patch explanation and simplification
- session summaries
- automatic tagging/description of presets and projects

Constraint:

- LLM output must compile down into validated normal project state
- LLMs should not sit on the critical path for realtime playback, sync, or transport

## 25. Monetization Hooks

Even if Discord is the acquisition channel, monetization should live in the standalone web account.

Free:

- Join Discord jams
- Create ephemeral rooms
- Limited save slots
- Limited export length
- Basic synth/effects

Paid:

- Unlimited saved projects
- Longer exports
- Stem export
- Larger sample storage
- Private rooms
- Premium instruments/effects
- AI sample generation
- Native plugin bridge later

Team plan:

- Shared project library
- Brand/sample packs
- Persistent rooms
- Admin controls
- Higher storage/export quotas

## 26. Native Bridge Later

Do not put this in MVP, but design for it.

Native bridge enables:

- VST3 hosting
- AU hosting on macOS
- CLAP hosting
- Lower-latency audio I/O
- Local sample library access
- Pro MIDI routing
- Audio interface selection

Architecture:

```text
Browser app
  ↓ localhost WebSocket / WebRTC
Native bridge
  ↓
Plugin host / audio device / filesystem
```

This turns the product from “Discord synth toy” into “collaborative browser DAW with pro expansion.”

## 27. Major Risks

Browser audio latency

Mitigation:

- Use AudioWorklet.
- Avoid main-thread DSP.
- Keep UI and audio state separate.
- Use local rendering instead of streaming audio between users.

CRDT document bloat

Mitigation:

- Store audio files outside Yjs.
- Snapshot/compact updates.
- Use granular objects for notes/nodes.
- Avoid high-frequency automation writes into Yjs.

Discord iframe constraints

Mitigation:

- Keep Activity mode lightweight.
- Test desktop/web/mobile early.
- Provide standalone web fallback.
- Do not depend on unsupported device APIs inside Discord.

Multiplayer chaos

Mitigation:

- Soft-lock focused controls.
- Show presence clearly.
- Add undo/redo per user.
- Add room host controls.

## 28. Build Order

1. Local React Flow patch canvas.
2. Basic WebAudio graph.
3. AudioWorklet runtime.
4. Shared app-level node model with pluggable runtime backends.
5. Faust-backed synth/effect nodes.
6. Custom sampler/runtime path.
7. Yjs shared nodes/edges.
8. Shared sequencer clips.
9. Awareness cursors/presence.
10. Discord SDK integration.
11. Room persistence.
12. Sample import.
13. Offline export.
14. Semantic search over presets/samples/projects.
15. Visual polish.
16. Web account/save system.
17. Paid limits.
18. Native bridge prototype.
19. LLM-assisted preset tooling.

## 29. Success Criteria

MVP is successful when:

- Four friends can join one Discord Activity.
- One person creates a beat.
- Another adds bass.
- Another patches effects.
- Another tweaks visuals.
- Everyone hears a coherent loop locally.
- The room can save/export a WAV.
- The session feels more like a musical toy than a DAW spreadsheet.

The best product framing:

A multiplayer modular synth and loop lab for Discord — casual enough for friends, powerful enough to make real sounds.
