---
name: midi-bridge-companion-redesign
description: Redesign of the Hayashi MIDI Bridge companion app with studio hardware panel aesthetic, minimal text UI, and OAuth timeout fix.
metadata:
  type: project
---

# MIDI Bridge Companion — Redesign Spec

## Problem

The previous companion app was deleted in commit `5ac7233`. It had three critical issues:
1. **Text-heavy UI**: Labels on every field, generic form aesthetic. A 320×320 window felt cramped and confusing.
2. **OAuth hang**: `capture_oauth_code()` in Rust blocks forever on `listener.accept()` with no timeout. If the user closes the browser or never authorizes, the app hangs.
3. **Missing from repo**: The entire `apps/desktop/` directory was removed in the latest commit.

## Solution

Rebuild `apps/desktop/` with a **studio hardware panel** aesthetic. State is communicated through colored LEDs, meters, and icons rather than text. The OAuth listener gets a 5-minute timeout with proper error propagation.

---

## Aesthetic Direction: Studio Hardware Panel

- **Background**: `#1a1a1a` charcoal
- **Surface**: `#222222`
- **Accent amber**: `#e8a838` (activity, waiting)
- **Accent green**: `#4ade80` (success, paired)
- **Accent red**: `#f87171` (error, locked)
- **Text**: `#a3a3a3` muted gray, minimal usage
- **Font**: JetBrains Mono (technical, readable at small sizes)

### Visual Language
- **Status LED**: A single 8px dot in the status bar. Color alone communicates state.
- **VU meter**: A thin vertical bar that rises with MIDI message rate. No numbers, pure visual feedback.
- **Icons**: All buttons are icon-only. Hover reveals tooltip.

---

## UI States

### 1. Connect State
- Centered Discord icon button (no text).
- Amber LED pulses slowly below it: "waiting for auth."
- If OAuth times out, LED turns red and a small "Retry" icon appears.

### 2. Locked State
- Lock icon centered.
- Red LED.
- Small upgrade button (crown icon) opens billing URL.
- No text labels, only iconography.

### 3. Main State
Three zones stacked vertically:

**Top zone**: Status bar
- LED + one-word status ("Ready", "Paired", "Active").
- Gear icon button opens MIDI device selector dropdown.

**Middle zone**: Signal path
- MIDI device selector (gear icon + `<select>`, hidden until gear clicked, or always visible but compact).
- VU activity meter (thin vertical bar, 4px wide, 60px tall, rises with `msgRate`).
- RTP-MIDI toggle (antenna icon). Amber = listening. Gray = off.

**Bottom zone**: Pairing + controls
- Pairing input: 🔗 icon + short text input (placeholder `········`), pair button (✓).
- Paired badge: green dot + truncated pairing ID.
- Disconnect (🔌) and Quit (✕) icon buttons.

---

## OAuth Hang Fix

### Root Cause
`capture_oauth_code()` uses `TcpListener::accept()` which blocks indefinitely. If the user never completes the OAuth flow, the Tauri command never returns and the frontend stays in "Authenticating…" forever.

### Fix
Wrap `listener.accept()` in `tokio::time::timeout(Duration::from_secs(300), listener.accept())`. If timeout expires:
1. Return `Err("Authentication timed out".into())`.
2. Frontend catches this, sets LED to red, shows retry icon.
3. Ensure the listener is dropped and port is released between attempts.

---

## Architecture

Same as previous design:
- Tauri v2 app, 320×320 window, square layout.
- WebSocket server on `127.0.0.1:8765`.
- Discord OAuth2 PKCE flow with keyring token storage.
- Billing gate via Hayashi server API (`/billing/bootstrap`).
- Native MIDI via midir crate.
- RTP-MIDI listener (UDP 5004).

---

## File Changes

**New files** (restoring `apps/desktop/`):
- `apps/desktop/index.html`
- `apps/desktop/package.json`
- `apps/desktop/tsconfig.json`
- `apps/desktop/vite.config.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/style.css`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/build.rs`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/midi.rs`
- `apps/desktop/src-tauri/src/rtpmidi.rs`
- `apps/desktop/.gitignore`

**Modified**:
- None (this is a full restore + redesign).

---

## Testing Checklist

- [ ] App builds (`cargo tauri build`) without errors.
- [ ] OAuth flow opens browser and captures token.
- [ ] OAuth timeout after 5 minutes returns error to frontend.
- [ ] Billing check gates correctly (lock screen for non-unlimited).
- [ ] WebSocket server receives pairing and forwards MIDI.
- [ ] MIDI device list populates.
- [ ] MIDI input forwards packets to paired WebSocket client.
- [ ] RTP-MIDI toggle starts/stops UDP listener.
- [ ] Disconnect button clears pairing state.
- [ ] Quit button closes the window.
