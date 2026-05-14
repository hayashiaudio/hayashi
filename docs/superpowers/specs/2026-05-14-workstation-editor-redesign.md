# WorkstationEditor Polish Pass Design Spec

**Date:** 2026-05-14
**Scope:** Pure UX/visual polish pass on existing `WorkstationEditor` and `ArrangementGrid` features. No new DAW capabilities (comping/takes, punch-in) in this pass.
**Goal:** Transform the current functional-but-clunky inline-styled editor into a Bandlab-grade DAW chrome with fluid interactions, while keeping the Hayashi color theme and leveraging existing `hayashi-daw-*` CSS.

---

## 1. Context & Motivation

The current `WorkstationEditor.tsx` (~820 lines) uses heavy inline styles, duplicated drag/resize logic via raw `useRef` + `window.addEventListener`, and renders track headers as an inline callback. `ArrangementGrid.tsx` has the same problems with clip rendering and interaction. The existing `index.css` already defines a rich `hayashi-daw-*` class system that is mostly unused. This pass bridges that gap: adopt the CSS, refactor into sub-components, and consolidate interactions into a shared hook.

---

## 2. Component Architecture

### 2.1 File Map

| File | Responsibility | Notes |
|---|---|---|
| `WorkstationEditor.tsx` | Thin orchestrator. Modal shell, header, transport bar, delegates timeline. | Shrinks from ~820 to ~200 lines. |
| `WorkstationShell.tsx` | Top chrome: title, transport controls (play/stop/record), BPM/key/meter pills, track/clip counts, Add Track button. | Extracted from `WorkstationEditor` header + toolbar. |
| `ArrangementGrid.tsx` | Timeline body: ruler, track headers panel, clip lanes area, playhead, zoom/scroll. | Keeps `@tanstack/react-virtual`. Refactored to use CSS classes and new sub-components. |
| `TrackHeader.tsx` | Single track's left sidebar. | New component. Replaces `renderTrackHeader` callback. |
| `ClipLane.tsx` | Single clip's visual + interaction. | New component. Replaces inline clip map in `ArrangementGrid`. |
| `useClipDrag.ts` | Shared hook for clip drag, resize, split, and keyboard interactions. | New hook. Consolidates three duplicated `useRef` + `window.addEventListener` patterns. |

### 2.2 Data Flow

```
WorkstationEditor
  ├── WorkstationShell (chrome, transport)
  └── ArrangementGrid (timeline body)
        ├── Ruler (rendered inside ArrangementGrid)
        ├── TrackHeader[] (left panel, synced scroll)
        ├── ClipLane[] (right area, virtualized)
        └── Playhead (overlay)
```

All components read from `useProjectStore`. No prop drilling beyond `nodeId` and callbacks.

### 2.3 What Stays, What Moves, What Is New

**Stays in WorkstationEditor:**
- `useEffect` for auto-populating source-backed tracks from incoming edges
- `useEffect` for removing orphaned tracks when source nodes disconnect
- `useEffect` for playhead RAF tick
- `togglePlay`, `toggleRecord`, `startRecording`, `stopRecording` callbacks
- `handleAssetDrop`, `handleAddTrack`, `handleRemoveTrack`, `handleSeekToBeat`
- `handleBounceTrack` (continuous source rendering)

**Moves to WorkstationShell:**
- Header bar JSX (title + close button)
- Transport button row (play, record)
- Toolbar row (BPM, track count, clip count, Add Track)

**Moves to TrackHeader:**
- `renderTrackHeader` callback contents (color dot, name, faders, buttons)
- `handleTrackGainChange`, `handleTrackPanChange`, `handleTrackMuteToggle`, `handleToggleArm`, `handlePrintClip`

**Moves to useClipDrag:**
- `dragState` ref and `handleClipMouseDown`
- `resizeState` ref and `handleResizeStart`
- `handleSplit` logic
- `handlePlayheadClick` (split-at-click)
- `handlePlayheadDrag`

---

## 3. Interaction Model

### 3.1 Clip Interactions (useClipDrag.ts)

| Gesture | Behavior | Snap |
|---|---|---|
| Click clip | Select. Amber ring + handles + split button appear. | — |
| Drag clip | Ghost follows cursor (`cursor: grabbing`). Snap line + tooltip. Drop on track moves; empty space keeps track. | Snap to beat by default. Shift = free. |
| Drag left edge | Resize start. Minimum 0.5 beats. Width updates in real-time. | Same as drag. |
| Drag right edge | Resize length. Same behavior. | Same as drag. |
| Double-click clip | Split at cursor position inside clip. | — |
| Hover selected clip | Split button appears at center. Draggable to any position along clip before clicking to split. | Snap to beat. |

### 3.2 Playhead & Timeline

