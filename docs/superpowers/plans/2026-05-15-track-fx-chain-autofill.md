# Track FX Chain Autofill Staging Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live staging area inside TrackFxChain that suggests processor nodes found in the patch graph between `track.sourceNodeId` and `track.workstationNodeId`, letting users click to append them to the active FX chain.

**Architecture:** Extract graph-walking logic into a pure utility (`lib/fxChainSuggestions.ts`) that performs a BFS from source toward workstation, collecting reachable processors. TrackFxChain consumes this via `useMemo` and renders ghosted suggestion slots. No store schema changes; existing `updateTrackFxChain` and graph compilation handle the rest.

**Tech Stack:** React, Zustand, Vitest, existing CSS class conventions.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/client/src/nodes/registry.ts` | Modify | Add `isProcessorNode(kind)` helper so the BFS can identify traversable nodes from a single source of truth |
| `apps/client/src/lib/fxChainSuggestions.ts` | Create | Pure BFS utility: `getSuggestedProcessorIds(sourceNodeId, workstationNodeId, nodes, edges, fxChain)` |
| `apps/client/src/lib/__tests__/fxChainSuggestions.test.ts` | Create | Unit tests for the BFS utility covering linear chains, branching, cycles, missing bindings, and non-processor traversal |
| `apps/client/src/components/TrackFxChain.tsx` | Modify | Import utility, compute suggestions via `useMemo`, render ghosted suggestion slots with click-to-add affordance |
| `apps/client/src/index.css` | Modify | Add `.hayashi-daw-fx-slot-suggested` CSS class for ghosted slot styling |

---

### Task 1: Add `isProcessorNode` to `registry.ts`

**Files:**
- Modify: `apps/client/src/nodes/registry.ts`

- [ ] **Step 1: Add `PROCESSOR_KINDS` set and `isProcessorNode` function**

Insert the following immediately after the `BUILTIN_NODES` array definition (after line 223):

```typescript
const PROCESSOR_KINDS = new Set<NodeKind>(
  BUILTIN_NODES.filter((n) => n.category === 'processor').map((n) => n.kind)
);

export function isProcessorNode(kind: NodeKind): boolean {
  return PROCESSOR_KINDS.has(kind);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/nodes/registry.ts
git commit -m "$(cat <<'EOF'
feat: add isProcessorNode helper to registry

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create BFS utility `fxChainSuggestions.ts`

**Files:**
- Create: `apps/client/src/lib/fxChainSuggestions.ts`

- [ ] **Step 1: Write the utility**

```typescript
import type { PatchNode, PatchEdge } from '@/types/project';
import { isProcessorNode } from '@/nodes/registry';

export function getSuggestedProcessorIds(
  sourceNodeId: string | undefined,
  workstationNodeId: string | undefined,
  nodes: Record<string, PatchNode>,
  edges: Record<string, PatchEdge>,
  fxChain: string[]
): string[] {
  if (!sourceNodeId || !workstationNodeId) return [];
  if (sourceNodeId === workstationNodeId) return [];

  const existing = new Set(fxChain);
  const visited = new Set<string>();
  const results: string[] = [];
  const queue: string[] = [sourceNodeId];
  visited.add(sourceNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of Object.values(edges)) {
      if (edge.sourceNodeId !== current) continue;
      const targetId = edge.targetNodeId;
      if (targetId === workstationNodeId) continue;
      if (visited.has(targetId)) continue;
      visited.add(targetId);

      const targetNode = nodes[targetId];
      if (targetNode && isProcessorNode(targetNode.kind) && !existing.has(targetId)) {
        results.push(targetId);
      }
      queue.push(targetId);
    }
  }

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/lib/fxChainSuggestions.ts
git commit -m "$(cat <<'EOF'
feat: add BFS utility for suggesting FX chain processors

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Unit tests for BFS utility

**Files:**
- Create: `apps/client/src/lib/__tests__/fxChainSuggestions.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, test, expect } from 'vitest';
import { getSuggestedProcessorIds } from '../fxChainSuggestions';

const makeNode = (id: string, kind: string) => ({
  id,
  kind,
  position: { x: 0, y: 0 },
  params: {},
});

const makeEdge = (id: string, source: string, target: string) => ({
  id,
  sourceNodeId: source,
  sourcePort: 'out',
  targetNodeId: target,
  targetPort: 'in',
  signalType: 'audio' as const,
});

