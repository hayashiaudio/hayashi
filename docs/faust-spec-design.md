# Hayashi Faust Spec Design

This document defines the intermediate JSON-spec approach for Hayashi plugin generation. The goal is:

- the model outputs a constrained JSON document
- Hayashi converts that JSON into Faust from templates and safe primitives
- the server compiles the resulting Faust before persisting or returning it

This architecture is stricter than direct code generation and is the best path to "never ship invalid Faust".

## Why JSON Spec Instead of Raw Faust

JSON schema can guarantee:

- output structure
- required fields
- parameter naming conventions
- allowed primitive families
- supported graph topology

JSON schema cannot guarantee:

- valid Faust identifiers
- valid standard-library symbol names unless constrained ahead of time
- correct signal arity
- compilable code

So the full pipeline should be:

1. LLM emits a JSON plugin spec.
2. Hayashi validates it against [plugin-spec.schema.json](/Users/jdbohrman/hayashi/apps/server/src/faust/plugin-spec.schema.json:1).
3. Hayashi emits Faust from known-good templates.
4. Hayashi compiles the Faust with `faust`.
5. If compile fails, Hayashi repairs the spec or falls back to a safe preset.

## Standard Library Map

The official Faust Libraries docs expose the standard environments through `import("stdfaust.lib");`.

### Core environment map

| Prefix | Library | Main role in Hayashi |
| --- | --- | --- |
| `sf` | `all.lib` | umbrella namespace, avoid in generated code except for aliases |
| `aa` | `aanl.lib` | advanced analysis, not needed for first-pass generation |
| `an` | `analyzers.lib` | metering and analysis helpers, mostly not synthesis core |
| `ba` | `basics.lib` | utility helpers and constants |
| `co` | `compressors.lib` | compression, gating, dynamics |
| `de` | `delays.lib` | sample/time delays and delay-line primitives |
| `dm` | `demos.lib` | demos only, do not emit directly |
| `dx` | `dx7.lib` | FM voice structures, possible advanced synth expansion |
| `en` | `envelopes.lib` | ADSR/AR/ASR envelopes |
| `fd` | `fds.lib` | finite-difference schemes, not a first-pass target |
| `fi` | `filters.lib` | standard filters and resonators |
| `ho` | `hoa.lib` | higher-order ambisonics, out of initial scope |
| `it` | `interpolators.lib` | smoothing/interpolation primitives |
| `la` | `linearalgebra.lib` | math support, not direct audio building blocks |
| `ma` | `maths.lib` | mathematical primitives |
| `mi` | `mi.lib` | Mutable Instruments style modules, advanced expansion |
| `ef` | `misceffects.lib` | echo, transpose, distortion, utility FX |
| `mo` | `motion.lib` | gesture/control motion helpers |
| `no` | `noises.lib` | white/pink/brown noise sources |
| `os` | `oscillators.lib` | oscillators, phasors, band-limited waveform sources |
| `pf` | `phaflangers.lib` | phasers and flangers |
| `pm` | `physmodels.lib` | physical models, later expansion |
| `qu` | `quantizers.lib` | quantization effects, optional |
| `rm` | `reducemaps.lib` | reductions/maps, not direct sound primitives |
| `re` | `reverbs.lib` | reverb algorithms |
| `ro` | `routes.lib` | signal routing/mixing helpers |
| `si` | `signals.lib` | low-level signal helpers |
| `so` | `soundfiles.lib` | sample playback/file-based DSP |
| `sp` | `spats.lib` | panning/spatialization |
| `sy` | `synths.lib` | higher-level synth/percussion macros |
| `ve` | `vaeffects.lib` | virtual-analog filters/effects |
| `vl` | `version.lib` | version helpers, not a sound primitive |
| `wa` | `webaudio.lib` | browser/WebAudio integration helpers |
| `wd` | `wdmodels.lib` | wave digital models, later expansion |

Sources:

- https://faustlibraries.grame.fr/
- https://faustlibraries.grame.fr/organization/

## Safe Subset For Hayashi v1

