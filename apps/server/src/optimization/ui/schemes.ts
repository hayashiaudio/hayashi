import type { OptimizationArchitectureDefinition } from '../category-registry.js';
import { getControlSemanticGroup } from './semantic-controls.js';

export interface PlannedUiSection {
  id: string;
  label: string;
  layout: 'row' | 'column' | 'grid';
  controls: string[];
}

export interface PlannedUiScheme {
  schemaVersion: '1.0';
  uiFamily: 'instrument_modern' | 'space_fx' | 'motion_filter' | 'color_fx';
  uiStyle: 'minimal_precision' | 'boutique_hardware' | 'soft_ambient' | 'modern_bold';
  title: string;
  subtitle: string;
  heroControls: string[];
  sections: PlannedUiSection[];
  visualizers: Array<{ type: 'filter_curve' | 'stereo_field' | 'envelope' | 'decay_meter' | 'drive_meter' | 'macro_orb'; placement: 'header' | 'center' | 'sidebar' | 'footer' }>;
  meters: Array<'input' | 'output' | 'gain_reduction' | 'width'>;
  layoutHints: {
    density: 'compact' | 'comfortable' | 'spacious';
    heroSize: 'medium' | 'large';
    sidebar: boolean;
  };
  themeTokens: {
    accent: 'ice' | 'ember' | 'violet' | 'lime' | 'sunset' | 'steel';
    surface: 'smoke' | 'graphite' | 'mist' | 'obsidian';
    glow: number;
  };
}

function pickHeroControls(controlIds: string[]): string[] {
  const preferredOrder = ['midLow', 'midMid', 'sidePresence', 'width', 'low', 'mid', 'high', 'presence', 'air', 'weight', 'clarity', 'trim'];
  const heroes: string[] = [];
  for (const id of preferredOrder) {
    if (controlIds.includes(id) && heroes.length < 4) {
      heroes.push(id);
    }
  }
  if (heroes.length === 0) {
    return controlIds.slice(0, 4);
  }
  return heroes;
}

function uniqueControls(controlIds: string[]): string[] {
  return [...new Set(controlIds)];
}

export function buildParametricEqUiScheme(args: {
  pluginTitle: string;
  pluginSubtitle: string;
  architecture: OptimizationArchitectureDefinition;
}): PlannedUiScheme {
  const controls = uniqueControls(args.architecture.controlIds);
  const isMidSideSurface = controls.some((id) => id.startsWith('mid')) && controls.some((id) => id.startsWith('side'));
  const heroControls = pickHeroControls(controls);

  if (isMidSideSurface) {
    const midControls = controls.filter((id) => id.startsWith('mid'));
    const sideControls = controls.filter((id) => id.startsWith('side'));
    const spreadControls = controls.filter((id) => id === 'width');
    const outputControls = controls.filter((id) => id === 'trim');

    return {
      schemaVersion: '1.0',
      uiFamily: 'color_fx',
      uiStyle: 'minimal_precision',
      title: args.pluginTitle.slice(0, 64),
      subtitle: args.pluginSubtitle.slice(0, 96),
      heroControls: heroControls.length > 0 ? heroControls : [...midControls.slice(0, 2), ...sideControls.slice(0, 1), ...spreadControls.slice(0, 1)].slice(0, 4),
      sections: [
        { id: 'mid', label: 'Mid', layout: 'grid' as const, controls: midControls },
        { id: 'side', label: 'Side', layout: 'grid' as const, controls: sideControls },
        { id: 'spread', label: 'Spread', layout: 'row' as const, controls: spreadControls },
        { id: 'output', label: 'Output', layout: 'row' as const, controls: outputControls },
      ].filter((section) => section.controls.length > 0),
      visualizers: [
        { type: 'filter_curve', placement: 'center' },
        { type: 'stereo_field', placement: 'sidebar' },
      ],
      meters: ['input', 'output', 'width'],
      layoutHints: {
        density: 'comfortable',
        heroSize: 'large',
        sidebar: true,
      },
      themeTokens: {
        accent: 'steel',
        surface: 'graphite',
        glow: 0.24,
      },
    };
  }

  const toneControls = controls.filter((id) => ['low', 'mid', 'high', 'weight', 'clarity', 'color'].includes(id));
  const surgicalControls = controls.filter((id) => {
    const group = getControlSemanticGroup(id);
    return group === 'presence' || group === 'air' || group === 'surgical';
  });
  const outputControls = controls.filter((id) => {
    const group = getControlSemanticGroup(id);
    return group === 'trim' || group === 'output' || group === 'utility';
  });
  const spreadControls = controls.filter((id) => id === 'width');
  const hasSpread = spreadControls.length > 0;

  return {
    schemaVersion: '1.0',
    uiFamily: 'color_fx',
    uiStyle: 'minimal_precision',
    title: args.pluginTitle.slice(0, 64),
    subtitle: args.pluginSubtitle.slice(0, 96),
    heroControls,
    sections: [
      { id: 'tone', label: 'Tone', layout: 'row' as const, controls: toneControls.length > 0 ? toneControls : controls.slice(0, 3) },
      { id: 'surgical', label: 'Surgical', layout: 'row' as const, controls: surgicalControls.length > 0 ? surgicalControls : controls.slice(0, 2) },
      { id: 'spread', label: 'Spread', layout: 'row' as const, controls: spreadControls },
      { id: 'output', label: 'Output', layout: 'row' as const, controls: outputControls.length > 0 ? outputControls : ['trim'].filter((id) => controls.includes(id)) },
    ].filter((section) => section.controls.length > 0),
    visualizers: [
      { type: 'filter_curve', placement: 'center' },
      ...(hasSpread ? [{ type: 'stereo_field' as const, placement: 'sidebar' as const }] : []),
    ],
    meters: hasSpread ? ['input', 'output', 'width'] : ['input', 'output'],
    layoutHints: {
      density: 'comfortable',
      heroSize: 'large',
      sidebar: true,
    },
    themeTokens: {
      accent: 'steel',
      surface: 'graphite',
      glow: 0.24,
    },
  };
}