describe('getSuggestedProcessorIds', () => {
  test('linear chain suggests processors in order', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      f: makeNode('f', 'filter'),
      d: makeNode('d', 'delay'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'f'),
      e2: makeEdge('e2', 'f', 'd'),
      e3: makeEdge('e3', 'd', 'ws'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, [])).toEqual(['f', 'd']);
  });

  test('excludes processors already in fxChain', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      f: makeNode('f', 'filter'),
      d: makeNode('d', 'delay'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'f'),
      e2: makeEdge('e2', 'f', 'd'),
      e3: makeEdge('e3', 'd', 'ws'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, ['f'])).toEqual(['d']);
  });

  test('handles branching graph', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      f: makeNode('f', 'filter'),
      d: makeNode('d', 'delay'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'f'),
      e2: makeEdge('e2', 'src', 'd'),
      e3: makeEdge('e3', 'f', 'ws'),
      e4: makeEdge('e4', 'd', 'ws'),
    };
    const result = getSuggestedProcessorIds('src', 'ws', nodes, edges, []);
    expect(result).toContain('f');
    expect(result).toContain('d');
    expect(result).toHaveLength(2);
  });

  test('handles circular graph without infinite loop', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      f: makeNode('f', 'filter'),
      d: makeNode('d', 'delay'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'f'),
      e2: makeEdge('e2', 'f', 'd'),
      e3: makeEdge('e3', 'd', 'f'),
      e4: makeEdge('e4', 'd', 'ws'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, [])).toEqual(['f', 'd']);
  });

  test('returns empty when no source or workstation', () => {
    expect(getSuggestedProcessorIds(undefined, 'ws', {}, {}, [])).toEqual([]);
    expect(getSuggestedProcessorIds('src', undefined, {}, {}, [])).toEqual([]);
  });

  test('traverses through non-processor nodes', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      u: makeNode('u', 'workstation'),
      f: makeNode('f', 'filter'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'u'),
      e2: makeEdge('e2', 'u', 'f'),
      e3: makeEdge('e3', 'f', 'ws'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, [])).toEqual(['f']);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
npx vitest run apps/client/src/lib/__tests__/fxChainSuggestions.test.ts
```

Expected output: all 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/lib/__tests__/fxChainSuggestions.test.ts
git commit -m "$(cat <<'EOF'
test: add unit tests for FX chain suggestion BFS

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add CSS class for suggested slots

**Files:**
- Modify: `apps/client/src/index.css:4616` (after `.hayashi-daw-fx-slot-empty:hover`)

- [ ] **Step 1: Insert CSS class**

Find the block around line 4612-4622:

```css
  .hayashi-daw-fx-row { ... }
  .hayashi-daw-fx-slot { ... }
  .hayashi-daw-fx-slot:hover { ... }
  .hayashi-daw-fx-slot-empty { ... }
  .hayashi-daw-fx-slot-empty:hover { ... }
  .hayashi-daw-fx-kind { ... }
```

Insert after `.hayashi-daw-fx-slot-empty:hover` (line 4616):

```css
  .hayashi-daw-fx-slot-suggested {
    width: 72px;
    height: 40px;
    background: #f5f0e8;
    border: 1px solid #d8cdb8;
    border-radius: 4px;
    padding: 3px 4px;
    display: flex;
    flex-direction: column;
    opacity: 0.45;
    cursor: pointer;
    transition: opacity 0.15s ease, border-color 0.15s ease;
  }
  .hayashi-daw-fx-slot-suggested:hover {
    opacity: 0.75;
    border-color: #b0a890;
  }
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/index.css
git commit -m "$(cat <<'EOF'
style: add CSS class for suggested FX chain slots

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Integrate suggestions into `TrackFxChain.tsx`

**Files:**
- Modify: `apps/client/src/components/TrackFxChain.tsx`

- [ ] **Step 1: Update imports**

Replace the top of the file (lines 1-4):

```typescript
import { useCallback, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { ArrowRight, Plus } from 'lucide-react';
import { getSuggestedProcessorIds } from '@/lib/fxChainSuggestions';
```

- [ ] **Step 2: Add store selectors and suggestion memoization**

After the existing `useProjectStore` selectors (around line 63-66), add:

```typescript
  const edges = useProjectStore((s) => s.edges);
  const tracks = useProjectStore((s) => s.tracks);
  const track = tracks[trackId];

  const suggestedIds = useMemo(
    () => getSuggestedProcessorIds(track?.sourceNodeId, track?.workstationNodeId, nodes, edges, fxChain),
    [track?.sourceNodeId, track?.workstationNodeId, nodes, edges, fxChain]
  );
```

