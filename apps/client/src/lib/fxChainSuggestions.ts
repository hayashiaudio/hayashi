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
  if (!nodes[sourceNodeId]) return [];

  const existing = new Set(fxChain);
  const visited = new Set<string>();
  const results: string[] = [];
  const queue: string[] = [sourceNodeId];
  visited.add(sourceNodeId);

  // Build adjacency list for audio edges only
  const adjacency = new Map<string, string[]>();
  for (const edge of Object.values(edges)) {
    if (edge.signalType !== 'audio') continue;
    const list = adjacency.get(edge.sourceNodeId) ?? [];
    list.push(edge.targetNodeId);
    adjacency.set(edge.sourceNodeId, list);
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const targets = adjacency.get(current) ?? [];
    for (const targetId of targets) {
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