| Gesture | Behavior |
|---|---|
| Click ruler | Seek to that beat. Smooth scroll if off-screen. |
| Drag playhead triangle | Scrub with live timecode. Snap to bars by default, free with Shift. |
| Horizontal scroll / pinch | Zoom timeline (`BEAT_WIDTH` 16px → 64px). Clip waveforms re-render. |

### 3.3 Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `R` | Toggle record (if transport not playing, starts transport + recording) |
| `Delete` / `Backspace` | Remove selected clip |
| `Cmd/Ctrl + D` | Duplicate selected clip at current playhead position |
| `1`–`9` | Select track N (if exists) |
| `←` / `→` | Nudge playhead 1 beat |
| `Shift + ←` / `Shift + →` | Nudge playhead 1 bar (4 beats) |

### 3.4 Snap Behavior

- Default snap: nearest **beat**.
- `BEAT_WIDTH` is a reactive constant driven by zoom level.
- Snap line: 1px dashed vertical in `--hayashi-amber` at 60% opacity.
- Snap tooltip: small pill showing target bar/beat.

---

## 4. Visual Design

### 4.1 Color & Token Usage

All colors come from existing CSS custom properties. No new palette.

| Element | Token | Usage |
|---|---|---|
| Background | `--hayashi-bg` `#0d1a12` | Modal backdrop, shell chrome |
| Panel | `--hayashi-bg-panel` `#111f17` | Track headers, ruler background |
| Chrome text | `--hayashi-chrome` `#f5e6c8` | Labels, numbers, icons |
| Muted text | `--hayashi-text-muted` `#a89b82` | Secondary labels |
| Dim text | `--hayashi-text-dim` `#7a6f5c` | Disabled states |
| Amber accent | `--hayashi-amber` `#d48c2e` | Selection, playhead, record, snap line |
| Amber glow | `--hayashi-amber-glow` | Box-shadow on selected clips |
| Green | `--hayashi-green` `#6a9b3d` | Sampler/drumPad clip fills |
| Red | `--hayashi-red` `#c75b5b` | Muted, armed, remove |
| Blue | `--hayashi-blue` `#5a8fb8` | Info states |

### 4.2 Layout & Sizing

| Element | Size | Notes |
|---|---|---|
| Modal | `min(1100px, 94vw)` × `min(720px, 85vh)` | Unchanged from current. |
| Transport bar height | 48px | Compact but tappable. |
| Ruler height | 24px | Down from 28px. |
| Track header width | 160px | Down from 300px. Critical for screen real estate. |
| Track height | 40px | Down from 48px. Fits more tracks without scrolling. |
| Clip padding (top/bottom) | 4px | So clips are 32px tall inside 40px track. |
| Beat width (zoom 1x) | 28px | Matches current. Scales 0.5x–2x. |

### 4.3 Clip Visual States

| State | Border | Fill | Waveform | Shadow |
|---|---|---|---|---|
| Default | 1px source-color @ 25% | Source-color @ 10% | Cream @ 40% | None |
| Hovered | 1px source-color @ 45% | Source-color @ 18% | Cream @ 55% | `translateY(-1px)` |
| Selected | 2px `--hayashi-amber` @ 70% | Source-color @ 25% | Cream @ 65% | `0 0 8px var(--hayashi-amber-glow)` |
| Drag ghost | 1px `--hayashi-amber` @ 50% | `--hayashi-amber` @ 15% | Cream @ 30% | `brightness(1.3)`, `opacity: 0.9` |

Source-color mapping:
- `sampler`, `drumPad` → `--hayashi-green`
- `oscillator`, `noise` → `--hayashi-text-dim` (moss)
- `midiBridge` → `--hayashi-amber`
- default → `--hayashi-amber`

### 4.4 Track Header Chrome

Each `TrackHeader` is 40px tall, two visual rows:

**Top row (20px):**
- 6px color dot (border-radius 50%), with `box-shadow: 0 0 6px <color>` for continuous sources
- Track name: `font-size: 0.72rem`, `font-family: 'Poppins', sans-serif`, ellipsized
- Asset disc icon (`Disc3` at 10px) if clip has asset
- Source-kind badge: `font-size: 0.58rem`, uppercase, letter-spacing 0.05em

**Bottom row (20px):**
- Gain slider: `type="range"`, 0–1, 60px wide
- Pan slider: `type="range"`, -1 to 1, 48px wide
- Mute button (22px): `Volume2`/`VolumeX`, muted state = red tint
- Arm button (22px): `CircleDot`, armed state = red pulse
- Print/Bounce button (22px): `Disc3`/`Plus` depending on source kind
- Remove button (22px): `Trash2`, red tint

All buttons use `hayashi-workstation-toggle` class with `is-muted`, `is-armed`, `is-print` modifiers.

### 4.5 Playhead

