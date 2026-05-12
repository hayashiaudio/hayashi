---
name: midi-bridge-companion-impl
description: Implementation plan for the MIDI Bridge Companion Tauri app, WebSocket bridge, node UI changes, and synthesized-source recording pipeline.
metadata:
  type: project
---

# MIDI Bridge Companion — Implementation Plan

## Overview

This plan decomposes the [MIDI Bridge Companion design spec](2026-05-12-midi-bridge-companion-design.md) into five incremental phases. Each phase produces a working commit that can be tested independently.

---

## Phase 1: Web App Cleanup & Pairing ID

**Goal:** Remove the non-functional `MidiBridgePanel`, replace it with the pairing ID flow, and lay the WebSocket client foundation.

### 1.1 Delete `MidiBridgePanel` and all references
- Delete `apps/client/src/components/MidiBridgePanel.tsx`
- Remove import and button from `StudioScreen.tsx`
- Remove import and route (if any) from `App.tsx`

### 1.2 Add `pairingId` to `midiBridge` node defaults
- `apps/client/src/nodes/registry.ts`: add `pairingId: ''` to `defaultParams`
- `apps/client/src/types/project.ts`: update `MidiBridgeParams` type if explicit

### 1.3 Refactor `MidiBridgeNode.tsx`
- Remove the "Arm" button
- On mount, if `pairingId` is empty, generate a 4-word + 4-digit code (e.g. `calm-river-9137`)
  - Use a ~1000-word dictionary, pick 3 adjectives/nouns + random 4-digit number
- Display the code in a read-only, copyable field
- Add a "Copy Pairing Code" button
- Show connection status indicator (disconnected / connecting / connected)

### 1.4 Scaffold `midiBridgeClient.ts`
- Create `apps/client/src/audio/midiBridgeClient.ts`
- Define `MidiBridgeMessage` interface
- Implement WebSocket connect to `ws://localhost:8765`
- Implement exponential backoff reconnect (1s → 2s → 4s → 8s, cap 30s)
- On `pair_ack`: store `paired = true`, update node status
- On `pair_nak`: store `paired = false`, show error on node
- On `midi`: forward to `midiEngine.handleMidiPacket(packet, targetNodeId)`
- Export `pairSession(pairingId: string)` function that sends `PAIR {code}`
- Export `disconnect()` for cleanup

### 1.5 Wire client into `midiBridge` node lifecycle
- In `MidiBridgeNode.tsx`: call `pairSession(pairingId)` when pairingId is set
- Call `disconnect()` on unmount

### Verification
- [ ] StudioScreen no longer shows MIDI Bridge button
- [ ] midiBridge node shows a pairing code on mount
- [ ] Copy button copies code to clipboard
- [ ] `midiBridgeClient.ts` connects to localhost:8765 and reconnects on drop

---

## Phase 2: Tauri Companion App Skeleton

**Goal:** Bootstrap the `apps/desktop` Tauri project, build the square UI, and implement Discord OAuth2 + billing gate.

### 2.1 Bootstrap Tauri project
- Create `apps/desktop/` with Tauri v2 (`npm create tauri-app@latest` or manual)
- Configure `tauri.conf.json`:
  - Window: 320×320, resizable: false, alwaysOnTop: optional
  - Title: "Hayashi MIDI Bridge"
  - Allowed origin for deep link: `hayashi://oauth/callback`
- Add custom CSS variables matching Hayashi palette (cream bg, amber accent)

### 2.2 Discord OAuth2 flow
- Implement OAuth2 PKCE flow:
  1. Generate code verifier + challenge
  2. Open Discord auth URL in system browser (`tauri api::shell::open`)
  3. Start local HTTP listener on `localhost:8766/oauth/callback` (Tauri command)
  4. Exchange code for access token via Discord token endpoint
  5. Store token in Tauri secure storage (`tauri-plugin-stronghold` or `keytar`)

