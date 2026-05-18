/**
 * Tests for the Elements UI code generator.
 */

import { describe, it, expect } from 'vitest';
import { generateElementsUi } from './ui-codegen.js';

describe('generateElementsUi', () => {
  const mockUiSpec = {
    schemaVersion: '1.0',
    uiFamily: 'instrument_modern',
    uiStyle: 'boutique_hardware',
    title: 'Warm Analog Brass',
    subtitle: 'Modern expressive instrument',
    heroControls: ['brightness', 'body'],
    sections: [
      {
        id: 'main',
        label: 'Main',
        layout: 'row' as const,
        controls: ['brightness', 'body', 'drive'],
      },
      {
        id: 'shape',
        label: 'Shape',
        layout: 'row' as const,
        controls: ['punch', 'movement'],
      },
    ],
    visualizers: [],
    meters: ['output'],
    layoutHints: {
      density: 'comfortable' as const,
      heroSize: 'large' as const,
      sidebar: true,
    },
    themeTokens: {
      accent: 'ember',
      surface: 'obsidian',
      glow: 0.22,
    },
  };

  const mockMacros = [
    { id: 'brightness', label: 'Brightness', min: 0, max: 1, default: 0.5 },
    { id: 'body', label: 'Body', min: 0, max: 1, default: 0.3 },
    { id: 'drive', label: 'Drive', min: 0, max: 1, default: 0.0 },
    { id: 'punch', label: 'Punch', min: 0, max: 1, default: 0.6 },
    { id: 'movement', label: 'Movement', min: 0, max: 1, default: 0.4 },
  ];

  it('generates a header and source file', () => {
    const result = generateElementsUi(mockUiSpec, mockMacros);
    expect(result.header).toContain('#pragma once');
    expect(result.header).toContain('HayashiPluginUi');
    expect(result.header).toContain('#include <faust/dsp/dsp.h>');
    expect(result.header).toContain('#include <faust/gui/UI.h>');
    expect(result.header).toContain('#include <faust/gui/meta.h>');
    expect(result.source).toContain('#include "plugin_ui.h"');
  });

  it('includes the plugin title and subtitle', () => {
    const result = generateElementsUi(mockUiSpec, mockMacros);
    expect(result.source).toContain('Warm Analog Brass');
    expect(result.source).toContain('Modern expressive instrument');
  });

  it('creates section classes for each section', () => {
    const result = generateElementsUi(mockUiSpec, mockMacros);
    expect(result.source).toContain('Section_main');
    expect(result.source).toContain('Section_shape');
    expect(result.source).toContain('htile_composite');
  });

  it('uses dials for hero controls', () => {
    const result = generateElementsUi(mockUiSpec, mockMacros);
    expect(result.source).toContain('basic_knob<44>');
    expect(result.source).toContain('dial(');
  });

  it('binds slider on_change to parameter zones', () => {
    const result = generateElementsUi(mockUiSpec, mockMacros);
    expect(result.source).toContain('->on_change = [self, zone =');
    expect(result.source).toContain('*zone = static_cast<FAUSTFLOAT>(realVal)');
    expect(result.source).toContain('if (self->onParamChange) self->onParamChange(id, realVal)');
  });

  it('includes theme color constants', () => {
    const result = generateElementsUi(mockUiSpec, mockMacros);
    expect(result.source).toContain('accent_color');
    expect(result.source).toContain('surface_color');
  });

  it('generates Faust zone collector UI', () => {
    const result = generateElementsUi(mockUiSpec, mockMacros);
    expect(result.source).toContain('struct ZoneCollector : public UI');
    expect(result.source).toContain('void addVerticalSlider');
    expect(result.source).toContain('void addHorizontalSlider');
  });

  it('handles missing sections gracefully', () => {
    const emptySpec = { ...mockUiSpec, sections: [] };
    const result = generateElementsUi(emptySpec, []);
    expect(result.source).toContain('ControlPanel');
  });

  it('returns shared layer content from make_ui', () => {
    const result = generateElementsUi(mockUiSpec, mockMacros);
    expect(result.source).toContain('return share(layer(');
  });
});
