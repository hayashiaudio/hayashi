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

export function canUploadSample(snapshot: BillingSnapshot | null, currentAssets: number) {
  const limit = snapshot?.entitlements.sampleAssetsLimit;
  if (limit == null) return { allowed: true, message: null };
  if (currentAssets < limit) return { allowed: true, message: null };
  return {
    allowed: false,
    message: `Free members can keep up to ${limit} sample assets. Upgrade to Hayashi Unlimited for unlimited samples.`,
  };
}

export function canUseMidiNode(snapshot: BillingSnapshot | null) {
  const allowed = snapshot?.entitlements.midiNodeAccess ?? false;
  if (allowed) return { allowed: true, message: null };
  return {
    allowed: false,
    message: 'MIDI Bridge is available with Hayashi Unlimited. Upgrade to connect hardware MIDI.',
  };
}
