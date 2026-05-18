/**
 * Hayashi CLAP Plugin Wrapper with Elements UI
 *
 * This file is compiled alongside:
 *   - HayashiDSP.h    (Faust-generated DSP class)
 *   - plugin_ui.h/.cpp (Generated Elements UI)
 *
 * It implements the CLAP plugin API and hosts an Elements view
 * for the plugin editor.
 */

#include <clap/clap.h>
#include <clap/helpers/plugin.hh>
#include <clap/helpers/host-proxy.hh>
#include <cstring>
#include <iostream>
#include <memory>
#include <thread>
#include <atomic>
#include <faust/dsp/dsp.h>
#include <faust/gui/UI.h>
#include <faust/gui/meta.h>

// Faust DSP
#include "HayashiDSP.h"

// Elements UI
#include "plugin_ui.h"

// Plugin metadata (defined at compile time)
#ifndef FAUST_PLUGIN_ID
#define FAUST_PLUGIN_ID "com.hayashi.plugin"
#endif
#ifndef FAUST_PLUGIN_NAME
#define FAUST_PLUGIN_NAME "Hayashi Plugin"
#endif
#ifndef FAUST_PLUGIN_VENDOR
#define FAUST_PLUGIN_VENDOR "Hayashi"
#endif
#ifndef FAUST_PLUGIN_VERSION
#define FAUST_PLUGIN_VERSION "1.0.0"
#endif
#ifndef FAUST_PLUGIN_DESCRIPTION
#define FAUST_PLUGIN_DESCRIPTION "AI-generated plugin"
#endif

using namespace cycfi::elements;

// ── Parameter UI collector ──────────────────────────────────────────

struct ParamMeta {
    std::string id;
    std::string label;
    double min;
    double max;
    double initial;
    double* zone;
};

struct ParamCollector : public UI {
    std::vector<ParamMeta> params;

    void openTabBox(const char* label) override {}
    void openHorizontalBox(const char* label) override {}
    void openVerticalBox(const char* label) override {}
    void closeBox() override {}

    void addVerticalSlider(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init,
                           FAUSTFLOAT min, FAUSTFLOAT max, FAUSTFLOAT step) override {
        params.push_back({label, label, static_cast<double>(min), static_cast<double>(max),
                         static_cast<double>(init), reinterpret_cast<double*>(zone)});
    }
    void addHorizontalSlider(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init,
                             FAUSTFLOAT min, FAUSTFLOAT max, FAUSTFLOAT step) override {
        params.push_back({label, label, static_cast<double>(min), static_cast<double>(max),
                         static_cast<double>(init), reinterpret_cast<double*>(zone)});
    }
    void addNumEntry(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init,
                     FAUSTFLOAT min, FAUSTFLOAT max, FAUSTFLOAT step) override {
        params.push_back({label, label, static_cast<double>(min), static_cast<double>(max),
                         static_cast<double>(init), reinterpret_cast<double*>(zone)});
    }
    void addButton(const char* label, FAUSTFLOAT* zone) override {
        params.push_back({label, label, 0.0, 1.0, 0.0, reinterpret_cast<double*>(zone)});
    }
    void addCheckButton(const char* label, FAUSTFLOAT* zone) override {
        params.push_back({label, label, 0.0, 1.0, 0.0, reinterpret_cast<double*>(zone)});
    }
    void addHorizontalBargraph(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT min, FAUSTFLOAT max) override {}
    void addVerticalBargraph(const char* label, FAUSTFLOAT* zone, FAUSTFLOAT min, FAUSTFLOAT max) override {}
    void addSoundfile(const char* label, const char* filename, Soundfile** sf_zone) override {}
    void declare(FAUSTFLOAT* zone, const char* key, const char* val) override {}
};

// ── Plugin class ────────────────────────────────────────────────────

using Base = clap::helpers::Plugin<
    clap::helpers::MisbehaviourHandler::Terminate,
    clap::helpers::CheckingLevel::Minimal>;

class HayashiCLAPPlugin : public Base {
public:
    HayashiDSP dsp;
    ParamCollector uiCollector;
    std::unique_ptr<HayashiPluginUi> ui;
    std::atomic<bool> uiOpen{false};

    int numInputs = 2;
    int numOutputs = 2;

    HayashiCLAPPlugin(const clap_plugin_descriptor_t* desc, const clap_host_t* host)
        : Base(desc, host) {}

    bool init() noexcept override {
        dsp.init(44100);
        dsp.buildUserInterface(&uiCollector);
        return true;
    }

    bool activate(double sampleRate, uint32_t, uint32_t) noexcept override {
        dsp.init(static_cast<int>(sampleRate));
        numInputs = dsp.getNumInputs();
        numOutputs = dsp.getNumOutputs();
        return true;
    }

