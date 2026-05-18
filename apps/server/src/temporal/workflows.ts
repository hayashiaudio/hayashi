import { proxyActivities } from '@temporalio/workflow';
import type { GeneratedFaustResult } from '../faust/generate.js';
import type * as activities from './activities.js';

const { generatePluginActivity, iteratePluginActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 1,
    nonRetryableErrorTypes: ['InvalidPluginSpecError', 'FaustCompileError'],
  },
});

const { exportBuildActivity, markBuildFailedActivity, markPluginFailedActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '4 hours',
  heartbeatTimeout: '5 minutes',
  retry: {
    maximumAttempts: 1,
  },
});

const { persistPluginActivity, persistIterationActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 1,
  },
});

interface GeneratePluginWorkflowInput {
  pluginId: string;
  ownerId: string;
  name: string;
  type: string;
  prompt: string;
}

interface IteratePluginWorkflowInput {
  pluginId: string;
  ownerId: string;
  instruction: string;
  previousCode: string;
  previousPrompts: string[];
  type: 'synth' | 'effect' | 'percussion';
  previousParams: { name: string; min: number; max: number }[];
  nextVersionNumber: number;
}

interface ExportBuildWorkflowInput {
  buildId: string;
}

export async function generatePluginWorkflow(input: GeneratePluginWorkflowInput): Promise<GeneratedFaustResult> {
  try {
    const generated = await generatePluginActivity(input);
    await persistPluginActivity(input, generated);
    return generated;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    await markPluginFailedActivity({ pluginId: input.pluginId, errorMessage: message });
    throw err;
  }
}

export async function iteratePluginWorkflow(input: IteratePluginWorkflowInput): Promise<GeneratedFaustResult> {
  try {
    const generated = await iteratePluginActivity(input);
    await persistIterationActivity(input, generated);
    return generated;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Iteration failed';
    await markPluginFailedActivity({ pluginId: input.pluginId, errorMessage: message });
    throw err;
  }
}

export async function exportBuildWorkflow(input: ExportBuildWorkflowInput): Promise<void> {
  try {
    await exportBuildActivity(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export build failed';
    await markBuildFailedActivity({ buildId: input.buildId, errorMessage: message });
    throw err;
  }
}