- Triangle head: 10px wide, `--hayashi-amber`, pointing down.
- Vertical line: 1px, `--hayashi-amber` at 40% opacity, full timeline height.
- Grab handle: 12px wide invisible area above triangle for easy targeting.

### 4.6 Ruler

- Bar numbers every 4 beats: `font-size: 0.65rem`, `--hayashi-chrome` at 50%.
- Thin ticks between bars: 1px, `--hayashi-border`.
- Current bar: subtle background highlight in `--hayashi-amber` at 5%.

---

## 5. CSS Strategy

### 5.1 Existing Classes to Adopt

From `index.css`, these classes are well-defined and should be used directly:

- `.hayashi-surface` — modal panel background
- `.hayashi-panel-header` — header row styling
- `.hayashi-kicker-app` — "Workstation" label
- `.hayashi-title-display` — node ID title
- `.hayashi-daw-tbtn` — transport buttons
- `.hayashi-daw-tbtn-rec` / `.is-recording` — record button states
- `.hayashi-status-pill` / `.hayashi-status-pill-bpm` — status badges
- `.hayashi-btn-ghost` / `.hayashi-button-xs` — Add Track / Close buttons
- `.hayashi-workstation-toggle` / `.is-muted` / `.is-armed` / `.is-print` — track header buttons
- `.hayashi-track-fader` — range inputs

### 5.2 New Classes to Add

These are targeted additions for interaction states the old system lacks:

```css
/* === New Workstation Interaction Classes === */

.arrangement-shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* Ruler */
.arrangement-ruler { display: flex; height: 24px; align-items: flex-end; user-select: none; }
.arrangement-ruler-mark { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; }
.arrangement-ruler-number { font-size: 0.65rem; color: var(--hayashi-chrome); opacity: 0.5; position: absolute; bottom: 2px; }
.arrangement-ruler-bar { width: 1px; height: 10px; background: var(--hayashi-border-strong); }
.arrangement-ruler-tick { width: 1px; height: 5px; background: var(--hayashi-border); }

/* Grid lines */
.arrangement-grid-lines { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1; }
.arrangement-grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--hayashi-border); }
.arrangement-grid-line-bar { background: var(--hayashi-border-strong); }

/* Track lane */
.arrangement-track-lane { position: relative; height: 40px; border-bottom: 1px solid var(--hayashi-border); transition: background 0.15s ease; }
.arrangement-track-lane:hover { background: rgba(255, 252, 245, 0.015); }
.arrangement-track-dragover { background: rgba(212, 140, 46, 0.06); }

/* Clip */
.arrangement-clip { position: absolute; top: 4px; border-radius: 4px; cursor: grab; user-select: none; overflow: hidden; display: flex; align-items: center; padding: 0 6px; transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease; }
.arrangement-clip:hover { transform: translateY(-1px); }
.arrangement-clip-selected { border-width: 2px; box-shadow: 0 0 8px var(--hayashi-amber-glow); z-index: 10; }
.arrangement-clip-hover { z-index: 5; }

/* Clip color variants */
.arrangement-clip-leaf { border: 1px solid rgba(143, 177, 58, 0.25); background: rgba(143, 177, 58, 0.1); }
.arrangement-clip-leaf:hover { border-color: rgba(143, 177, 58, 0.45); background: rgba(143, 177, 58, 0.18); }
.arrangement-clip-leaf.arrangement-clip-selected { border-color: rgba(143, 177, 58, 0.7); background: rgba(143, 177, 58, 0.25); }

.arrangement-clip-moss { border: 1px solid rgba(111, 123, 93, 0.25); background: rgba(111, 123, 93, 0.1); }
.arrangement-clip-moss:hover { border-color: rgba(111, 123, 93, 0.45); background: rgba(111, 123, 93, 0.18); }
.arrangement-clip-moss.arrangement-clip-selected { border-color: rgba(111, 123, 93, 0.7); background: rgba(111, 123, 93, 0.25); }

.arrangement-clip-ember { border: 1px solid rgba(212, 140, 46, 0.25); background: rgba(212, 140, 46, 0.1); }
.arrangement-clip-ember:hover { border-color: rgba(212, 140, 46, 0.45); background: rgba(212, 140, 46, 0.18); }
.arrangement-clip-ember.arrangement-clip-selected { border-color: rgba(212, 140, 46, 0.7); background: rgba(212, 140, 46, 0.25); }

/* Clip internals */
.arrangement-clip-waveform { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.arrangement-clip-label { position: relative; z-index: 2; font-size: 0.55rem; color: var(--hayashi-chrome); opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; mix-blend-mode: difference; }
.arrangement-clip-loop { margin-left: 4px; font-size: 0.5rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.05em; }

/* Resize handles */
.arrangement-clip-handle { position: absolute; top: 0; bottom: 0; width: 4px; cursor: col-resize; z-index: 3; opacity: 0; transition: opacity 0.15s ease; }
.arrangement-clip:hover .arrangement-clip-handle,
.arrangement-clip-selected .arrangement-clip-handle { opacity: 1; }
.arrangement-clip-handle-left { left: 0; border-left: 2px solid var(--hayashi-amber); }
.arrangement-clip-handle-right { right: 0; border-right: 2px solid var(--hayashi-amber); }

/* Split button */
.arrangement-clip-split-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 4; opacity: 0; transition: opacity 0.15s ease; background: var(--hayashi-bg-panel); border: 1px solid var(--hayashi-amber); border-radius: 4px; padding: 2px 4px; color: var(--hayashi-amber); cursor: pointer; }
.arrangement-clip:hover .arrangement-clip-split-btn { opacity: 1; }

/* Playhead */
.arrangement-playhead { position: absolute; top: 0; bottom: 0; pointer-events: none; z-index: 20; }
.arrangement-playhead-grab { position: absolute; top: -4px; left: -6px; width: 12px; height: 12px; cursor: grab; pointer-events: auto; }
.arrangement-playhead-line { position: absolute; top: 0; bottom: 0; left: 0; width: 1px; background: var(--hayashi-amber); opacity: 0.4; }
.arrangement-playhead-head { position: absolute; top: 0; left: -5px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid var(--hayashi-amber); }

/* Drag ghost */
.arrangement-clip-ghost { position: fixed; pointer-events: none; z-index: 1000; filter: brightness(1.3); opacity: 0.9; border: 1px solid var(--hayashi-amber); border-radius: 4px; }

/* Snap line */
.arrangement-snap-line { position: absolute; top: 0; bottom: 0; width: 1px; border-left: 1px dashed var(--hayashi-amber); opacity: 0.6; z-index: 15; pointer-events: none; }
.arrangement-snap-tooltip { position: absolute; top: -20px; left: 4px; background: var(--hayashi-bg-panel); border: 1px solid var(--hayashi-border); border-radius: 4px; padding: 2px 6px; font-size: 0.55rem; color: var(--hayashi-chrome); white-space: nowrap; z-index: 16; }
```