    clap_process_status process(const clap_process_t* process) noexcept override {
        if (process->audio_inputs_count < 1 || process->audio_outputs_count < 1)
            return CLAP_PROCESS_ERROR;

        const auto& inBuffer = process->audio_inputs[0];
        const auto& outBuffer = process->audio_outputs[0];

        if (inBuffer.channel_count < numInputs || outBuffer.channel_count < numOutputs)
            return CLAP_PROCESS_ERROR;

        // Process parameter events
        if (process->in_events) {
            for (uint32_t i = 0, N = process->in_events->size(process->in_events); i < N; ++i) {
                const clap_event_header_t* hdr = process->in_events->get(process->in_events, i);
                if (hdr && hdr->space_id == CLAP_CORE_EVENT_SPACE_ID &&
                    hdr->type == CLAP_EVENT_PARAM_VALUE) {
                    const auto* ev = reinterpret_cast<const clap_event_param_value_t*>(hdr);
                    if (ev->param_id < uiCollector.params.size()) {
                        *uiCollector.params[ev->param_id].zone = ev->value;
                    }
                }
            }
        }

        FAUSTFLOAT* inputs[16];
        FAUSTFLOAT* outputs[16];
        for (int i = 0; i < numInputs; ++i) inputs[i] = inBuffer.data32[i];
        for (int i = 0; i < numOutputs; ++i) outputs[i] = outBuffer.data32[i];

        dsp.compute(process->frames_count, inputs, outputs);
        return CLAP_PROCESS_CONTINUE;
    }

    // ── Audio ports ───────────────────────────────────────────────────
    bool implementsAudioPorts() const noexcept override { return true; }
    uint32_t audioPortsCount(bool) const noexcept override { return 1; }
    bool audioPortsInfo(uint32_t index, bool isInput, clap_audio_port_info_t* info) const noexcept override {
        if (index != 0 || !info) return false;
        std::memset(info, 0, sizeof(*info));
        info->id = index;
        std::snprintf(info->name, CLAP_NAME_SIZE, "%s", isInput ? "Input" : "Output");
        info->channel_count = isInput ? std::max(1, numInputs) : std::max(1, numOutputs);
        info->flags = CLAP_AUDIO_PORT_IS_MAIN;
        return true;
    }

    // ── Parameters ────────────────────────────────────────────────────
    bool implementsParams() const noexcept override { return true; }
    uint32_t paramsCount() const noexcept override {
        return static_cast<uint32_t>(uiCollector.params.size());
    }
    bool paramsInfo(uint32_t index, clap_param_info_t* info) const noexcept override {
        if (index >= uiCollector.params.size() || !info) return false;
        std::memset(info, 0, sizeof(*info));
        info->id = index;
        std::snprintf(info->name, CLAP_NAME_SIZE, "%s", uiCollector.params[index].label.c_str());
        info->min_value = uiCollector.params[index].min;
        info->max_value = uiCollector.params[index].max;
        info->default_value = uiCollector.params[index].initial;
        info->flags = CLAP_PARAM_IS_AUTOMATABLE;
        std::strncpy(info->module, "Main", sizeof(info->module));
        return true;
    }
    bool paramsValue(clap_id id, double* value) noexcept override {
        if (!value || id >= uiCollector.params.size()) return false;
        *value = *uiCollector.params[id].zone;
        return true;
    }
    bool paramsTextToValue(clap_id, const char* text, double* outValue) noexcept override {
        if (!text || !outValue) return false;
        try { *outValue = std::stod(text); return true; }
        catch (...) { return false; }
    }
    bool paramsValueToText(clap_id id, double value, char* outBuffer, uint32_t bufferSize) noexcept override {
        if (!outBuffer || bufferSize == 0 || id >= uiCollector.params.size()) return false;
        std::snprintf(outBuffer, bufferSize, "%.3f", value);
        return true;
    }
    void paramsFlush(const clap_input_events_t* in, const clap_output_events_t*) noexcept override {
        if (!in) return;
        for (uint32_t i = 0; i < in->size(in); ++i) {
            const clap_event_header_t* hdr = in->get(in, i);
            if (hdr && hdr->space_id == CLAP_CORE_EVENT_SPACE_ID &&
                hdr->type == CLAP_EVENT_PARAM_VALUE) {
                const auto* ev = reinterpret_cast<const clap_event_param_value_t*>(hdr);
                if (ev->param_id < uiCollector.params.size()) {
                    *uiCollector.params[ev->param_id].zone = ev->value;
                }
            }
        }
    }

