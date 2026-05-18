/**
 * Generates C++ Elements UI code from a Hayashi ui_spec JSON object.
 *
 * Output:
 *   - plugin_ui.h   — UI class declaration
 *   - plugin_ui.cpp — UI implementation with Elements composition + Faust zone binding
 */

export interface CodeGenOutput {
  header: string;
  source: string;
}

export interface UiSpecCodegen {
  schemaVersion: string;
  uiFamily: string;
  uiStyle: string;
  title: string;
  subtitle: string;
  heroControls: string[];
  sections: Array<{
    id: string;
    label: string;
    layout: 'row' | 'column' | 'grid';
    controls: string[];
  }>;
  visualizers: Array<{ type: string; placement: string }>;
  meters: string[];
  layoutHints: {
    density: 'compact' | 'comfortable' | 'spacious';
    heroSize: 'medium' | 'large';
    sidebar: boolean;
  };
  themeTokens: {
    accent: string;
    surface: string;
    glow: number;
  };
}

export interface VisualizerConfig {
  type: string;
  placement: string;
}

export interface MeterConfig {
  type: string;
}

export interface MacroControl {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

function sanitizeCppId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function accentRgba(name: string): string {
  const map: Record<string, string> = {
    ice: '0.35f, 0.78f, 0.98f',
    ember: '1.0f, 0.55f, 0.38f',
    violet: '0.69f, 0.32f, 0.87f',
    lime: '0.8f, 1.0f, 0.0f',
    sunset: '1.0f, 0.58f, 0.0f',
    steel: '0.56f, 0.56f, 0.58f',
  };
  return map[name] ?? '1.0f, 0.55f, 0.38f';
}

function surfaceRgba(name: string): string {
  const map: Record<string, string> = {
    smoke: '0.102f, 0.102f, 0.102f',
    graphite: '0.067f, 0.067f, 0.067f',
    mist: '0.11f, 0.145f, 0.125f',
    obsidian: '0.039f, 0.039f, 0.039f',
  };
  return map[name] ?? '0.067f, 0.067f, 0.067f';
}

export function generateElementsUi(
  uiSpec: UiSpecCodegen,
  macros: MacroControl[]
): CodeGenOutput {
  const className = 'HayashiPluginUi';
  const dspClassName = 'HayashiDSP';
  const paramMap = new Map(macros.map((m) => [m.id, m]));
  const sliderLabel = (value: string) => value.replace(/"/g, '\\"');

  const header = [
    '#pragma once',
    '#include <elements.hpp>',
    '#include <faust/dsp/dsp.h>',
    '#include <faust/gui/UI.h>',
    '#include <faust/gui/meta.h>',
    '#include <memory>',
    '#include <vector>',
    '#include <string>',
    '#include <unordered_map>',
    '#include <algorithm>',
    '#include <functional>',
    `#include "${dspClassName}.h"`,
    '',
    'struct ParamZone {',
    '    std::string id;',
    '    std::string label;',
    '    FAUSTFLOAT* zone = nullptr;',
    '    double min = 0.0;',
    '    double max = 1.0;',
    '    double initial = 0.5;',
    '};',
    '',
    `class ${className} {`,
    'public:',
    `    ${dspClassName} dsp;`,
    '    std::vector<ParamZone> params;',
    '    std::unordered_map<std::string, std::shared_ptr<cycfi::elements::basic_slider_base>> sliders;',
    '    std::unordered_map<std::string, std::shared_ptr<cycfi::elements::basic_dial>> dials;',
    '    std::function<void(const std::string& id, double value)> onParamChange;',
    '',
    '    void init(int sample_rate);',
    '    void bindZones();',
    '    cycfi::elements::element_ptr make_ui();',
    '    void syncUiToDSP(cycfi::elements::view& view_);',
    '};',
    '',
    '// Forward declarations for visualizer elements',
    'struct MeterBarElement;',
    'struct FilterCurveElement;',
    'struct StereoFieldElement;',
    'struct EnvelopeElement;',
    'struct DriveMeterElement;',
    'struct MacroOrbElement;',
    'struct DecayMeterElement;',
  ].join('\n');

  const sourceParts: string[] = [];

  sourceParts.push(`#include "plugin_ui.h"`);
  sourceParts.push(`#include <faust/gui/UI.h>`);
  sourceParts.push(`#include <cmath>`);
  sourceParts.push(``);
  sourceParts.push(`using namespace cycfi::elements;`);
  sourceParts.push(``);
  sourceParts.push(`// ── Color constants ─────────────────────────────────────────────────`);
  sourceParts.push(`static constexpr auto accent_color  = rgba(${accentRgba(uiSpec.themeTokens.accent)}, 255);`);
  sourceParts.push(`static constexpr auto surface_color = rgba(${surfaceRgba(uiSpec.themeTokens.surface)}, 255);`);
  sourceParts.push(`static constexpr auto bkd_color     = rgba(${surfaceRgba(uiSpec.themeTokens.surface)}, 255);`);
  sourceParts.push(`static constexpr auto text_color    = rgba(0.9f, 0.9f, 0.9f, 255);`);
  sourceParts.push(`static constexpr auto muted_color   = rgba(0.45f, 0.45f, 0.45f, 255);`);
  sourceParts.push(``);
  sourceParts.push(`// ── Faust zone collector ────────────────────────────────────────────`);
  sourceParts.push(`struct ZoneCollector : public UI {`);
  sourceParts.push(`    std::vector<ParamZone>* out;`);
  sourceParts.push(``);
  sourceParts.push(`    void openTabBox(const char* label) override {}`);
  sourceParts.push(`    void openHorizontalBox(const char* label) override {}`);
  sourceParts.push(`    void openVerticalBox(const char* label) override {}`);
  sourceParts.push(`    void closeBox() override {}`);
  sourceParts.push(``);
  sourceParts.push(`    void addButton(const char* label, FAUSTFLOAT* zone) override {`);
  sourceParts.push(`        out->push_back({label, label, zone, 0.0, 1.0, 0.0});`);
  sourceParts.push(`    }`);
  sourceParts.push(`    void addCheckButton(const char* label, FAUSTFLOAT* zone) override {`);
  sourceParts.push(`        out->push_back({label, label, zone, 0.0, 1.0, 0.0});`);
  sourceParts.push(`    }`);
  sourceParts.push(`    void addVerticalSlider(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init, FAUSTFLOAT min, FAUSTFLOAT max, FAUSTFLOAT step) override {`);
  sourceParts.push(`        out->push_back({label, label, zone, static_cast<double>(min), static_cast<double>(max), static_cast<double>(init)});`);
  sourceParts.push(`    }`);
  sourceParts.push(`    void addHorizontalSlider(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init, FAUSTFLOAT min, FAUSTFLOAT max, FAUSTFLOAT step) override {`);
  sourceParts.push(`        out->push_back({label, label, zone, static_cast<double>(min), static_cast<double>(max), static_cast<double>(init)});`);
  sourceParts.push(`    }`);
  sourceParts.push(`    void addNumEntry(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init, FAUSTFLOAT min, FAUSTFLOAT max, FAUSTFLOAT step) override {`);
  sourceParts.push(`        out->push_back({label, label, zone, static_cast<double>(min), static_cast<double>(max), static_cast<double>(init)});`);
  sourceParts.push(`    }`);
  sourceParts.push(`    void addHorizontalBargraph(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT min, FAUSTFLOAT max) override {}`);
  sourceParts.push(`    void addVerticalBargraph(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT min, FAUSTFLOAT max) override {}`);
  sourceParts.push(`    void addSoundfile(const char* label, const char* filename, Soundfile** sf_zone) override {}`);
  sourceParts.push(`    void declare(FAUSTFLOAT* zone, const char* key, const char* val) override {}`);
  sourceParts.push(`};`);
  sourceParts.push(``);

  // Build section classes
  for (const section of uiSpec.sections) {
    const sectionParams = section.controls
      .map((id) => paramMap.get(id))
      .filter((p): p is MacroControl => !!p);

    if (sectionParams.length === 0) continue;

    const isHeroSection = uiSpec.heroControls.some((h) => section.controls.includes(h));
    const useDials = isHeroSection || (uiSpec.layoutHints.heroSize === 'large' && section.id === uiSpec.sections[0]?.id);
    const baseClass = section.layout === 'column' ? 'vtile_composite' : 'htile_composite';

    sourceParts.push(`// Section: ${section.label}`);
    sourceParts.push(`struct Section_${sanitizeCppId(section.id)} : ${baseClass} {`);
    sourceParts.push(`    Section_${sanitizeCppId(section.id)}(std::vector<ParamZone>& params, ${className}* self) : ${baseClass}() {`);

    for (const param of sectionParams) {
      const ctrlVar = `ctrl_${sanitizeCppId(param.id)}`;
      const pVar = `p_${sanitizeCppId(param.id)}`;
      const range = param.max - param.min;
      const rawNormVal = range !== 0 ? (param.default - param.min) / range : 0.5;
      const normVal = Number.isFinite(rawNormVal) ? Math.min(1, Math.max(0, rawNormVal)) : 0.5;

      sourceParts.push(`        ParamZone* ${pVar} = nullptr;`);
      sourceParts.push(`        for (auto& z : params) { if (z.id == "${param.id}") { ${pVar} = &z; break; } }`);
      sourceParts.push(`        if (${pVar}) {`);

      if (useDials) {
        sourceParts.push(`            auto ${ctrlVar} = share(`);
        sourceParts.push(`                dial(`);
        sourceParts.push(`                    radial_marks<12>(basic_knob<44>()),`);
        sourceParts.push(`                    ${normVal.toFixed(4)}`);
        sourceParts.push(`                )`);
        sourceParts.push(`            );`);
        sourceParts.push(`            ${ctrlVar}->on_change = [self, zone = ${pVar}->zone, min = ${pVar}->min, max = ${pVar}->max, id = "${param.id}"](double val) {`);
        sourceParts.push(`                double realVal = min + val * (max - min);`);
        sourceParts.push(`                *zone = static_cast<FAUSTFLOAT>(realVal);`);
        sourceParts.push(`                if (self->onParamChange) self->onParamChange(id, realVal);`);
        sourceParts.push(`            };`);
        sourceParts.push(`            self->dials["${param.id}"] = ${ctrlVar};`);
        sourceParts.push(`            push_back(share(align_center_middle(vmargin({8, 8}, hold(${ctrlVar})))));`);
        sourceParts.push(`            push_back(share(align_center(label("${sliderLabel(param.label)}"))));`);
      } else {
        sourceParts.push(`            auto ${ctrlVar} = share(`);
        sourceParts.push(`                slider(`);
        sourceParts.push(`                    basic_thumb<18>(),`);
        sourceParts.push(`                    slider_labels<5>(`);
        sourceParts.push(`                        slider_marks_lin<28>(basic_track<4, false>()),`);
        sourceParts.push(`                        0.7,`);
        sourceParts.push(`                        "${sliderLabel(param.label)}"`);
        sourceParts.push(`                    ),`);
        sourceParts.push(`                    ${normVal.toFixed(4)}`);
        sourceParts.push(`                )`);
        sourceParts.push(`            );`);
        sourceParts.push(`            ${ctrlVar}->on_change = [self, zone = ${pVar}->zone, min = ${pVar}->min, max = ${pVar}->max, id = "${param.id}"](double val) {`);
        sourceParts.push(`                double realVal = min + val * (max - min);`);
        sourceParts.push(`                *zone = static_cast<FAUSTFLOAT>(realVal);`);
        sourceParts.push(`                if (self->onParamChange) self->onParamChange(id, realVal);`);
        sourceParts.push(`            };`);
        sourceParts.push(`            self->sliders["${param.id}"] = ${ctrlVar};`);
        sourceParts.push(`            push_back(share(align_middle(hmargin({10, 10}, hold(${ctrlVar})))));`);
      }
      sourceParts.push(`        }`);
    }

    sourceParts.push(`    }`);
    sourceParts.push(`};`);
    sourceParts.push(``);
  }

  // Main control panel
  sourceParts.push(`// ── Main control panel ──────────────────────────────────────────────`);
  sourceParts.push(`class ControlPanel : public vtile_composite {`);
  sourceParts.push(`public:`);
  sourceParts.push(`    ControlPanel(std::vector<ParamZone>& params, ${className}* self) : vtile_composite() {`);
  sourceParts.push(`        push_back(share(vmargin({10, 10}, align_center(label("${sliderLabel(uiSpec.title)}")))));`);
  sourceParts.push(`        push_back(share(vmargin({5, 5}, align_center(label("${sliderLabel(uiSpec.subtitle)}")))));`);

  for (const section of uiSpec.sections) {
    const hasParams = section.controls.some((id) => paramMap.has(id));
    if (!hasParams) continue;
    sourceParts.push(`        push_back(share(margin({15, 10, 15, 10},`);
    sourceParts.push(`            pane("${section.label}",`);
    sourceParts.push(`                Section_${sanitizeCppId(section.id)}(params, self),`);
    sourceParts.push(`                0.85f`);
    sourceParts.push(`            )`);
    sourceParts.push(`        )));`);
  }

  sourceParts.push(`    }`);
  sourceParts.push(`};`);
  sourceParts.push(``);

  // ── Visualizer elements ─────────────────────────────────────────────
  const hasVisualizers = uiSpec.visualizers.length > 0;
  const hasMeters = uiSpec.meters.length > 0;

  if (hasVisualizers || hasMeters) {
    sourceParts.push(`// ── Meter bar element ───────────────────────────────────────────────`);
    sourceParts.push(`class MeterBarElement : public element {`);
    sourceParts.push(`public:`);
    sourceParts.push(`    float level = 0.0f;`);
    sourceParts.push(`    color bar_color = accent_color;`);
    sourceParts.push(`    void draw(context const& ctx) override {`);
    sourceParts.push(`        auto& c = ctx.canvas;`);
    sourceParts.push(`        auto b = ctx.bounds;`);
    sourceParts.push(`        c.fill_style(surface_color);`);
    sourceParts.push(`        c.fill_rect(b);`);
    sourceParts.push(`        float h = b.height() * std::min(level, 1.0f);`);
    sourceParts.push(`        c.fill_style(bar_color);`);
    sourceParts.push(`        c.fill_rect(rect{b.left, b.bottom - h, b.right, b.bottom});`);
    sourceParts.push(`    }`);
    sourceParts.push(`    view_limits limits(basic_context const&) const override {`);
    sourceParts.push(`        return {{20, 60}, {40, 200}};`);
    sourceParts.push(`    }`);
    sourceParts.push(`};`);
    sourceParts.push(``);

    sourceParts.push(`// ── Filter curve visualizer ────────────────────────────────────────`);
    sourceParts.push(`class FilterCurveElement : public element {`);
    sourceParts.push(`public:`);
    sourceParts.push(`    explicit FilterCurveElement(std::vector<ParamZone>* params_) : params(params_) {}`);
    sourceParts.push(`    std::vector<ParamZone>* params;`);
    sourceParts.push(`    void draw(context const& ctx) override {`);
    sourceParts.push(`        auto& c = ctx.canvas;`);
    sourceParts.push(`        auto b = ctx.bounds;`);
    sourceParts.push(`        c.fill_style(surface_color);`);
    sourceParts.push(`        c.fill_rect(b);`);
    sourceParts.push(`        c.stroke_style(accent_color);`);
    sourceParts.push(`        c.line_width(2);`);
    sourceParts.push(`        c.begin_path();`);
    sourceParts.push(`        for (int i = 0; i <= 100; ++i) {`);
    sourceParts.push(`            float x = b.left + (b.width() * i / 100.0f);`);
    sourceParts.push(`            float freq = 20.0f * std::pow(1000.0f, i / 100.0f);`);
    sourceParts.push(`            float gain = 0.0f;`);
    sourceParts.push(`            for (auto& p : *params) {`);
    sourceParts.push(`                if (p.zone && p.id.find("brightness") != std::string::npos) {`);
    sourceParts.push(`                    gain += (*(p.zone) - 0.5f) * 12.0f;`);
    sourceParts.push(`                }`);
    sourceParts.push(`            }`);
    sourceParts.push(`            float y = b.top + b.height() * (0.5f - gain / 24.0f);`);
    sourceParts.push(`            if (i == 0) c.move_to({x, y}); else c.line_to({x, y});`);
    sourceParts.push(`        }`);
    sourceParts.push(`        c.stroke();`);
    sourceParts.push(`    }`);
    sourceParts.push(`    view_limits limits(basic_context const&) const override {`);
    sourceParts.push(`        return {{120, 80}, {full_extent, full_extent}};`);
    sourceParts.push(`    }`);
    sourceParts.push(`};`);
    sourceParts.push(``);

    sourceParts.push(`// ── Stereo field visualizer ────────────────────────────────────────`);
    sourceParts.push(`class StereoFieldElement : public element {`);
    sourceParts.push(`public:`);
    sourceParts.push(`    void draw(context const& ctx) override {`);
    sourceParts.push(`        auto& c = ctx.canvas;`);
    sourceParts.push(`        auto b = ctx.bounds;`);
    sourceParts.push(`        c.fill_style(surface_color);`);
    sourceParts.push(`        c.fill_rect(b);`);
    sourceParts.push(`        c.stroke_style(muted_color);`);
    sourceParts.push(`        c.line_width(1);`);
    sourceParts.push(`        c.begin_path();`);
    sourceParts.push(`        c.move_to({b.left, b.top + b.height()/2});`);
    sourceParts.push(`        c.line_to({b.right, b.top + b.height()/2});`);
    sourceParts.push(`        c.move_to({b.left + b.width()/2, b.top});`);
    sourceParts.push(`        c.line_to({b.left + b.width()/2, b.bottom});`);
    sourceParts.push(`        c.stroke();`);
    sourceParts.push(`        c.stroke_style(accent_color);`);
    sourceParts.push(`        c.line_width(2);`);
    sourceParts.push(`        c.begin_path();`);
    sourceParts.push(`        float cx = b.left + b.width() / 2;`);
    sourceParts.push(`        float cy = b.top + b.height() / 2;`);
    sourceParts.push(`        float rx = b.width() * 0.35f;`);
    sourceParts.push(`        float ry = b.height() * 0.35f;`);
    sourceParts.push(`        for (int i = 0; i <= 64; ++i) {`);
    sourceParts.push(`            float angle = 2.0f * 3.14159f * i / 64.0f;`);
    sourceParts.push(`            float x = cx + rx * std::cos(angle);`);
    sourceParts.push(`            float y = cy + ry * std::sin(angle);`);
    sourceParts.push(`            if (i == 0) c.move_to({x, y}); else c.line_to({x, y});`);
    sourceParts.push(`        }`);
    sourceParts.push(`        c.stroke();`);
    sourceParts.push(`    }`);
    sourceParts.push(`    view_limits limits(basic_context const&) const override {`);
    sourceParts.push(`        return {{80, 80}, {full_extent, full_extent}};`);
    sourceParts.push(`    }`);
    sourceParts.push(`};`);
    sourceParts.push(``);

    sourceParts.push(`// ── Envelope visualizer ────────────────────────────────────────────`);
    sourceParts.push(`class EnvelopeElement : public element {`);
    sourceParts.push(`public:`);
    sourceParts.push(`    explicit EnvelopeElement(std::vector<ParamZone>* params_) : params(params_) {}`);
    sourceParts.push(`    std::vector<ParamZone>* params;`);
    sourceParts.push(`    void draw(context const& ctx) override {`);
    sourceParts.push(`        auto& c = ctx.canvas;`);
    sourceParts.push(`        auto b = ctx.bounds;`);
    sourceParts.push(`        c.fill_style(surface_color);`);
    sourceParts.push(`        c.fill_rect(b);`);
    sourceParts.push(`        c.stroke_style(accent_color);`);
    sourceParts.push(`        c.line_width(2);`);
    sourceParts.push(`        c.begin_path();`);
    sourceParts.push(`        float attack = 0.1f, decay = 0.3f, sustain = 0.6f, release = 0.4f;`);
    sourceParts.push(`        for (auto& p : *params) {`);
    sourceParts.push(`            if (p.zone && p.id.find("punch") != std::string::npos) attack = *(p.zone);`);
    sourceParts.push(`        }`);
    sourceParts.push(`        float total = attack + decay + release;`);
    sourceParts.push(`        float ax = b.left;`);
    sourceParts.push(`        float ay = b.bottom;`);
    sourceParts.push(`        c.move_to({ax, ay});`);
    sourceParts.push(`        c.line_to({ax + b.width() * attack/total, b.top});`);
    sourceParts.push(`        c.line_to({ax + b.width() * (attack+decay)/total, b.top + b.height() * (1.0f-sustain)});`);
    sourceParts.push(`        c.line_to({ax + b.width() * (attack+decay+0.3f)/total, b.top + b.height() * (1.0f-sustain)});`);
    sourceParts.push(`        c.line_to({b.right, b.bottom});`);
    sourceParts.push(`        c.stroke();`);
    sourceParts.push(`    }`);
    sourceParts.push(`    view_limits limits(basic_context const&) const override {`);
    sourceParts.push(`        return {{120, 60}, {full_extent, full_extent}};`);
    sourceParts.push(`    }`);
    sourceParts.push(`};`);
    sourceParts.push(``);

    sourceParts.push(`// ── Drive meter visualizer ─────────────────────────────────────────`);
    sourceParts.push(`class DriveMeterElement : public element {`);
    sourceParts.push(`public:`);
    sourceParts.push(`    explicit DriveMeterElement(std::vector<ParamZone>* params_) : params(params_) {}`);
    sourceParts.push(`    std::vector<ParamZone>* params;`);
    sourceParts.push(`    void draw(context const& ctx) override {`);
    sourceParts.push(`        auto& c = ctx.canvas;`);
    sourceParts.push(`        auto b = ctx.bounds;`);
    sourceParts.push(`        c.fill_style(surface_color);`);
    sourceParts.push(`        c.fill_rect(b);`);
    sourceParts.push(`        float drive = 0.0f;`);
    sourceParts.push(`        for (auto& p : *params) {`);
    sourceParts.push(`            if (p.zone && p.id.find("drive") != std::string::npos) drive = *(p.zone);`);
    sourceParts.push(`        }`);
    sourceParts.push(`        c.fill_style(accent_color);`);
    sourceParts.push(`        float barW = b.width() * drive;`);
    sourceParts.push(`        c.fill_rect(rect{b.left, b.top + 4, b.left + barW, b.bottom - 4});`);
    sourceParts.push(`    }`);
    sourceParts.push(`    view_limits limits(basic_context const&) const override {`);
    sourceParts.push(`        return {{80, 24}, {full_extent, 40}};`);
    sourceParts.push(`    }`);
    sourceParts.push(`};`);
    sourceParts.push(``);

    sourceParts.push(`// ── Macro orb visualizer ───────────────────────────────────────────`);
    sourceParts.push(`class MacroOrbElement : public element {`);
    sourceParts.push(`public:`);
    sourceParts.push(`    explicit MacroOrbElement(std::vector<ParamZone>* params_) : params(params_) {}`);
    sourceParts.push(`    std::vector<ParamZone>* params;`);
    sourceParts.push(`    void draw(context const& ctx) override {`);
    sourceParts.push(`        auto& c = ctx.canvas;`);
    sourceParts.push(`        auto b = ctx.bounds;`);
    sourceParts.push(`        c.fill_style(surface_color);`);
    sourceParts.push(`        c.fill_rect(b);`);
    sourceParts.push(`        float cx = b.left + b.width() / 2;`);
    sourceParts.push(`        float cy = b.top + b.height() / 2;`);
    sourceParts.push(`        float r = std::min(b.width(), b.height()) * 0.35f;`);
    sourceParts.push(`        float macro = 0.5f;`);
    sourceParts.push(`        for (auto& p : *params) {`);
    sourceParts.push(`            if (p.zone) macro = *(p.zone);`);
    sourceParts.push(`        }`);
    sourceParts.push(`        c.fill_style(accent_color);`);
    sourceParts.push(`        c.begin_path();`);
    sourceParts.push(`        c.arc({cx, cy}, r * macro, 0, 2 * 3.14159f);`);
    sourceParts.push(`        c.fill();`);
    sourceParts.push(`        c.stroke_style(accent_color);`);
    sourceParts.push(`        c.line_width(1);`);
    sourceParts.push(`        c.begin_path();`);
    sourceParts.push(`        c.arc({cx, cy}, r, 0, 2 * 3.14159f);`);
    sourceParts.push(`        c.stroke();`);
    sourceParts.push(`    }`);
    sourceParts.push(`    view_limits limits(basic_context const&) const override {`);
    sourceParts.push(`        return {{60, 60}, {full_extent, full_extent}};`);
    sourceParts.push(`    }`);
    sourceParts.push(`};`);
    sourceParts.push(``);

    sourceParts.push(`// ── Decay meter visualizer ─────────────────────────────────────────`);
    sourceParts.push(`class DecayMeterElement : public element {`);
    sourceParts.push(`public:`);
    sourceParts.push(`    explicit DecayMeterElement(std::vector<ParamZone>* params_) : params(params_) {}`);
    sourceParts.push(`    std::vector<ParamZone>* params;`);
    sourceParts.push(`    void draw(context const& ctx) override {`);
    sourceParts.push(`        auto& c = ctx.canvas;`);
    sourceParts.push(`        auto b = ctx.bounds;`);
    sourceParts.push(`        c.fill_style(surface_color);`);
    sourceParts.push(`        c.fill_rect(b);`);
    sourceParts.push(`        float decay = 0.5f;`);
    sourceParts.push(`        for (auto& p : *params) {`);
    sourceParts.push(`            if (p.zone && p.id.find("space") != std::string::npos) decay = *(p.zone);`);
    sourceParts.push(`        }`);
    sourceParts.push(`        c.stroke_style(accent_color);`);
    sourceParts.push(`        c.line_width(2);`);
    sourceParts.push(`        c.begin_path();`);
    sourceParts.push(`        c.move_to({b.left, b.bottom});`);
    sourceParts.push(`        float dx = b.width() * 0.7f;`);
    sourceParts.push(`        float dy = b.height() * decay;`);
    sourceParts.push(`        c.line_to({b.left + dx * 0.3f, b.bottom - dy * 0.8f});`);
    sourceParts.push(`        c.line_to({b.left + dx, b.bottom - dy});`);
    sourceParts.push(`        c.line_to({b.right, b.bottom - dy * 0.3f});`);
    sourceParts.push(`        c.stroke();`);
    sourceParts.push(`    }`);
    sourceParts.push(`    view_limits limits(basic_context const&) const override {`);
    sourceParts.push(`        return {{80, 60}, {full_extent, full_extent}};`);
    sourceParts.push(`    }`);
    sourceParts.push(`};`);
    sourceParts.push(``);
  }

  // Implementation
  sourceParts.push(`// ── Implementation ──────────────────────────────────────────────────`);
  sourceParts.push(`void ${className}::init(int sample_rate) {`);
  sourceParts.push(`    dsp.init(sample_rate);`);
  sourceParts.push(`    bindZones();`);
  sourceParts.push(`}`);
  sourceParts.push(``);
  sourceParts.push(`void ${className}::bindZones() {`);
  sourceParts.push(`    ZoneCollector collector;`);
  sourceParts.push(`    collector.out = &params;`);
  sourceParts.push(`    dsp.buildUserInterface(&collector);`);
  sourceParts.push(`}`);
  sourceParts.push(``);
  sourceParts.push(`element_ptr ${className}::make_ui() {`);
  sourceParts.push(`    auto background = box(bkd_color);`);
  sourceParts.push(`    auto panel = ControlPanel(params, this);`);

  // Add visualizers
  const vizByPlacement = new Map<string, string[]>();
  for (const viz of uiSpec.visualizers) {
    const list = vizByPlacement.get(viz.placement) ?? [];
    list.push(viz.type);
    vizByPlacement.set(viz.placement, list);
  }

  const vizElementNames: string[] = [];
  for (const [placement, types] of vizByPlacement) {
    for (let i = 0; i < types.length; i++) {
      const vizVar = `viz_${placement}_${i}`;
      const typeMap: Record<string, string> = {
        filter_curve: 'FilterCurveElement',
        stereo_field: 'StereoFieldElement',
        envelope: 'EnvelopeElement',
        drive_meter: 'DriveMeterElement',
        macro_orb: 'MacroOrbElement',
        decay_meter: 'DecayMeterElement',
      };
      const className = typeMap[types[i]] ?? 'MacroOrbElement';
      if (className === 'StereoFieldElement') {
        sourceParts.push(`    auto ${vizVar} = share(${className}());`);
      } else {
        sourceParts.push(`    auto ${vizVar} = share(${className}(&params));`);
      }
      vizElementNames.push(vizVar);
    }
  }

  // Add meters
  const meterVars: string[] = [];
  for (let i = 0; i < uiSpec.meters.length; i++) {
    const meterVar = `meter_${i}`;
    sourceParts.push(`    auto ${meterVar} = share(MeterBarElement());`);
    meterVars.push(meterVar);
  }

  sourceParts.push(`    auto content = margin({20, 20, 20, 20}, link(panel));`);

  if (vizElementNames.length > 0 || meterVars.length > 0) {
    sourceParts.push(`    auto ui_stack = vtile(`);
    sourceParts.push(`        content`);
    for (const v of vizElementNames) {
      sourceParts.push(`        , align_center(hmin_size(120, vmargin({8, 8}, hold(${v}))))`);
    }
    if (meterVars.length > 0) {
      sourceParts.push(`        , align_center(hmin_size(60, htile(`);
      for (let i = 0; i < meterVars.length; i++) {
        sourceParts.push(`            hmin_size(30, hold(${meterVars[i]}))${i < meterVars.length - 1 ? ',' : ''}`);
      }
      sourceParts.push(`        )))`);
    }
    sourceParts.push(`    );`);
    sourceParts.push(`    return share(layer(ui_stack, background));`);
  } else {
    sourceParts.push(`    return share(layer(content, background));`);
  }
  sourceParts.push(`}`);
  sourceParts.push(``);
  sourceParts.push(`void ${className}::syncUiToDSP(view& view_) {`);
  sourceParts.push(`    for (auto& [id, slider] : sliders) {`);
  sourceParts.push(`        auto it = std::find_if(params.begin(), params.end(), [&](const ParamZone& p) { return p.id == id; });`);
  sourceParts.push(`        if (it != params.end() && it->zone) {`);
      sourceParts.push(`            double val = (static_cast<double>(*(it->zone)) - it->min) / (it->max - it->min);`);
  sourceParts.push(`            slider->value(val);`);
  sourceParts.push(`            view_.refresh(*slider);`);
  sourceParts.push(`        }`);
  sourceParts.push(`    }`);
  sourceParts.push(`    for (auto& [id, dial] : dials) {`);
  sourceParts.push(`        auto it = std::find_if(params.begin(), params.end(), [&](const ParamZone& p) { return p.id == id; });`);
  sourceParts.push(`        if (it != params.end() && it->zone) {`);
      sourceParts.push(`            double val = (static_cast<double>(*(it->zone)) - it->min) / (it->max - it->min);`);
  sourceParts.push(`            dial->value(val);`);
  sourceParts.push(`            view_.refresh(*dial);`);
  sourceParts.push(`        }`);
  sourceParts.push(`    }`);
  sourceParts.push(`}`);

  return {
    header,
    source: sourceParts.join('\n'),
  };
}