export function buildSynthUiScheme(args: {
  pluginTitle: string;
  pluginSubtitle: string;
  architecture: OptimizationArchitectureDefinition;
}): PlannedUiScheme {
  const controls = uniqueControls(args.architecture.controlIds);
  const heroControls = controls.slice(0, 4);

  const toneControls = controls.filter((id) => ['brightness', 'body', 'character'].includes(id));
  const motionControls = controls.filter((id) => ['movement', 'width'].includes(id));
  const performanceControls = controls.filter((id) => ['punch'].includes(id));

  return {
    schemaVersion: '1.0',
    uiFamily: 'instrument_modern',
    uiStyle: 'modern_bold',
    title: args.pluginTitle.slice(0, 64),
    subtitle: args.pluginSubtitle.slice(0, 96),
    heroControls,
    sections: [
      { id: 'tone', label: 'Tone', layout: 'row' as const, controls: toneControls.length > 0 ? toneControls : controls.slice(0, 3) },
      { id: 'motion', label: 'Motion', layout: 'row' as const, controls: motionControls },
      { id: 'performance', label: 'Performance', layout: 'row' as const, controls: performanceControls },
    ].filter((section) => section.controls.length > 0),
    visualizers: [
      { type: 'envelope', placement: 'center' },
      { type: 'macro_orb', placement: 'sidebar' },
    ],
    meters: ['output'],
    layoutHints: {
      density: 'comfortable',
      heroSize: 'large',
      sidebar: true,
    },
    themeTokens: {
      accent: 'ember',
      surface: 'obsidian',
      glow: 0.34,
    },
  };
}

export function buildReverbUiScheme(args: {
  pluginTitle: string;
  pluginSubtitle: string;
  architecture: OptimizationArchitectureDefinition;
}): PlannedUiScheme {
  const controls = uniqueControls(args.architecture.controlIds);
  const heroControls = controls.filter((id) => ['space', 'bloom', 'preDelay', 'movement'].includes(id)).slice(0, 4);
  const mainControls = controls.filter((id) => ['space', 'bloom', 'preDelay', 'movement'].includes(id));
  const textureControls = controls.filter((id) => ['diffusion', 'damping', 'feedbackTone', 'modDepth', 'modRate'].includes(id));

  return {
    schemaVersion: '1.0',
    uiFamily: 'space_fx',
    uiStyle: 'soft_ambient',
    title: args.pluginTitle.slice(0, 64),
    subtitle: args.pluginSubtitle.slice(0, 96),
    heroControls: heroControls.length > 0 ? heroControls : controls.slice(0, 4),
    sections: [
      { id: 'main', label: 'Main', layout: 'row' as const, controls: mainControls.length > 0 ? mainControls : controls.slice(0, 3) },
      { id: 'texture', label: 'Texture', layout: 'row' as const, controls: textureControls },
    ].filter((section) => section.controls.length > 0),
    visualizers: [
      { type: 'stereo_field', placement: 'header' },
      { type: 'decay_meter', placement: 'center' },
    ],
    meters: ['input', 'output', 'width'],
    layoutHints: {
      density: 'spacious',
      heroSize: 'large',
      sidebar: true,
    },
    themeTokens: {
      accent: 'ice',
      surface: 'mist',
      glow: 0.42,
    },
  };
}

export function buildDelayEchoUiScheme(args: {
  pluginTitle: string;
  pluginSubtitle: string;
  architecture: OptimizationArchitectureDefinition;
}): PlannedUiScheme {
  const controls = uniqueControls(args.architecture.controlIds);
  const heroControls = controls.filter((id) => ['space', 'character', 'movement', 'feedbackTone'].includes(id)).slice(0, 4);
  const mainControls = controls.filter((id) => ['space', 'character', 'movement', 'feedbackTone'].includes(id));
  const spreadControls = controls.filter((id) => ['width', 'modDepth', 'modRate', 'bloom'].includes(id));

  return {
    schemaVersion: '1.0',
    uiFamily: 'color_fx',
    uiStyle: 'boutique_hardware',
    title: args.pluginTitle.slice(0, 64),
    subtitle: args.pluginSubtitle.slice(0, 96),
    heroControls: heroControls.length > 0 ? heroControls : controls.slice(0, 4),
    sections: [
      { id: 'main', label: 'Main', layout: 'row' as const, controls: mainControls.length > 0 ? mainControls : controls.slice(0, 3) },
      { id: 'spread', label: 'Spread', layout: 'row' as const, controls: spreadControls },
    ].filter((section) => section.controls.length > 0),
    visualizers: [
      { type: 'macro_orb', placement: 'center' },
      { type: 'stereo_field', placement: 'sidebar' },
    ],
    meters: ['input', 'output'],
    layoutHints: {
      density: 'comfortable',
      heroSize: 'large',
      sidebar: true,
    },
    themeTokens: {
      accent: 'sunset',
      surface: 'graphite',
      glow: 0.26,
    },
  };
}