    // ── State ─────────────────────────────────────────────────────────
    bool implementsState() const noexcept override { return true; }
    bool stateSave(const clap_ostream_t* stream) noexcept override {
        if (!stream || !stream->write) return false;
        uint32_t count = static_cast<uint32_t>(uiCollector.params.size());
        if (!stream->write(stream, &count, sizeof(count))) return false;
        for (const auto& p : uiCollector.params) {
            float v = static_cast<float>(*p.zone);
            if (!stream->write(stream, &v, sizeof(v))) return false;
        }
        return true;
    }
    bool stateLoad(const clap_istream_t* stream) noexcept override {
        if (!stream || !stream->read) return false;
        uint32_t count = 0;
        if (!stream->read(stream, &count, sizeof(count))) return false;
        if (count != uiCollector.params.size()) return false;
        for (uint32_t i = 0; i < count; ++i) {
            float v;
            if (!stream->read(stream, &v, sizeof(v))) return false;
            *uiCollector.params[i].zone = v;
        }
        return true;
    }

    // ── GUI ───────────────────────────────────────────────────────────
    bool implementsGui() const noexcept override { return true; }
    bool guiIsApiSupported(const char* api, bool isFloating) noexcept override {
        return isFloating; // Only floating window for now
    }
    bool guiGetPreferredApi(const char** api, bool* isFloating) noexcept override {
        *api = "";
        *isFloating = true;
        return true;
    }
    bool guiCreate(const char* api, bool isFloating) noexcept override {
        if (!isFloating) return false;
        try {
            ui = std::make_unique<HayashiPluginUi>();
            ui->init(44100);
            uiOpen = true;
            return true;
        } catch (...) {
            return false;
        }
    }
    void guiDestroy() noexcept override {
        uiOpen = false;
        ui.reset();
    }
    bool guiSetScale(double) noexcept override { return true; }
    bool guiShow() noexcept override {
        if (!ui) return false;
        // Floating window: spawn a thread to run the Elements app
        std::thread([this]() {
            try {
                app _app(FAUST_PLUGIN_NAME);
                window _win(_app.name());
                _win.on_close = [&_app]() { _app.stop(); };
                view view_(_win);
                view_.content(ui->make_ui());
                _app.run();
            } catch (...) {}
            uiOpen = false;
        }).detach();
        return true;
    }
    bool guiHide() noexcept override {
        uiOpen = false;
        return true;
    }
    bool guiGetSize(uint32_t* width, uint32_t* height) noexcept override {
        if (width) *width = 800;
        if (height) *height = 600;
        return true;
    }

    const void* get_extension(const char* id) noexcept override {
        if (std::strcmp(id, CLAP_EXT_AUDIO_PORTS) == 0) return (const clap_plugin_audio_ports_t*)this;
        if (std::strcmp(id, CLAP_EXT_PARAMS) == 0) return (const clap_plugin_params_t*)this;
        if (std::strcmp(id, CLAP_EXT_STATE) == 0) return (const clap_plugin_state_t*)this;
        if (std::strcmp(id, CLAP_EXT_GUI) == 0) return (const clap_plugin_gui_t*)this;
        return nullptr;
    }

    using Base::clapPlugin;
    static const clap_plugin_t* create(const clap_host_t* host) {
        return (new HayashiCLAPPlugin(&pluginDesc, host))->clapPlugin();
    }

private:
    static constexpr clap_plugin_descriptor_t pluginDesc = {
        CLAP_VERSION_INIT,
        FAUST_PLUGIN_ID,
        FAUST_PLUGIN_NAME,
        FAUST_PLUGIN_VENDOR,
        "https://dsp.tryhayashi.com",
        "",
        "",
        FAUST_PLUGIN_VERSION,
        FAUST_PLUGIN_DESCRIPTION,
        nullptr
    };
};

// ── Factory ─────────────────────────────────────────────────────────

static uint32_t plugin_count(const clap_plugin_factory_t*) { return 1; }
static const clap_plugin_descriptor_t* plugin_desc(const clap_plugin_factory_t*, uint32_t index) {
    return (index == 0) ? &HayashiCLAPPlugin::pluginDesc : nullptr;
}
static const clap_plugin_t* plugin_create(const clap_plugin_factory_t*, const clap_host_t* host, const char* plugin_id) {
    if (std::strcmp(plugin_id, FAUST_PLUGIN_ID) == 0)
        return HayashiCLAPPlugin::create(host);
    return nullptr;
}

static constexpr clap_plugin_factory_t pluginFactory = {
    plugin_count,
    plugin_desc,
    plugin_create
};

static bool entry_init(const char*) { return true; }
static void entry_deinit() {}

extern "C" {
    CLAP_EXPORT const void* clap_get_factory(const char* factory_id) {
        if (std::strcmp(factory_id, CLAP_PLUGIN_FACTORY_ID) == 0)
            return &pluginFactory;
        return nullptr;
    }
    CLAP_EXPORT const clap_plugin_entry_t clap_entry = {
        CLAP_VERSION_INIT,
        entry_init,
        entry_deinit,
        clap_get_factory
    };
}
