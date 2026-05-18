import { Ajv2020 } from 'ajv/dist/2020.js';
import uiSpecSchema from './ui-spec.schema.json' with { type: 'json' };
import type { MacroControl, PluginSpec } from '../faust/spec-runtime.js';
import { getTemplateDefinition } from '../faust/template-registry.js';
import type { TemplateUiMetadata, UiFamily, UiSpec } from './types.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateUiSchema = ajv.compile(uiSpecSchema);

function fail(message: string): never {
  throw new Error(`Invalid plugin UI spec: ${message}`);
}

function subtitleForFamily(uiFamily: UiFamily, spec: PluginSpec): string {
  if (spec.description?.trim()) return spec.description.trim().slice(0, 96);

  switch (uiFamily) {
    case 'instrument_modern':
      return spec.kind === 'percussion' ? 'Performance-oriented percussion instrument' : 'Modern expressive instrument';
    case 'space_fx':
      return 'Spatial effect with macro-driven ambience';
    case 'motion_filter':
      return 'Animated filter effect with expressive tone shaping';
    case 'color_fx':
      return 'Character effect with mix-focused voicing';
  }
}

function normalizeUiMetadata(spec: PluginSpec): TemplateUiMetadata {
  const template = getTemplateDefinition(spec.voiceArchitecture);
  if (template?.ui) return template.ui;

  const controls = spec.macroControls.map((macro) => macro.id);
  return {
    uiFamily: spec.kind === 'effect' ? 'color_fx' : 'instrument_modern',
    preferredUiStyle: spec.kind === 'effect' ? 'minimal_precision' : 'modern_bold',
    heroControls: controls.slice(0, 3),
    defaultSections: [
      {
        id: 'main',
        label: 'Main',
        layout: 'row',
        controls: controls.slice(0, Math.min(5, controls.length)),
      },
    ],
    allowedVisualizers: spec.kind === 'effect' ? ['drive_meter', 'macro_orb'] : ['envelope', 'macro_orb'],
    defaultVisualizers: [
      { type: spec.kind === 'effect' ? 'drive_meter' : 'envelope', placement: 'center' },
    ],
    defaultMeters: ['output'],
    defaultLayoutHints: {
      density: 'comfortable',
      heroSize: 'large',
      sidebar: false,
    },
    themeTokens: {
      accent: spec.kind === 'effect' ? 'steel' : 'ember',
      surface: 'graphite',
      glow: 0.28,
    },
  };
}

export function buildUiSpecFromTemplate(spec: PluginSpec): UiSpec {
  const ui = normalizeUiMetadata(spec);
  const availableControls = new Set<MacroControl['id']>(spec.macroControls.map((macro) => macro.id));
  const heroControls = ui.heroControls.filter((control) => availableControls.has(control)).slice(0, 4);
  const sections = ui.defaultSections
    .map((section) => ({
      ...section,
      controls: section.controls.filter((control) => availableControls.has(control)),
    }))
    .filter((section) => section.controls.length > 0);

  const built: UiSpec = {
    schemaVersion: '1.0',
    uiFamily: ui.uiFamily,
    uiStyle: ui.preferredUiStyle,
    title: spec.name.slice(0, 64),
    subtitle: subtitleForFamily(ui.uiFamily, spec),
    heroControls: heroControls.length > 0 ? heroControls : Array.from(availableControls).slice(0, 3),
    sections: sections.length > 0
      ? sections
      : [{
          id: 'main',
          label: 'Main',
          layout: 'row',
          controls: Array.from(availableControls).slice(0, Math.min(5, availableControls.size)),
        }],
    visualizers: ui.defaultVisualizers.filter((visualizer) => ui.allowedVisualizers.includes(visualizer.type)),
    meters: ui.defaultMeters,
    layoutHints: ui.defaultLayoutHints,
    themeTokens: ui.themeTokens,
  };

  if (!validateUiSchema(built)) {
    const detail = validateUiSchema.errors?.map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('; ') ?? 'unknown error';
    fail(detail);
  }

  return built;
}
