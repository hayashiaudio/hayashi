---
name: midi-bridge-companion
description: Tauri companion app that bridges hardware MIDI and RTP-MIDI into Hayashi Discord Activity via WebSocket, with audio recording to workstation clips.
metadata:
  type: project
---

# MIDI Bridge Companion — Design Spec

## Problem

Discord Activity iframe CSP blocks `midi`, `usb`, and `bluetooth` permissions. The existing `MidiBridgePanel` popup (`apps/client/src/components/MidiBridgePanel.tsx`) attempts Web MIDI, WebUSB, and WebBluetooth — all fail inside Discord. Users with hardware MIDI controllers cannot use them.

## Solution

A small, square-layout Tauri desktop companion app that runs outside the Discord iframe. It bridges hardware MIDI and external DAW RTP-MIDI into the Discord Activity over a local WebSocket. MIDI events are received by the `midiBridge` node, synthesized into audio, and can be recorded into WAV clips on the `WorkstationEditor` timeline.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  External DAW / Hardware MIDI Controller   │
│  (Ableton, Logic, hardware keyboard)      │
└──────────────┬──────────────────────────────┘
               │ RTP-MIDI (UDP 5004)
               ▼
┌─────────────────────────────────────────────┐
│  Tauri Companion App                        │
│  • RTP-MIDI session listener (UDP)          │
│  • Native OS MIDI API (hardware devices)    │
│  • WebSocket server (localhost)             │
│  • Discord OAuth2 + Unlimited plan gate     │
└──────────────┬──────────────────────────────┘
               │ WebSocket ws://localhost:8765
               ▼
┌─────────────────────────────────────────────┐
│  Discord Activity (iframe)                │
│  • midiBridge node receives MIDI packets    │
│  • midiEngine synthesizes audio             │
│  • WorkstationEditor records & exports WAV  │
└─────────────────────────────────────────────┘
```

### Protocol Bridge

| Leg | Protocol | Port | Notes |
|-----|----------|------|-------|
| External → Tauri | RTP-MIDI | UDP 5004 | Apple MIDI / RFC 4695. Tauri joins as a participant. |
| Tauri → Discord Activity | WebSocket | TCP 8765 | Browser iframes can connect to `ws://localhost`. |

---

## Tauri Companion App

### Window Spec

- **Shape:** Square, fixed aspect ratio (1:1)
- **Size:** 320×320 px (compact, always-on-top optional)
- **Frame:** Minimal decorations; platform-native title bar only
- **Theme:** Matches Hayashi cream/off-white palette
  - Background: `#f5e6c8` (`--hayashi-chrome`)
  - Text: `#0d1a12` (inverted from dark theme for light window)
  - Accent: `#d48c2e` (`--hayashi-amber`)
  - Font: `Avenir Next`, `Segoe UI`, sans-serif (match `--hayashi-font-display`)

### Auth & Billing Gate

1. **Discord OAuth2:** User clicks "Connect Discord" → opens Discord auth in system browser → callback to `http://localhost:8766/oauth/callback` → Tauri captures token via deep link or local HTTP listener.
2. **Unlimited Plan Check:** Tauri calls Hayashi billing API (`bootstrapBilling`) with the Discord access token and a fixed channel ID (e.g., `midi-bridge-global`).
   - If `plan !== 'unlimited'`: show lock screen with upgrade CTA.
   - If unlimited: proceed to bridge view.
3. **Session Persistence:** Store Discord token in Tauri secure store (keychain/kwallet). Re-verify on launch.

### Main View (Post-Auth)

```
┌─────────────────────────┐
│  ◉ Hayashi MIDI Bridge  │  ← title bar
├─────────────────────────┤
│  Status: ● Connected    │  ← green dot when WS client active
│  Device: Arturia KeyStep│  ← selected hardware MIDI device
│  MIDI In:  4 msg/s      │  ← live packet rate
│  RTP-MIDI: Listening    │  ← UDP 5004 status
│                         │
│  Pairing:               │
│  ┌───────────────────┐  │
│  │  calm-river-9137  │  │  ← 4-word code from Discord
│  └───────────────────┘  │
│                         │
│  [ Disconnect ] [Quit] │
└─────────────────────────┘
```

### Pairing Flow