### 2.3 Unlimited plan gate
- On launch and every 60s, call Hayashi billing API (`bootstrapBilling`)
- Pass Discord access token + fixed channelId `midi-bridge-global`
- If `plan !== 'unlimited'`: show lock screen with upgrade CTA + "Open Hayashi in Browser" button
- If unlimited: show main bridge view

### 2.4 Main bridge view UI
- Compact status display:
  - Connection status (red/green dot + "Connected" / "Waiting for pair…")
  - Selected MIDI device name (or "None")
  - MIDI message rate counter (msg/s)
  - RTP-MIDI status ("Listening on :5004" / "Off")
- Pairing input: text field for 4-word code + "Pair" button
- Footer: [Disconnect] [Quit] buttons

### 2.5 WebSocket server in Tauri
- Rust module `src/websocket.rs`:
  - Start `tokio-tungstenite` WS server on `127.0.0.1:8765`
  - Handle connections from the web app
  - Maintain a `HashMap<String, WebSocketStream>` of paired sessions keyed by `pairingId`
  - On `PAIR {code}`: check if code exists in map, if not insert and send `pair_ack`
  - On `midi` message: forward to the paired web app client

### Verification
- [ ] `cargo tauri dev` launches a 320×320 window
- [ ] Discord login stores token in secure storage
- [ ] Non-unlimited account shows lock screen
- [ ] WS server accepts connections on localhost:8765
- [ ] Pairing flow: Tauri sends PAIR → web app receives pair_ack → both show connected

---

## Phase 3: Native MIDI & RTP-MIDI in Tauri

**Goal:** Bridge hardware MIDI and RTP-MIDI into the WebSocket.

### 3.1 Hardware MIDI (Rust)
- Add `midir` crate to `Cargo.toml`
- Module `src/midi.rs`:
  - Enumerate input ports on startup
  - Let user select a port via dropdown in UI (Tauri command)
  - Open selected port, read `MidiMessage`, convert to JSON, send to paired WS client
  - Handle `onstatechange`: if device unplugged, clear selection and notify UI

### 3.2 RTP-MIDI (Rust)
- Add `rtpmidi = "0.4.4"` to `Cargo.toml`
- Module `src/rtpmidi.rs`:
  - Use `rtpmidi::RtpMidiSession::start()` to bind UDP on `0.0.0.0:5004`
  - Handle session invitations / acceptance via `InviteResponder::Accept`
  - Listen for `RtpMidiEventType::MidiPacket`, convert commands to JSON, forward to paired WS client
  - Optional: enable `mdns` feature for Bonjour advertising
- UI toggle: "Enable RTP-MIDI" checkbox

### 3.3 Message format
```json
{
  "type": "midi",
  "pairingId": "calm-river-9137",
  "packet": {
    "type": "noteOn",
    "note": 60,
    "velocity": 127,
    "channel": 1
  }
}
```

### Verification
- [ ] Connect a MIDI keyboard (or virtual port), press keys → web app `midiEngine` receives events and produces audio
- [ ] Device unplugged → UI shows "No device" gracefully
- [ ] (If available) RTP-MIDI from Logic/Ableton → events reach web app

---

## Phase 4: Synthesized-Source Recording

**Goal:** Allow `WorkstationEditor` to record audio output from `midiBridge` nodes instead of only microphone input.

### 4.1 Add `tapNode` to audio engine
- `apps/client/src/audio/engine.ts`:
  - Add `tapNode(nodeId: string, destination: MediaStreamAudioDestinationNode): () => void`
  - Find the node's `outputGain`, disconnect its downstream connection, connect to `destination`, reconnect downstream after tap
  - Return cleanup function that removes the tap

### 4.2 Workstation track auto-detection for midiBridge
- In `WorkstationEditor.tsx`: existing behavior auto-creates tracks for connected sources. Verify this already handles `midiBridge` edges.
- If not, add logic: on graph change, create a track for each incoming `midiBridge` edge.