- [ ] **Step 3: Add suggestion click handler**

After `handleRemove` (around line 92), add:

```typescript
  const handleAddSuggestion = useCallback(
    (nodeId: string) => {
      if (fxChain.includes(nodeId)) return;
      updateTrackFxChain(trackId, [...fxChain, nodeId]);
    },
    [fxChain, trackId, updateTrackFxChain]
  );
```

- [ ] **Step 4: Render suggested slots before the empty dropzone**

Insert the following JSX immediately before the `{/* Empty slot (drop target) */}` comment (around line 179):

```jsx
      {/* Suggested slots */}
      {suggestedIds.map((nodeId) => {
        const node = nodes[nodeId];
        if (!node) return null;
        const color = FX_KIND_COLORS[node.kind] ?? '#ed922f';
        const label = FX_KIND_LABELS[node.kind] ?? node.kind.slice(0, 3).toUpperCase();
        return (
          <div
            key={`suggested-${nodeId}`}
            className="hayashi-daw-fx-slot-suggested"
            onClick={() => handleAddSuggestion(nodeId)}
            title={`Click to add ${node.kind}`}
            style={{ display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span className="hayashi-daw-fx-kind" style={{ color }}>
                  {label}
                </span>
                <span className="hayashi-daw-fx-name">{nodeId.slice(0, 8)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, marginTop: 2 }}>
                <Plus size={10} style={{ color: '#8a7d6a' }} />
              </div>
            </div>
          </div>
        );
      })}
```

- [ ] **Step 5: Verify typecheck**

Run:
```bash
cd apps/client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/TrackFxChain.tsx
git commit -m "$(cat <<'EOF'
feat: integrate FX chain suggestion staging area into TrackFxChain

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Manual verification

**Files:** none (runtime check)

- [ ] **Step 1: Start dev server**

```bash
cd apps/client && npm run dev
```

- [ ] **Step 2: Reproduce test scenario**

1. Open a project in the browser
2. In the patch canvas, wire: `sampler` → `filter` → `delay` → `workstation`
3. Open the track FX chain for that workstation
4. Verify:
   - Two ghosted slots appear after the active chain: "F" and "D"
   - Hovering a slot raises opacity
   - Clicking "F" appends the filter to `fxChain`
   - Clicking "D" appends the delay
   - After adding, the ghosted slots disappear (because they are now in the active chain)
   - The manual `+` dropzone still accepts drag-and-dropped nodes

- [ ] **Step 3: Commit if any fixes needed**

If any issues found during verification, fix them in the relevant files and commit with a descriptive message. Otherwise, no extra commit.

---

## Spec Coverage Check

| Spec Requirement | Implementing Task |
|------------------|-------------------|
| BFS from `sourceNodeId` | Task 2 + Task 5 |
| Traverse edges where target is processor | Task 2 (BFS utility) |
| Stop at `workstationNodeId` | Task 2 (BFS utility) |
| Exclude IDs already in `fxChain` | Task 2 (BFS utility) |
| Memoize against `nodes`, `edges`, `sourceNodeId`, `workstationNodeId`, `fxChain` | Task 5 (`useMemo`) |
| Ghosted suggestion slots (opacity 0.45, hover 0.75) | Task 4 (CSS) + Task 5 (JSX) |
| Click appends to active chain | Task 5 (`handleAddSuggestion`) |
| Manual `+` dropzone remains | Task 5 (preserved existing JSX) |
| Circular graph safety | Task 3 (test) |
| Branching graph | Task 3 (test) |
| Traverses through non-processor nodes | Task 3 (test) |
| No store schema changes | Confirmed — only uses existing fields |

---

## Placeholder Scan

No placeholders found. Every step contains exact file paths, exact code, exact commands, and expected outcomes.

---

## Type Consistency Check

- `isProcessorNode(kind: NodeKind): boolean` — used in `registry.ts` (defined) and `fxChainSuggestions.ts` (imported)
- `getSuggestedProcessorIds(sourceNodeId, workstationNodeId, nodes, edges, fxChain)` — used in `fxChainSuggestions.ts` (defined) and `TrackFxChain.tsx` (imported)
- All types (`PatchNode`, `PatchEdge`, `NodeKind`) referenced match existing definitions in `apps/client/src/types/project.ts` and `apps/client/src/nodes/registry.ts`

No type mismatches or naming drift detected.
