# Plugin Marketplace & DSP Plugin System — Design Spec

> **Date:** 2026-05-13
> **Scope:** First-party plugin SDK, marketplace UI, Discord SKU monetization, and 3-5 flagship audio plugins.
> **Approach:** B — Full Plugin SDK with custom UI components per plugin.

---

## 1. Goals

1. **Create a plugin SDK** that lets Hayashi ship premium DSP plugins with custom React UIs, factory presets, and Discord SKU purchase gates.
2. **Build a marketplace UI** inside Hayashi where users browse, preview, purchase, and install plugins via Discord native monetization.
3. **Ship 3-5 first-party flagship plugins** that demonstrate Valhalla-level quality (algorithmic reverb, tape delay, analog-modeled compressor, chorus, saturation).
4. **Open the door to third-party plugins later** without architecture changes.

---

## 2. Non-Goals

- Native VST/AU plugin bridge (out of scope for a web-based DAW).
- Real-time plugin parameter modulation via LFOs (future phase).
- Plugin sandboxing or security isolation beyond standard WebAudio/Faust.
- Offline plugin compilation service — all compilation happens client-side via `@grame/faustwasm`.

---

## 3. Architecture

### 3.1 Plugin Manifest

The manifest is the single contract between Hayashi and any plugin. It defines DSP, parameters, UI, presets, and monetization.

```typescript
export interface PluginManifest {
  id: string;           // e.g. "hayashi-reverb-fdn"
  name: string;         // e.g. "Cathedral Reverb"
  author: string;       // e.g. "Hayashi Audio"
  description: string;
  category: PluginCategory;
  version: string;
  skuId?: string;       // Discord SKU ID for purchase gating
  tags: string[];

  // DSP
  dspCode: string;      // Full Faust source code

  // Parameters
  params: PluginParam[];

  // Presets
  factoryPresets: PluginPreset[];

  // UI reference
  uiComponent?: string; // Registered React component name
}

export type PluginCategory =
  | 'reverb'
  | 'delay'
  | 'modulation'
  | 'dynamics'
  | 'eq'
  | 'saturation'
  | 'filter'
  | 'utility';

export interface PluginParam {
  id: string;
  name: string;
  type: 'float' | 'int' | 'choice' | 'boolean';
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  choices?: { value: string; label: string }[];
  unit?: string;        // e.g. "ms", "%", "dB", "Hz"
  display: 'linear' | 'logarithmic';
  // Optional: group params visually in the UI
  group?: string;
}

export interface PluginPreset {
  name: string;
  description?: string;
  params: Record<string, number | string | boolean>;
}
```

### 3.2 Node Data Model Extension

Plugins are first-class node kinds in the project graph.

```typescript
// Add to NodeKind in apps/client/src/types/project.ts
export type NodeKind =
  | 'oscillator'
  | 'noise'
  | /* ... existing ... */
  | 'plugin';

// PatchNode extension
export interface PatchNode {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  params: Record<string, number | string | boolean>;
  owner?: string;
  muted?: boolean;
  color?: string;

  // Plugin-specific (only used when kind === 'plugin')
  pluginId?: string;
  pluginParams?: Record<string, number | string | boolean>;
}
```

When `kind === 'plugin'`, the node inspector renders the plugin's custom UI component. `pluginParams` stores the user's knob settings independently of generic `params`.

### 3.3 Plugin Registry

A client-side registry that maps plugin IDs to manifests and UI components.

```typescript
export interface PluginUIProps {
  manifest: PluginManifest;
  params: Record<string, number | string | boolean>;
  onParamChange: (paramId: string, value: number | string | boolean) => void;
  onPresetLoad: (preset: PluginPreset) => void;
}

export class PluginRegistry {
  private manifests = new Map<string, PluginManifest>();
  private uiComponents = new Map<string, React.FC<PluginUIProps>>();

  register(manifest: PluginManifest, component?: React.FC<PluginUIProps>): void;
  getManifest(id: string): PluginManifest | undefined;
  getUI(id: string): React.FC<PluginUIProps> | undefined;
  listAll(): PluginManifest[];
  listByCategory(category: PluginCategory): PluginManifest[];
  listAvailable(entitledSkuIds: Set<string>): PluginManifest[];
}
```