1. User creates a `midiBridge` node in the Discord Activity. The node generates a random 4-word pairing ID (e.g., `calm-river-9137`).
2. User opens the Tauri app, enters the 4-word code.
3. Tauri sends a `PAIR {code}` message over its WebSocket.
4. The Discord Activity's WebSocket client receives `PAIR` ack and locks that `midiBridge` node to this Tauri session.
5. All subsequent MIDI events from Tauri include the pairing ID as the `targetNodeId`.

### RTP-MIDI Implementation

- Use a Rust crate (`rtpmidi` or custom UDP parser) in Tauri to listen on UDP 5004.
- Implement the Apple/RTP-MIDI session invitation / control protocol (minimal subset: session initiation, MIDI command journal, keepalive).
- Parse incoming RTP-MIDI packets, extract MIDI command sections, and forward as WebSocket JSON.

### Hardware MIDI in Tauri

- **macOS:** CoreMIDI via `cidre` or `midir` Rust crate.
- **Windows:** Windows Multimedia API via `midir`.
- **Linux:** ALSA sequencer via `midir`.
- Enumerate input ports, let user select one. Open port, read `MidiMessage` events, forward as WebSocket JSON.

---

## Web App Changes

### 1. Remove `MidiBridgePanel` popup

- Delete `apps/client/src/components/MidiBridgePanel.tsx`.
- Remove the MIDI Bridge button from the toolbar that opens this panel.
- Remove all imports and references to `MidiBridgePanel` in `App.tsx`, `StudioScreen.tsx`, etc.

### 2. MIDI Bridge Node: Pairing ID

Add a new `pairingId` string param to the `midiBridge` node's `defaultParams` in `nodes/registry.ts`:

```ts
defaultParams: {
  waveform: 'sine',
  attack: 0.01,
  decay: 0.3,
  sustain: 0.6,
  release: 0.5,
  gain: 0.8,
  channelFilter: 'all',
  pairingId: '',        // ← new
},
```

In `MidiBridgeNode.tsx`:
- Remove the "Arm" button.
- Add a read-only pairing ID display. Generate it on mount if empty using a 4-word dictionary + 4-digit number (e.g., `calm-river-9137`).
- Show a "Copy Pairing Code" button.
- The node is implicitly armed when a Tauri session is paired (the WebSocket layer controls arming, not the node UI).

### 3. WebSocket Client in Web App

New module: `apps/client/src/audio/midiBridgeClient.ts`

```ts
interface MidiBridgeMessage {
  type: 'midi' | 'pair' | 'pair_ack' | 'pair_nak' | 'ping';
  pairingId: string;
  packet?: MidiPacket;
}
```

- Connects to `ws://localhost:8765`.
- On `pair_ack`: mark the node as paired, start accepting `midi` messages for that `pairingId`.
- On `midi`: call `midiEngine.handleMidiPacket(packet)` with `targetNodeId` set to the paired node's ID.
- Auto-reconnect with exponential backoff (1s → 2s → 4s → 8s, cap 30s).

### 4. Recording from midiBridge Output

When a `workstation` node receives an incoming edge from a `midiBridge` node:

1. **Auto-create a track** (existing behavior in `WorkstationEditor.tsx` already auto-creates tracks for connected sources).
2. **Recording:** The existing `startRecording` in `WorkstationEditor.tsx` uses `MediaRecorder` with `getUserMedia({ audio: true })` to capture the microphone. For `midiBridge` tracks, we need to capture the **rendered output of the MIDI synthesis** instead.

New approach for synthesis sources:

- `midiEngine` already creates oscillators per note connected to `state.outputGain`.
- When a `midiBridge` source track is armed in the workstation, recording should capture the **AudioNode graph output** of that specific `midiBridge` node.
- `audioEngine` or `graphCompiler` can expose a method to capture a specific node's output into an `OfflineAudioContext` or a live `MediaStreamAudioDestinationNode`.

Simplified path (live capture):

```
midiBridge node outputGain
    └──► (tap) MediaStreamAudioDestinationNode
             └──► MediaRecorder
```

- `audioEngine` adds a `tapNode(nodeId: string, destination: MediaStreamAudioDestinationNode)` method that inserts the tap between the node's output and its downstream connection.
- During recording, `WorkstationEditor` taps all armed `midiBridge` source tracks.
- `MediaRecorder` records the stream to WebM, then decodes to `AudioBuffer`, encodes to WAV via existing `encodeWav()`, stores in IndexedDB via `storeSample()`, creates an asset, and adds a clip to the track.

