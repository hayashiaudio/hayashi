/**
 * Generates DPF (DISTRHO Plugin Framework) wrapper code for Hayashi plugins.
 *
 * Output:
 *   - dpf_plugin.cpp  — DPF Plugin class wrapping Faust DSP
 *   - dpf_ui.cpp      — DPF UI class spawning Elements window
 *   - Makefile        — DPF build Makefile
 */

import type { MacroControl } from './ui-codegen.js';
import type { BuildPlatform } from '../build/targets.js';

export interface DpfOutput {
  pluginSource: string;
  uiSource: string;
  pluginInfoHeader: string;
  makefile: string;
}

function sanitizeCppId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function cppFloat(value: number | undefined, fallback = 0): string {
  const numeric = Number.isFinite(value) ? Number(value) : fallback;
  if (Number.isInteger(numeric)) return `${numeric}.0f`;
  return `${numeric}f`;
}

export function generateDpfWrapper(
  pluginName: string,
  pluginId: string,
  pluginVersion: string,
  macros: MacroControl[],
  numInputs: number,
  numOutputs: number,
  format: 'vst3' | 'clap',
  options: {
    includeUi: boolean;
    platform: BuildPlatform;
  }
): DpfOutput {
  const safeName = sanitizeCppId(pluginName);
  const paramCount = macros.length;
  const includeUi = options.includeUi;
  const pluginUri = `https://tryhayashi.com/plugins/${pluginId}/${pluginVersion}`;
  const clapId = `com.tryhayashi.${safeName.toLowerCase()}`;
  const pluginInfoHeader = [
    '#ifndef DISTRHO_PLUGIN_INFO_H_INCLUDED',
    '#define DISTRHO_PLUGIN_INFO_H_INCLUDED',
    '',
    `#define DISTRHO_PLUGIN_BRAND "Hayashi"`,
    `#define DISTRHO_PLUGIN_NAME "${pluginName.replace(/"/g, '\\"')}"`,
    `#define DISTRHO_PLUGIN_URI "${pluginUri}"`,
    `#define DISTRHO_PLUGIN_CLAP_ID "${clapId}"`,
    `#define DISTRHO_PLUGIN_HAS_UI ${includeUi ? '1' : '0'}`,
    `#define DISTRHO_PLUGIN_IS_RT_SAFE 1`,
    `#define DISTRHO_PLUGIN_NUM_INPUTS ${numInputs}`,
    `#define DISTRHO_PLUGIN_NUM_OUTPUTS ${numOutputs}`,
    `#define DISTRHO_PLUGIN_WANT_STATE 0`,
    '#endif',
    '',
  ].join('\n');

  // ── DPF Plugin ──────────────────────────────────────────────────────
  const pluginLines: string[] = [];
  pluginLines.push(`#include <faust/dsp/dsp.h>`);
  pluginLines.push(`#include <faust/gui/UI.h>`);
  pluginLines.push(`#include <faust/gui/meta.h>`);
  pluginLines.push(`#include "DistrhoPlugin.hpp"`);
  pluginLines.push(`#include "HayashiDSP.h"`);
  pluginLines.push(`#include <cstring>`);
  pluginLines.push(`#include <vector>`);
  pluginLines.push(`#include <string>`);
  pluginLines.push(``);
  pluginLines.push(`START_NAMESPACE_DISTRHO`);
  pluginLines.push(``);
  pluginLines.push(`class ${safeName}Plugin : public Plugin {`);
  pluginLines.push(`public:`);
  pluginLines.push(`    ${safeName}Plugin()`);
  pluginLines.push(`        : Plugin(kParamCount, 0, 0)`);
  pluginLines.push(`    {`);
  pluginLines.push(`        dsp.init(44100);`);
  pluginLines.push(`        dsp.buildUserInterface(&collector);`);
  pluginLines.push(`        // Map collected zones to parameter indices`);
  pluginLines.push(`        uint32_t idx = 0;`);
  pluginLines.push(`        for (auto& e : collector.entries) {`);
  pluginLines.push(`            if (idx < kParamCount) {`);
  pluginLines.push(`                paramZones[idx] = e.zone;`);
  pluginLines.push(`                fParams[idx] = e.initial;`);
  pluginLines.push(`                idx++;`);
  pluginLines.push(`            }`);
  pluginLines.push(`        }`);
  pluginLines.push(`    }`);
  pluginLines.push(``);

  // Metadata
  pluginLines.push(`    const char* getLabel() const override { return "${safeName}"; }`);
  pluginLines.push(`    const char* getDescription() const override { return "AI-generated Hayashi plugin"; }`);
  pluginLines.push(`    const char* getMaker() const override { return "Hayashi"; }`);
  pluginLines.push(`    const char* getHomePage() const override { return "https://hayashi.com"; }`);
  pluginLines.push(`    const char* getLicense() const override { return "MIT"; }`);
  pluginLines.push(`    uint32_t getVersion() const override { return d_version(1, 0, 0); }`);
  pluginLines.push(`    int64_t getUniqueId() const override { return ${crc32Id(pluginId)}; }`);
  pluginLines.push(``);

  // Audio ports
  pluginLines.push(`    void initAudioPort(bool input, uint32_t index, AudioPort& port) override {`);
  pluginLines.push(`        port.groupId = kPortGroupStereo;`);
  pluginLines.push(`        Plugin::initAudioPort(input, index, port);`);
  pluginLines.push(`    }`);
  pluginLines.push(``);

  // Parameters
  pluginLines.push(`    void initParameter(uint32_t index, Parameter& parameter) override {`);
  for (let i = 0; i < macros.length; i++) {
    const m = macros[i];
    const sym = sanitizeCppId(m.id);
    pluginLines.push(`        if (index == ${i}) {`);
    pluginLines.push(`            parameter.hints = kParameterIsAutomatable;`);
    pluginLines.push(`            parameter.name = "${m.label.replace(/"/g, '\\"')}";`);
    pluginLines.push(`            parameter.symbol = "${sym}";`);
    pluginLines.push(`            parameter.ranges.min = ${cppFloat(m.min)};`);
    pluginLines.push(`            parameter.ranges.max = ${cppFloat(m.max, 1)};`);
    pluginLines.push(`            parameter.ranges.def = ${cppFloat(m.default, m.min)};`);
    pluginLines.push(`            return;`);
    pluginLines.push(`        }`);
  }
  pluginLines.push(`    }`);
  pluginLines.push(``);

  pluginLines.push(`    float getParameterValue(uint32_t index) const override {`);
  pluginLines.push(`        return (index < kParamCount) ? fParams[index] : 0.0f;`);
  pluginLines.push(`    }`);
  pluginLines.push(``);

  pluginLines.push(`    void setParameterValue(uint32_t index, float value) override {`);
  pluginLines.push(`        if (index >= kParamCount) return;`);
  pluginLines.push(`        fParams[index] = value;`);
  pluginLines.push(`        if (paramZones[index]) *paramZones[index] = static_cast<double>(value);`);
  pluginLines.push(`    }`);
  pluginLines.push(``);

  // State
  // Activation
  pluginLines.push(`    void activate() override {`);
  pluginLines.push(`        dsp.init(getSampleRate());`);
  pluginLines.push(`    }`);
  pluginLines.push(``);

  // Process
  pluginLines.push(`    void run(const float** inputs, float** outputs, uint32_t frames) override {`);
  pluginLines.push(`        dsp.compute(frames, const_cast<float**>(inputs), outputs);`);
  pluginLines.push(`    }`);
  pluginLines.push(``);

  // Private
  pluginLines.push(`private:`);
  pluginLines.push(`    static constexpr uint32_t kParamCount = ${paramCount};`);
  pluginLines.push(``);
  pluginLines.push(`    HayashiDSP dsp;`);
  pluginLines.push(`    float fParams[kParamCount] = {};`);
  pluginLines.push(`    FAUSTFLOAT* paramZones[kParamCount] = {};`);
  pluginLines.push(``);
  pluginLines.push(`    struct Entry { std::string label; FAUSTFLOAT* zone; float initial; };`);
  pluginLines.push(`    struct ZoneCollector : public UI {`);
  pluginLines.push(`        std::vector<Entry> entries;`);
  pluginLines.push(`        void openTabBox(const char*) override {}`);
  pluginLines.push(`        void openHorizontalBox(const char*) override {}`);
  pluginLines.push(`        void openVerticalBox(const char*) override {}`);
  pluginLines.push(`        void closeBox() override {}`);
  pluginLines.push(`        void addButton(const char* label, FAUSTFLOAT* zone) override {`);
  pluginLines.push(`            entries.push_back({label, zone, 0.0f});`);
  pluginLines.push(`        }`);
  pluginLines.push(`        void addCheckButton(const char* label, FAUSTFLOAT* zone) override {`);
  pluginLines.push(`            entries.push_back({label, zone, 0.0f});`);
  pluginLines.push(`        }`);
  pluginLines.push(`        void addVerticalSlider(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init, FAUSTFLOAT, FAUSTFLOAT, FAUSTFLOAT) override {`);
  pluginLines.push(`            entries.push_back({label, zone, static_cast<float>(init)});`);
  pluginLines.push(`        }`);
  pluginLines.push(`        void addHorizontalSlider(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init, FAUSTFLOAT, FAUSTFLOAT, FAUSTFLOAT) override {`);
  pluginLines.push(`            entries.push_back({label, zone, static_cast<float>(init)});`);
  pluginLines.push(`        }`);
  pluginLines.push(`        void addNumEntry(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init, FAUSTFLOAT, FAUSTFLOAT, FAUSTFLOAT) override {`);
  pluginLines.push(`            entries.push_back({label, zone, static_cast<float>(init)});`);
  pluginLines.push(`        }`);
  pluginLines.push(`        void addHorizontalBargraph(const char*, FAUSTFLOAT*, FAUSTFLOAT, FAUSTFLOAT) override {}`);
  pluginLines.push(`        void addVerticalBargraph(const char*, FAUSTFLOAT*, FAUSTFLOAT, FAUSTFLOAT) override {}`);
  pluginLines.push(`        void addSoundfile(const char*, const char*, Soundfile**) override {}`);
  pluginLines.push(`        void declare(FAUSTFLOAT*, const char*, const char*) override {}`);
  pluginLines.push(`    };`);
  pluginLines.push(`    ZoneCollector collector;`);
  pluginLines.push(``);
  pluginLines.push(`    DISTRHO_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(${safeName}Plugin)`);
  pluginLines.push(`};`);
  pluginLines.push(``);
  pluginLines.push(`Plugin* createPlugin() {`);
  pluginLines.push(`    return new ${safeName}Plugin();`);
  pluginLines.push(`}`);
  pluginLines.push(``);
  pluginLines.push(`END_NAMESPACE_DISTRHO`);

  // ── DPF UI ──────────────────────────────────────────────────────────
  const uiLines: string[] = [];
  if (includeUi) {
    uiLines.push(`#include "plugin_ui.h"`);
    uiLines.push(`#include "DistrhoUI.hpp"`);
    uiLines.push(`#include <thread>`);
    uiLines.push(`#include <atomic>`);
    uiLines.push(`#include <memory>`);
    uiLines.push(`#include <cstring>`);
    uiLines.push(``);
    uiLines.push(`START_NAMESPACE_DISTRHO`);
    uiLines.push(``);
    uiLines.push(`class ${safeName}UI : public UI {`);
    uiLines.push(`public:`);
    uiLines.push(`    ${safeName}UI()`);
    uiLines.push(`        : UI(800, 600)`);
    uiLines.push(`    {`);
    uiLines.push(`        std::memset(fShadowZones, 0, sizeof(fShadowZones));`);
    uiLines.push(`        startElementsWindow();`);
    uiLines.push(`    }`);
    uiLines.push(``);
    uiLines.push(`    ~${safeName}UI() {`);
    uiLines.push(`        stopElementsWindow();`);
    uiLines.push(`    }`);
    uiLines.push(``);
    uiLines.push(`protected:`);
    uiLines.push(`    void parameterChanged(uint32_t index, float value) override {`);
    uiLines.push(`        if (index >= kParamCount) return;`);
    uiLines.push(`        fShadowZones[index] = static_cast<FAUSTFLOAT>(value);`);
    uiLines.push(`        auto* ptr = fViewPtr.load();`);
    uiLines.push(`        if (ptr) {`);
    uiLines.push(`            ptr->post([this]() {`);
    uiLines.push(`                if (fUi) fUi->syncUiToDSP(*fViewPtr.load());`);
    uiLines.push(`            });`);
    uiLines.push(`        }`);
    uiLines.push(`    }`);
    uiLines.push(``);
    uiLines.push(`    void onDisplay() override {`);
    uiLines.push(`        // Elements draws into its own view; keep the DPF host surface empty.`);
    uiLines.push(`    }`);
    uiLines.push(``);
    uiLines.push(`private:`);
    uiLines.push(`    void startElementsWindow() {`);
    uiLines.push(`        if (fRunning) return;`);
    uiLines.push(`        fRunning = true;`);
  uiLines.push(`        fUiThread = std::thread([this]() {`);
  uiLines.push(`            try {`);
  uiLines.push(`                cycfi::elements::app _app("${pluginName.replace(/"/g, '\\"')}");`);
  uiLines.push(`                cycfi::elements::window _win(_app.name());`);
  uiLines.push(`                _win.on_close = [&_app]() { _app.stop(); };`);
  uiLines.push(`                cycfi::elements::view view_(_win);`);
  uiLines.push(`                fViewPtr = &view_;`);
  uiLines.push(``);
  uiLines.push(`                fUi = std::make_unique<HayashiPluginUi>();`);
  uiLines.push(`                fUi->init(44100);`);
  uiLines.push(``);
  uiLines.push(`                // Point zones to shadow values`);
  uiLines.push(`                for (size_t i = 0; i < fUi->params.size() && i < kParamCount; ++i) {`);
  uiLines.push(`                    fUi->params[i].zone = &fShadowZones[i];`);
  uiLines.push(`                }`);
  uiLines.push(``);
  uiLines.push(`                // Parameter change callback → host`);
  uiLines.push(`                fUi->onParamChange = [this](const std::string& id, double value) {`);
  uiLines.push(`                    for (uint32_t i = 0; i < kParamCount; ++i) {`);
  uiLines.push(`                        if (fUi->params[i].id == id) {`);
  uiLines.push(`                            setParameterValue(i, static_cast<float>(value));`);
  uiLines.push(`                            break;`);
  uiLines.push(`                        }`);
  uiLines.push(`                    }`);
  uiLines.push(`                };`);
  uiLines.push(``);
  uiLines.push(`                view_.content(fUi->make_ui());`);
  uiLines.push(`                _app.run();`);
  uiLines.push(`            } catch (...) {`);
  uiLines.push(`                // Elements UI failed to open — graceful fallback`);
  uiLines.push(`            }`);
  uiLines.push(`            fRunning = false;`);
  uiLines.push(`            fViewPtr = nullptr;`);
  uiLines.push(`        });`);
  uiLines.push(`    }`);
  uiLines.push(``);
  uiLines.push(`    void stopElementsWindow() {`);
  uiLines.push(`        fRunning = false;`);
  uiLines.push(`        if (fUiThread.joinable()) {`);
  uiLines.push(`            fUiThread.join();`);
  uiLines.push(`        }`);
  uiLines.push(`        fUi.reset();`);
  uiLines.push(`        fViewPtr = nullptr;`);
  uiLines.push(`    }`);
  uiLines.push(``);
  uiLines.push(`private:`);
  uiLines.push(`    static constexpr uint32_t kParamCount = ${paramCount};`);
  uiLines.push(`    FAUSTFLOAT fShadowZones[kParamCount] = {};`);
  uiLines.push(`    std::unique_ptr<HayashiPluginUi> fUi;`);
  uiLines.push(`    std::atomic<bool> fRunning{false};`);
  uiLines.push(`    std::thread fUiThread;`);
  uiLines.push(`    std::atomic<cycfi::elements::view*> fViewPtr{nullptr};`);
  uiLines.push(``);
  uiLines.push(`    DISTRHO_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(${safeName}UI)`);
  uiLines.push(`};`);
  uiLines.push(``);
  uiLines.push(`UI* createUI() {`);
  uiLines.push(`    return new ${safeName}UI();`);
  uiLines.push(`}`);
    uiLines.push(``);
    uiLines.push(`END_NAMESPACE_DISTRHO`);
  }

  // ── Makefile ────────────────────────────────────────────────────────
  const makefile = [
    '#!/usr/bin/make -f',
    '# Makefile for Hayashi DPF Plugin',
    '',
    `NAME = ${safeName}`,
    '',
    'FILES_DSP = dpf_plugin.cpp',
    `FILES_UI  = ${includeUi ? 'dpf_ui.cpp plugin_ui.cpp' : ''}`,
    '',
    'DPF_PATH ?= /usr/local/share/dpf',
    'BIN_DIR ?= bin',
    'FAUST_INCLUDE_PATH ?= /usr/share/faust',
    'include $(DPF_PATH)/Makefile.plugins.mk',
    '',
    '# Extra include / link flags for Elements + Faust',
    includeUi
      ? 'BUILD_CXX_FLAGS += -std=c++20 -I/usr/local/include -I/usr/local/include/elements -I$(FAUST_INCLUDE_PATH) $(shell pkg-config --cflags gtk+-3.0 cairo fontconfig freetype2)'
      : 'BUILD_CXX_FLAGS += -std=c++20 -I$(FAUST_INCLUDE_PATH)',
    includeUi
      ? 'LINK_FLAGS += -L/usr/local/lib -lelements $(shell pkg-config --libs gtk+-3.0 cairo fontconfig freetype2) -lpthread'
      : 'LINK_FLAGS += -lpthread',
    '',
    `TARGETS += ${format}`,
    '',
    'all: $(TARGETS)',
    '',
  ].join('\n');

  return {
    pluginSource: pluginLines.join('\n'),
    uiSource: uiLines.join('\n'),
    pluginInfoHeader,
    makefile,
  };
}

function crc32Id(str: string): number {
  // Simple deterministic hash for DPF unique ID
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}
