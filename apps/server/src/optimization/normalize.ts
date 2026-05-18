import type { UiSpec } from '../ui/types.js';
import type { MacroControl, PluginParameter } from '../faust/spec-runtime.js';

/**
 * Stable upstream-to-downstream boundary for optimization-driven generation.
 *
 * Optimizers and category engines may change internally, but they must emit this
 * exact artifact shape so the existing Faust/UI/export pipeline can remain
 * unchanged for the MVP.
 */
export interface StableOptimizationArtifactContract {
  faustCode: string;
  parameterSchema: PluginParameter[];
  macroControls: MacroControl[];
  uiSpec: UiSpec;
  metadata: Record<string, unknown>;
}

export function normalizeOptimizationArtifacts(
  artifacts: StableOptimizationArtifactContract,
): StableOptimizationArtifactContract {
  return artifacts;
}