This reuses the existing recording pipeline (WebM → decode → WAV → asset → clip) but with a **synthesized source stream** instead of microphone input.

---

## Data Flow: MIDI Event End-to-End

```
Hardware key pressed
    ↓
Tauri: CoreMIDI / midir receives NoteOn(60, 127, ch=1)
    ↓
Tauri: JSON → { type: 'midi', pairingId: 'calm-river-9137',
                packet: { type: 'noteOn', note: 60, velocity: 127, channel: 1 } }
    ↓
WebSocket ws://localhost:8765
    ↓
Discord Activity: midiBridgeClient receives message
    ↓
midiEngine.handleMidiPacket(packet)
    ↓
OscillatorNode created (freq = 261.63 Hz)
    ↓
Envelope gain ramps (attack=0.01s)
    ↓
Audio flows through patch graph to output
    ↓
(If workstation track is armed + recording)
    ↓
MediaStreamAudioDestinationNode tap captures buffer
    ↓
Recording stops → decode → encodeWav → storeSample
    ↓
Asset + Clip created on workstation track
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Tauri app not running | Web app shows "Companion not connected" on midiBridge node. WS reconnects silently. |
| Wrong pairing code | Tauri shows "No such session". Web app ignores unpaired messages. |
| Unlimited plan expires | Tauri shows lock screen on next billing poll (every 60s). Web app continues to work but new pairings fail. |
| RTP-MIDI network error | Tauri logs to console, retries every 5s. No crash. |
| Hardware MIDI device unplugged | Tauri detects `onstatechange`, clears port, shows "No device". User can reconnect. |
| WebSocket disconnect | Web app shows "Reconnecting…" with countdown. Tauri re-listens immediately. |

---

## Testing Plan

1. **Unit:** `midiBridgeClient.ts` — mock WebSocket, verify `pair_ack` state transitions.
2. **Unit:** `midiEngine.ts` — verify packet routing by `targetNodeId` still works (no regression).
3. **Integration:** Run Tauri app locally, connect a MIDI keyboard (or virtual MIDI port), verify note events reach the browser's `midiEngine` and produce audio.
4. **Integration:** Record from an armed `midiBridge` track, verify WAV asset is created and clip appears in `WorkstationEditor`.
5. **Manual:** Pair with RTP-MIDI from Logic Pro / Ableton on same LAN.

---

## Files Changed

### New
- `apps/desktop/` — Tauri project (Rust + HTML/CSS/JS)
- `apps/desktop/src-tauri/src/rtpmidi.rs` — RTP-MIDI parser
- `apps/desktop/src-tauri/src/midi.rs` — OS MIDI abstraction
- `apps/desktop/src-tauri/src/websocket.rs` — WS server
- `apps/client/src/audio/midiBridgeClient.ts` — WS client
- `apps/client/src/components/MidiBridgePairingBadge.tsx` — node pairing UI

### Modified
- `apps/client/src/components/MidiBridgeNode.tsx` — remove arm button, add pairing display
- `apps/client/src/components/MidiBridgePanel.tsx` — **delete**
- `apps/client/src/nodes/registry.ts` — add `pairingId` default param
- `apps/client/src/audio/midiEngine.ts` — ensure `targetNodeId` routing is robust
- `apps/client/src/audio/engine.ts` — add `tapNode()` method
- `apps/client/src/components/WorkstationEditor.tsx` — support synthesis-source recording
- `apps/client/src/stores/projectStore.ts` — track paired bridge sessions

---

## Open Questions

None. All dependencies (Tauri, `midir`, WebSocket) are well-established. Hayashi's existing audio pipeline (`encodeWav`, `storeSample`, asset system) already supports the recording export path.

---

## Approval

- [x] Architecture: Tauri companion + RTP-MIDI externally, WebSocket internally
- [x] Auth: Discord OAuth2 + Unlimited plan gate
- [x] UI: Square 320×320, cream/off-white Hayashi palette
- [x] Node changes: Pairing ID replaces popup; remove Web MIDI/WebUSB/WebBluetooth
- [x] Recording: Capture synthesized audio via node tap, export to WAV clip