---

## 6. State & Data Flow

### 6.1 Store Integration

All components continue reading from `useProjectStore` via selectors. No new stores.

### 6.2 Selection State

`ArrangementGrid` continues to own `selectedClipId` and `hoveredClipId` as local React state (not in Zustand, because selection is UI-local, not project data). `useClipDrag` receives `setSelectedClipId` as a callback.

### 6.3 Zoom State

Zoom is local to `ArrangementGrid`: `zoomLevel` (0.5, 1, 2) derived from pinch/scroll or Ctrl+wheel. `BEAT_WIDTH` becomes `28 * zoomLevel`. Stored in a ref (not state) to avoid re-renders during zoom; debounced re-render at 100ms.

---

## 7. Performance Considerations

- **Virtualization:** Keep `@tanstack/react-virtual` for track lanes. Clip rendering inside each lane is not virtualized (clips per track are typically < 20).
- **Waveform caching:** `ClipWaveform` already debounces WaveSurfer creation. Keep this.
- **Zoom:** `BEAT_WIDTH` ref avoids state churn. Re-render debounced at 100ms.
- **Drag/resize:** Use `transform` (GPU-composited) for ghost movement, not `left/top`.
- **CSS containment:** Add `contain: layout paint` to `.arrangement-track-lane` and `.arrangement-clip`.

---

## 8. Accessibility

- All range inputs (`gain`, `pan`) have `title` tooltips.
- All buttons have `type="button"` and `title` attributes.
- Keyboard shortcuts are active when `ArrangementGrid` has focus or when no input is focused.
- `aria-label` added to transport buttons and clip handles.

---

## 9. Out of Scope (for this pass)

These are noted as **future work** aligned with the user's stated next priorities:

- **Comping / takes:** Multiple recording passes on the same armed track, lane stacking, comp selection.
- **Punch-in recording:** Define pre-roll and post-roll bars, auto-record only within a defined range.
- **MIDI piano roll editor:** Bottom panel for editing `notes` on MIDI clips.
- **Automation lanes:** Per-clip or per-track parameter automation curves.
- **Cross-fade / clip blending:** Overlapping clips with fade handles.

---

## 10. Success Criteria

1. **Visual:** The editor looks like a professional DAW, not a prototype. All inline styles replaced by CSS classes.
2. **Interaction:** Clip drag, resize, split, and playhead scrub feel fluid and predictable. Snap feedback is visible.
3. **Performance:** No jank during drag/resize on projects with 20+ tracks and 50+ clips.
4. **Consistency:** Colors, spacing, and typography match the existing Hayashi design language.
5. **Maintainability:** `WorkstationEditor.tsx` is under 250 lines. `ArrangementGrid` is under 300 lines. New files are focused and single-purpose.
