import type { BillingSnapshot } from '@/types/billing';
import type { PatchNode } from '@/types/project';

export function countBillableNodes(nodes: Record<string, PatchNode>): number {
  return Object.values(nodes).filter((node) => node.kind !== 'output').length;
}

export function canAddNode(snapshot: BillingSnapshot | null, nodes: Record<string, PatchNode>, nextKind?: PatchNode['kind']) {
  if (nextKind === 'output') return { allowed: true, message: null };
  const limit = snapshot?.entitlements.activeNodeLimit;
  if (limit == null) return { allowed: true, message: null };
  const activeNodes = countBillableNodes(nodes);
  if (activeNodes < limit) return { allowed: true, message: null };
  return {
    allowed: false,
    message: `Free members can keep up to ${limit} active nodes. Upgrade to Hayashi Unlimited for unlimited patches.`,
  };
}