**Registration flow:**
1. Built-in plugins register at app bootstrap via `registerBuiltinPlugins()`.
2. User-purchased plugins are fetched from the server at session start and registered dynamically.

### 3.4 Audio Graph Integration

The existing `graphCompiler.ts` compiles `PatchNode` objects into `AudioNode` instances. For `kind === 'plugin'`:

1. Look up `PluginManifest` by `node.pluginId`.
2. Compile Faust DSP via existing `compileFaustNode(ctx, manifest.dspCode, node.id)`.
3. Cache the compiled worklet by `pluginId` (already handled in `faustWorkletCache`).
4. Map `pluginParams` to Faust worklet parameters via MessagePort (already supported in `updateNodeParam`).
5. Connect as mono or stereo audio node in the graph.

**Parameter update path:**
- User drags a knob in the custom UI → `onParamChange(paramId, value)` → project store updates `pluginParams` → `updateNodeParam(nodeId, paramId, value)` → MessagePort sends `{ type: 'param', key: paramId, value }` to the Faust worklet.

### 3.5 Marketplace & Purchase Flow

```
┌─────────────────────────────────────┐
│  Plugin Marketplace (React Modal)    │
├─────────────────────────────────────┤
│  [Category tabs: All | Reverb      │
│   | Delay | Dynamics | ...]         │
│                                      │
│  ┌─────────┐ ┌─────────┐          │
│  │Reverb   │ │Delay    │          │
│  │$4.99    │ │$4.99    │          │
│  │[Preview]│ │[Preview]│          │
│  │[Buy]    │ │[Buy]    │          │
│  └─────────┘ └─────────┘          │
│                                      │
│  Owned: ✓ Cathedral Reverb          │
└─────────────────────────────────────┘
```

**Purchase flow:**
1. User clicks "Buy" on a plugin card.
2. Client calls `startDiscordPurchase(manifest.skuId)` (existing helper from billing work).
3. Discord purchase UI opens.
4. On `ENTITLEMENT_CREATE` event, client re-bootstraps billing state.
5. Plugin card updates to "Owned" and becomes available in the node palette.

**Unowned plugin behavior:**
- Plugin card shows "Preview" button that loads a watermarked or limited-parameter demo.
- Adding an unowned plugin to a project shows a "Purchase to unlock" overlay on the node inspector.

---

## 4. Components

### 4.1 Server-Side

**Database Schema Extension:**

```typescript
// apps/server/src/db/schema.ts
export const plugins = pgTable('plugins', {
  id: text('id').primaryKey(),          // matches manifest.id
  name: text('name').notNull(),
  author: text('author').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  version: text('version').notNull(),
  skuId: text('sku_id'),               // Discord SKU for monetization
  dspCode: text('dsp_code').notNull(),
  manifestJson: text('manifest_json').notNull(), // full manifest serialized
  isBuiltin: boolean('is_builtin').notNull().default(false),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const userPlugins = pgTable(
  'user_plugins',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.discordUserId, { onDelete: 'cascade' }),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    purchasedAt: bigint('purchased_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    userPluginUnique: uniqueIndex('user_plugins_user_plugin_unique').on(table.userId, table.pluginId),
  })
);
```

**API Endpoints:**

```typescript
// GET /plugins
// Returns all available plugin manifests (no DSP code — just metadata)
// Response: PluginManifest[]

// GET /plugins/:id
// Returns full manifest including dspCode for a specific plugin
// Response: PluginManifest

// GET /users/me/plugins
// Returns plugin IDs the current user owns
// Response: { plugins: string[] }
```

