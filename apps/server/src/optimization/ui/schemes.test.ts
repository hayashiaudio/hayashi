import { describe, expect, it } from 'vitest';
import { getOptimizationArchitecture } from '../category-registry.js';
import { buildDelayEchoUiScheme, buildParametricEqUiScheme, buildReverbUiScheme, buildSynthUiScheme } from './schemes.js';

describe('buildParametricEqUiScheme', () => {
  it('builds a valid color-fx based UI scheme for EQ architectures', () => {
    const architecture = getOptimizationArchitecture('parametric_eq', 'eq_3band_musical');
    const ui = buildParametricEqUiScheme({
      pluginTitle: 'Studio Tone EQ',
      pluginSubtitle: 'Broad musical shaping for buses',
      architecture,
    });

    expect(ui.uiFamily).toBe('color_fx');
    expect(ui.uiStyle).toBe('minimal_precision');
    expect(ui.visualizers).toEqual([{ type: 'filter_curve', placement: 'center' }]);
    expect(ui.meters).toEqual(['input', 'output']);
    expect(ui.heroControls).toContain('low');
    expect(ui.heroControls).toContain('mid');
    expect(ui.sections.map((section) => section.id)).toEqual(['tone', 'surgical', 'output']);
    expect(ui.sections.find((section) => section.id === 'tone')?.controls).toEqual(['low', 'mid', 'high']);
    expect(ui.sections.find((section) => section.id === 'surgical')?.controls).toEqual(['presence']);
    expect(ui.sections.find((section) => section.id === 'output')?.controls).toEqual(['trim']);
  });
});

describe('buildSynthUiScheme', () => {
  it('builds an instrument-modern UI scheme for synth architectures', () => {
    const architecture = getOptimizationArchitecture('synth', 'stereo_lead');
    const ui = buildSynthUiScheme({
      pluginTitle: 'Stereo Lead',
      pluginSubtitle: 'Expressive solo synth',
      architecture,
    });

    expect(ui.uiFamily).toBe('instrument_modern');
    expect(ui.uiStyle).toBe('modern_bold');
    expect(ui.meters).toEqual(['output']);
    expect(ui.visualizers[0]).toEqual({ type: 'envelope', placement: 'center' });
    expect(ui.sections.map((section) => section.id)).toEqual(['tone', 'motion']);
  });
});

describe('buildReverbUiScheme', () => {
  it('builds a space-fx UI scheme for reverb architectures', () => {
    const architecture = getOptimizationArchitecture('reverb_space', 'hall_bloom');
    const ui = buildReverbUiScheme({
      pluginTitle: 'Hall Bloom',
      pluginSubtitle: 'Large cinematic reverb',
      architecture,
    });

    expect(ui.uiFamily).toBe('space_fx');
    expect(ui.uiStyle).toBe('soft_ambient');
    expect(ui.meters).toEqual(['input', 'output', 'width']);
    expect(ui.visualizers[0]).toEqual({ type: 'stereo_field', placement: 'header' });
    expect(ui.visualizers[1]).toEqual({ type: 'decay_meter', placement: 'center' });
    expect(ui.sections.map((section) => section.id)).toEqual(['main', 'texture']);
  });
});

describe('buildDelayEchoUiScheme', () => {
  it('builds a color-fx UI scheme for delay architectures', () => {
    const architecture = getOptimizationArchitecture('delay_echo', 'tempo_echo');
    const ui = buildDelayEchoUiScheme({
      pluginTitle: 'Tempo Echo',
      pluginSubtitle: 'Rhythmic delay',
      architecture,
    });

    expect(ui.uiFamily).toBe('color_fx');
    expect(ui.uiStyle).toBe('boutique_hardware');
    expect(ui.visualizers[0]).toEqual({ type: 'macro_orb', placement: 'center' });
    expect(ui.sections.map((section) => section.id)).toEqual(['main', 'spread']);
  });
});
