/**
 * Tests for the DPF code generator.
 */

import { describe, it, expect } from 'vitest';
import { generateDpfWrapper } from './dpf-codegen.js';

describe('generateDpfWrapper', () => {
  const mockMacros = [
    { id: 'brightness', label: 'Brightness', min: 0, max: 1, default: 0.5 },
    { id: 'drive', label: 'Drive', min: 0, max: 1, default: 0.0 },
  ];
  const withUi = { includeUi: true as const, platform: 'linux' as const };

  it('generates plugin source with correct parameter count', () => {
    const result = generateDpfWrapper('My Plugin', 'com.test.plugin', '1.0.0', mockMacros, 2, 2, 'vst3', withUi);
    expect(result.pluginSource).toContain('static constexpr uint32_t kParamCount = 2');
    expect(result.pluginSource).toContain('class My_PluginPlugin : public Plugin');
  });

  it('generates parameter registrations', () => {
    const result = generateDpfWrapper('My Plugin', 'com.test.plugin', '1.0.0', mockMacros, 2, 2, 'vst3', withUi);
    expect(result.pluginSource).toContain('parameter.name = "Brightness"');
    expect(result.pluginSource).toContain('parameter.symbol = "brightness"');
    expect(result.pluginSource).toContain('parameter.ranges.min = 0.0f');
    expect(result.pluginSource).toContain('parameter.ranges.max = 1.0f');
  });

  it('generates UI source with shadow zones', () => {
    const result = generateDpfWrapper('My Plugin', 'com.test.plugin', '1.0.0', mockMacros, 2, 2, 'vst3', withUi);
    expect(result.uiSource).toContain('class My_PluginUI : public UI');
    expect(result.uiSource).toContain('FAUSTFLOAT fShadowZones[kParamCount]');
    expect(result.uiSource).toContain('onParamChange');
    expect(result.uiSource).toContain('cycfi::elements::app _app(');
    expect(result.uiSource).toContain('cycfi::elements::window _win(');
  });

  it('generates a valid Makefile', () => {
    const result = generateDpfWrapper('My Plugin', 'com.test.plugin', '1.0.0', mockMacros, 2, 2, 'vst3', withUi);
    expect(result.makefile).toContain('NAME = My_Plugin');
    expect(result.makefile).toContain('FILES_DSP = dpf_plugin.cpp');
    expect(result.makefile).toContain('FILES_UI  = dpf_ui.cpp plugin_ui.cpp');
    expect(result.makefile).toContain('DPF_PATH');
    expect(result.makefile).toContain('TARGETS += vst3');
    expect(result.makefile).not.toContain('TARGETS += clap');
  });

  it('generates a CLAP target through the same DPF path', () => {
    const result = generateDpfWrapper('My Plugin', 'com.test.plugin', '1.0.0', mockMacros, 2, 2, 'clap', withUi);
    expect(result.makefile).toContain('TARGETS += clap');
    expect(result.uiSource).toContain('class My_PluginUI : public UI');
  });

  it('adds ws2_32 on Windows with UI', () => {
    const win = { includeUi: true as const, platform: 'windows' as const };
    const result = generateDpfWrapper('My Plugin', 'com.test.plugin', '1.0.0', mockMacros, 2, 2, 'vst3', win);
    expect(result.makefile).toContain('-lws2_32');
  });

  it('does not add ws2_32 on Linux with UI', () => {
    const linux = { includeUi: true as const, platform: 'linux' as const };
    const result = generateDpfWrapper('My Plugin', 'com.test.plugin', '1.0.0', mockMacros, 2, 2, 'vst3', linux);
    expect(result.makefile).not.toContain('-lws2_32');
  });
});