**Entitlement Integration:**
- The billing service already syncs Discord entitlements on bootstrap.
- Plugin ownership is determined by checking if the user has an entitlement for the plugin's `skuId`.
- Server maintains `userPlugins` table as a cache of purchase history, but the source of truth is Discord's entitlements API.

### 4.2 Client-Side

**New Files:**

| File | Responsibility |
|------|-------------|
| `apps/client/src/plugins/registry.ts` | PluginRegistry class, registration API |
| `apps/client/src/plugins/types.ts` | PluginManifest, PluginParam, PluginPreset, PluginUIProps interfaces |
| `apps/client/src/plugins/builtins/` | Built-in first-party plugin manifests and UI components |
| `apps/client/src/components/PluginMarketplace.tsx` | Marketplace modal UI |
| `apps/client/src/components/PluginNode.tsx` | Node renderer for `kind === 'plugin'` |
| `apps/client/src/components/PluginInspector.tsx` | Inspector panel that mounts the plugin's custom UI |
| `apps/client/src/components/GenericPluginUI.tsx` | Fallback parameter panel for plugins without custom UI |

**Modified Files:**

| File | Change |
|------|--------|
| `apps/client/src/types/project.ts` | Add `'plugin'` to `NodeKind`, add `pluginId`/`pluginParams` to `PatchNode` |
| `apps/client/src/nodes/registry.ts` | Add `plugin` to `BUILTIN_NODES` with generic description |
| `apps/client/src/audio/graphCompiler.ts` | Add `plugin` case in compilation switch |
| `apps/client/src/audio/engine.ts` | Expose plugin worklet cache management |
| `apps/client/src/components/NodeInspector.tsx` | Branch to `PluginInspector` when `kind === 'plugin'` |
| `apps/client/src/components/PatchCanvas.tsx` | Add plugin nodes to palette via marketplace |
| `apps/server/src/db/schema.ts` | Add `plugins` and `userPlugins` tables |
| `apps/server/src/routes.ts` | Add plugin CRUD and user plugin endpoints |
| `apps/server/src/billing/service.ts` | Add `syncPluginEntitlements` method |

---

## 5. First-Party Plugin Lineup (V1)

### 5.1 Cathedral Reverb (FDN)
- **Category:** reverb
- **DSP:** 8x8 Feedback Delay Network with modulated delay lines, allpass diffusion, and filtered feedback.
- **Params:** Size (20-200%), Decay (0.5-20s), Pre-delay (0-500ms), Damping (1kHz-20kHz), Modulation (0-100%), Mix (0-100%).
- **UI:** Visual decay curve with pre-delay indicator, size as room size graphic.

### 5.2 Tape Echo
- **Category:** delay
- **DSP:** Tape delay emulation with wow/flutter modulation, tape saturation (tanh waveshaping), and feedback filter.
- **Params:** Time (50-2000ms), Feedback (0-120%), Flutter (0-100%), Saturation (0-100%), Mix (0-100%).
- **UI:** Tape reel visualization, time shown as tape loop length.

### 5.3 VCA Compressor
- **Category:** dynamics
- **DSP:** Feed-forward VCA compressor with adjustable knee, sidechain highpass, and makeup gain.
- **Params:** Threshold (-60-0dB), Ratio (1:1-30:1), Attack (0.01-100ms), Release (10-2000ms), Makeup (0-24dB), Knee (0-12dB).
- **UI:** Input/output transfer curve with real-time gain reduction meter.

### 5.4 Analog Chorus
- **Category:** modulation
- **DSP:** 3-voice BBD-style chorus with LFO phase offset, rate/depth per voice, and highpass filtering.
- **Params:** Rate (0.1-10Hz), Depth (0-100%), Voices (1-3), Spread (0-100%), Tone (1kHz-10kHz), Mix (0-100%).
- **UI:** LFO waveform visualization with voice spread indicator.