Do not expose the whole standard library to the model in the first version. Expose a curated subset that maps to predictable templates.

### Sources

| Env | Safe symbols | Notes |
| --- | --- | --- |
| `os` | `osc`, `sawtooth`, `square`, `triangle`, `phasor` | core synth oscillators |
| `no` | `noise`, `pink_noise`, `brown_noise` | noise layers |
| `sy` | `popFilterDrum` | useful percussion macro |

### Envelopes

| Env | Safe symbols | Notes |
| --- | --- | --- |
| `en` | `adsr`, `ar`, `asr` | enough for synth and percussion gates |

Source:

- https://faustlibraries.grame.fr/libs/envelopes/

### Filters

| Env | Safe symbols | Notes |
| --- | --- | --- |
| `fi` | lowpass/highpass/bandpass families, resonant filters | standard filtering |
| `ve` | `moog_vcf`, `diodeLadder` | VA color and ladder behavior |

Source:

- https://faustlibraries.grame.fr/libs/vaeffects/

### Delay and modulation

| Env | Safe symbols | Notes |
| --- | --- | --- |
| `de` | `delay`, `fdelay` | safe delay primitives |
| `ef` | `echo` | simple time-based FX |
| `pf` | flanger/phaser families | modulation FX |

Important:

- The safe primitive is `fdelay`, not `fdelay1`.
- Hayashi should never allow arbitrary symbol invention by the model.

Sources:

- https://faustlibraries.grame.fr/libs/delays/
- https://faustlibraries.grame.fr/libs/misceffects/

### Reverb

| Env | Safe symbols | Notes |
| --- | --- | --- |
| `re` | `freeverb_demo`, `zita_rev1_stereo`, `jcrev`, `greyhole` | choose a narrow subset for portability |

Source:

- https://faustlibraries.grame.fr/libs/reverbs/

### Distortion and color

| Env | Safe symbols | Notes |
| --- | --- | --- |
| `ef` | `cubicnl`, `softclipQuadratic`, `wavefold` | creative nonlinearity |

Source:

- https://faustlibraries.grame.fr/libs/misceffects/

### Dynamics and routing

| Env | Safe symbols | Notes |
| --- | --- | --- |
| `co` | compressor/gate family | dynamics post-processing |
| `ro` | routing/mixing helpers | stereo and signal routing |
| `si` | low-level helpers | use only through templates |
| `sp` | panner family | stereo placement |

## Recommended Generator Architecture

### 1. LLM output

Prompt the model to emit only JSON matching the schema.

### 2. Validation

Reject any spec that:

- references a library outside the allow-list
- references a symbol outside the allow-list
- exceeds node/processor limits
- violates plugin-kind rules

### 3. Emission

Build Faust from deterministic templates:

- synth template
- percussion template
- effect template

Each template owns:

- `import("stdfaust.lib");`
- parameter emission
- source graph assembly
- stereo routing
- final `process`

### 4. Compile gate

Compile server-side before persisting. Never trust schema validation alone.

### 5. Repair policy

If compile fails:

1. return compiler stderr to a repair prompt that edits the JSON spec, not raw Faust
2. rerender Faust
3. recompile
4. cap retries to 2-4 attempts
5. if still failing, fall back to a safe preset

## Practical v1 Coverage

This spec is enough to generate:

- subtractive synths
- noise-based percussion
- filtered drones and pads
- delay/echo/flanger/phaser effects
- basic reverb and distortion chains
- mono or stereo insert effects

It is intentionally not enough for:

- arbitrary user-defined recursive structures
- free-form waveguide graphs
- custom physical models
- arbitrary `sf.*` access
- sample-driven soundfile instruments

That restriction is a feature, not a bug.

## Next Implementation Steps

1. Add a schema validator in the server generation path.
2. Add a deterministic spec-to-Faust emitter.
3. Add a compile-and-repair loop.
4. Add a small preset library of known-good building blocks.
5. Log which environment/symbol pairs fail most often so the safe subset can expand rationally.