### 4.3 Recording flow for synthesis sources
- When recording starts and a track's source is `midiBridge` (instead of `mic`):
  - Call `audioEngine.tapNode(midiBridgeNodeId, mediaStreamDestination)`
  - Create `MediaRecorder` for the destination's stream
  - Record to `Blob[]` in memory (same as mic path)
- When recording stops:
  - Stop MediaRecorder, get Blob
  - Decode WebM → `AudioBuffer` via `decodeAudioData`
  - Encode to WAV via existing `encodeWav()`
  - Store in IndexedDB via `storeSample()`
  - Create asset + clip on the track (reuse existing pipeline)

### 4.4 UI indicators
- On `midiBridge` source tracks in WorkstationEditor:
  - Show "Synthesis" label instead of microphone icon
  - Arm button works the same (red circle)

### Verification
- [ ] Arm a midiBridge track, start recording, play MIDI notes → clip appears after stop
- [ ] Exported WAV plays back the synthesized audio correctly
- [ ] Mic tracks still work as before (no regression)

---

## Phase 5: Polish, Error Handling & Integration Tests

**Goal:** Harden all paths, add tests, and document.

### 5.1 Error handling (web app)
- `midiBridgeClient.ts`:
  - Show "Companion not connected" on node when WS is down
  - Ignore `midi` messages for unpaired IDs
- `MidiBridgeNode.tsx`:
  - Visual states: disconnected (gray), pairing (yellow), connected (green)

### 5.2 Error handling (Tauri)
- RTP-MIDI network error: log, retry every 5s
- Hardware MIDI unplugged: detect via `midir` callbacks, clear port
- WS disconnect: re-listen immediately, keep paired sessions in memory

### 5.3 Unit tests
- `apps/client/src/audio/__tests__/midiBridgeClient.test.ts`:
  - Mock WebSocket, verify `pairSession` → `pair_ack` state transition
  - Verify `midi` message routes to `midiEngine.handleMidiPacket`
- `apps/client/src/audio/__tests__/midiEngine.test.ts`:
  - Verify `targetNodeId` routing still works (regression test)

### 5.4 Integration test
- Add test in `apps/client/src/audio/__tests__/granularSync.test.ts` pattern (or new file):
  - Mock WS server, send MIDI packet, assert oscillator created

### 5.5 Documentation
- Add `apps/desktop/README.md` with build instructions (`cargo tauri build`)
- Update top-level `README.md` with MIDI Bridge Companion section

### Verification
- [ ] All unit tests pass
- [ ] `npm run test` in `apps/client` has no regressions
- [ ] Manual end-to-end: Tauri app → pair → MIDI keyboard → audio → record → WAV playback

---

## Rollback Plan

If any phase introduces instability, the rollback is:
1. Revert the phase commit
2. `MidiBridgePanel` is already deleted in Phase 1 — if we need to restore Web MIDI support (e.g. Discord relaxes CSP), it can be re-added as a separate file later.
3. The `pairingId` param is additive and safe to leave in registry even if the bridge is disabled.

## Dependencies

| Phase | New Dependencies |
|-------|------------------|
| 1 | None |
| 2 | `@tauri-apps/cli`, `@tauri-apps/api`, `tauri-plugin-stronghold` (or `keytar`) |
| 3 | `midir`, `rtpmidi = "0.4.4"` (Rust crates) |
| 4 | None |
| 5 | None |

## Estimated Effort

| Phase | Estimate |
|-------|----------|
| 1 | 2–3 hours |
| 2 | 4–6 hours |
| 3 | 3–4 hours |
| 4 | 2–3 hours |
| 5 | 2–3 hours |
| **Total** | **13–19 hours** |

## Approval

- [x] Phases are incremental and independently testable
- [x] Each phase has clear verification checklist
- [x] Rollback plan covers all phases
- [x] Effort estimates are realistic