### 5.5 Tape Saturator
- **Category:** saturation
- **DSP:** Tape hysteresis model using tanh with adjustable bias and drive, plus 2nd/3rd harmonic emphasis.
- **Params:** Drive (0-100%), Bias (0-100%), Harmonics (0-100%), Warmth (0-100%), Mix (0-100%).
- **UI:** Harmonic spectrum graph showing added harmonics in real time.

---

## 6. Data Flow

### 6.1 Plugin Installation Flow

```
User opens Plugin Marketplace
  → Client fetches /plugins (metadata only)
  → Client fetches /users/me/plugins (owned IDs)
  → Marketplace renders cards with Buy/Owned state

User clicks "Buy" on Cathedral Reverb
  → startDiscordPurchase(skuId)
  → Discord purchase UI
  → ENTITLEMENT_CREATE event
  → Client re-bootstraps billing
  → Server confirms entitlement via Discord API
  → Plugin marked as owned in UI
  → Plugin appears in node palette

User drags Cathedral Reverb onto canvas
  → PatchNode created with kind='plugin', pluginId='hayashi-reverb-fdn'
  → Graph compiler loads manifest, compiles Faust DSP
  → AudioWorklet created, parameters initialized from factory defaults
  → Node inspector mounts CathedralReverbUI component

User adjusts Decay knob
  → onParamChange('decay', 4.5)
  → pluginParams updated in project store
  → updateNodeParam sends MessagePort message to worklet
  → Reverb decay changes in real time
```

### 6.2 Preset Flow

```
User opens preset dropdown in plugin inspector
  → Factory presets listed from manifest
  → User selects "Large Hall"
  → pluginParams replaced with preset values
  → All params update simultaneously via updateNodeParam
  → Project store persists new pluginParams
```

---

## 7. Error Handling

| Error | Behavior |
|-------|----------|
| Faust compilation fails | Node renders as "Broken Plugin" with red border. Error logged to console. |
| Plugin manifest not found | Node renders as "Unknown Plugin" with generic params. |
| Purchase fails | Show Discord error toast. Plugin remains unowned. |
| Entitlement sync fails | Cache last-known entitlements for 5 minutes. Graceful degradation. |
| Plugin worklet crashes | Disconnect node from graph, show error badge. User can delete and re-add. |

---

## 8. Testing Strategy

| Layer | Tests |
|-------|-------|
| DSP | Each first-party plugin has a Faust compilation test + audio output snapshot test (verify it produces non-silent audio). |
| Registry | Unit test PluginRegistry.register, getManifest, listAvailable with mock entitlements. |
| Graph compiler | Integration test that a `plugin` node compiles to a valid AudioWorkletNode and connects in the graph. |
| Marketplace | Component test: renders cards, handles purchase click, filters by category. |
| Inspector | Component test: mounts custom UI, dispatches param changes, loads presets. |
| Server | API tests for /plugins, /users/me/plugins, entitlement-gated access. |

---

## 9. Migration & Compatibility

- Existing projects with `kind: 'faust'` continue to work unchanged.
- The `faust` node kind remains for user-authored DSP. Plugins are a separate, richer abstraction.
- No database migration needed for existing projects — `pluginId` and `pluginParams` are optional fields.

---

## 10. Future Extensions (Not in V1)

- Third-party plugin publishing portal.
- User-authored plugins (users write Faust + upload manifest).
- Plugin parameter automation via arrangement clips.
- Plugin preset sharing/export.
- A/B plugin comparison in the marketplace.

---

## Spec Self-Review

- **Placeholder scan:** No TBDs, TODOs, or incomplete sections. All code examples are concrete.
- **Internal consistency:** Manifest schema aligns with node data model. Audio graph integration reuses existing Faust compilation path. Purchase flow leverages existing Discord billing infrastructure.
- **Scope check:** Focused on first-party plugin SDK + marketplace + 5 plugins. Third-party and advanced features deferred.
- **Ambiguity check:** Plugin param update path is explicit. Unowned plugin behavior is defined. Error handling covers edge cases.
