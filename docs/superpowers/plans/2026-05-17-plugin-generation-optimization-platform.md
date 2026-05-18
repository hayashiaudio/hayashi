# Plugin Generation Optimization Platform

> Date: 2026-05-17
> Status: Planning
> Goal: Raise generated plugin quality toward a consistent 75%-of-Valhalla target while preserving broad prompt range and keeping the existing UI/export/compiler contract stable.

## 1. Core Decision

Hayashi will not pursue open-ended prompt-to-DSP generation as the primary quality path.

Hayashi will pursue:

1. constrained Faust architecture families per category
2. category-specific measurement and heuristic scoring
3. offline black-box optimization over bounded parameter spaces
4. deterministic UI scheming inside the existing `UiSpec` contract
5. stable artifact emission into the existing Elements UI and native export pipeline

## 2. Non-Negotiable Boundary

All upstream generation improvements must continue to emit the same artifact types already expected by the pipeline:

- Faust DSP source
- normalized parameter schema
- macro control list
- current `UiSpec` JSON shape
- plugin metadata

This keeps the following downstream systems stable:

- [apps/server/src/ui/runtime.ts](/Users/jdbohrman/hayashi/apps/server/src/ui/runtime.ts:1)
- [apps/server/src/export/ui-codegen.ts](/Users/jdbohrman/hayashi/apps/server/src/export/ui-codegen.ts:1)
- [apps/server/src/export/dpf-codegen.ts](/Users/jdbohrman/hayashi/apps/server/src/export/dpf-codegen.ts:1)
- existing VST3/CLAP generation and compilation flow

The optimizer is a better spec producer, not a new export system.

## 3. Low-Level Optimizer Choice

### Decision

Use `libcmaes` as the low-level CMA-ES engine.

Do not use `wasm_cmaes` as the primary optimization backend.

### Reasoning

`libcmaes` is the better fit for Hayashi because:

- optimization is offline and batch-oriented
- search space is continuous and black-box
- evaluation will involve repeated native audio renders and metric scoring
- the optimizer should run as a dedicated worker, not as an in-browser or TS-first tool
- long-running native jobs matter more than browser ergonomics

`wasm_cmaes` may still be useful later for experimentation or interactive demos, but it is not the production optimizer path.

### Initial Dependency Policy

Start with the minimum viable native stack:

- `libcmaes`
- `eigen`

Do not require initially:

- `glog`
- `gflags`
- `boost-python`
- `numpy`

Add later if justified:

- `gtest`

### Integration Rule

Keep `libcmaes` behind a separate worker boundary.

Do not embed optimizer logic directly into the VST/export/compiler codepath.

## 4. System Architecture

The platform should be split into these layers.

### 4.1 Prompt Interpreter

The prompt interpreter does not invent topology. It outputs a target vector:

- category
- architecture family preference
- tonal targets
- motion targets
- width targets
- density or complexity targets
- vintage/clean tilt

Example:

```json
{
  "category": "parametric_eq",
  "family": "musical_tone_eq",
  "targets": {
    "warmth": 0.62,
    "air": 0.31,
    "clarity": 0.55,
    "precision": 0.22,
    "forwardness": 0.48
  }
}
```

### 4.2 Category Engine

Each category owns:

- 3-8 hand-designed Faust architectures
- architecture parameter bounds
- macro derivation rules
- category-specific metric bundle
- optimizer settings
- default UI scheming rules

### 4.3 Optimizer and Evaluator

For each prompt:

1. select top candidate architectures
2. sample initial candidate regions
3. reject unstable or low-musicality regions
4. run CMA-ES inside bounded spaces
5. render test material
6. compute metric stack
7. rank by weighted objective plus listening review
8. emit winning normalized candidate

### 4.4 Stable Artifact Emitter

The winner is converted into:

- Faust DSP code
- normalized parameter list
- macro controls
- `UiSpec`
- plugin metadata

## 5. Native Optimizer Worker

### Responsibility

The worker owns optimization only.

It does not own:

- UI generation
- plugin wrapper generation
- VST/CLAP export
- final artifact persistence

### Proposed I/O Contract

Input JSON:

- category
- architecture ID
- parameter bounds
- target vector
- metric weights
- render corpus identifiers
- optimizer config

Output JSON:

- winning parameter set
- aggregate score
- score breakdown
- optimization trace
- rejected regions summary
- metadata needed for deterministic re-run

### Worker Shape

Suggested path:

- `apps/server/src/optimization/` for orchestration
- native worker in a dedicated subtree such as `native/optimizer/`

The TypeScript server orchestrates jobs and collects results. The native worker performs search.

## 6. Main Category Roadmap

### Supported Category Set

1. `delay_echo`
2. `saturation_color`
3. `parametric_eq`
4. `filter_tone`
5. `modulation_width`
6. `reverb_space`
7. `dynamics_ducking`
8. `percussion_generator`
9. `synth_instrument`

### Recommended Build Order

1. `delay_echo`
2. `parametric_eq`
3. `saturation_color`
4. `filter_tone`
5. `modulation_width`
6. `reverb_space`
7. `dynamics_ducking`
8. `percussion_generator`
9. `synth_instrument`

Rationale:

- `delay_echo` is the best first optimization category
- `parametric_eq` is one of the easiest to measure objectively and should come early
- `reverb_space` is the hardest but most prestige-sensitive category

## 7. Parametric EQ Category

### Decision

Add `parametric_eq` as a first-class category.

### Subfamilies

- `clean_parametric_eq`
- `musical_tone_eq`
- `mastering_eq`
- `resonant_texture_eq`
- `tilt_presence_eq`

### Initial Architecture Families

1. `eq_3band_musical`
2. `eq_5band_parametric`
3. `eq_tilt_presence`
4. `eq_resonant_creative`

### Optimization Dimensions

- band center frequencies
- gain ranges
- Q
- shelf turnover
- output trim
- macro-to-band mapping
- interaction and compensation behavior

### Prompt Targets

- warmth
- air
- clarity
- weight
- forwardness
- smoothness
- precision
- color
- resonance

### Core Metrics

- target curve fit
- band interaction smoothness
- resonance harshness proxy
- low-end preservation
- high-end brittleness proxy
- gain compensation sanity
- mono compatibility
- sweep stability
- parameter sweet-spot width

## 8. Category Metric Framework

Each category uses a metric stack rather than a single metric.

### Global Metrics

- peak safety
- DC offset
- clipping incidence
- mono compatibility
- stereo behavior
- CPU estimate
- output stability across sweeps
- parameter robustness

### Delay Metrics

- repeat spacing accuracy
- feedback decay smoothness
- HF loss profile
- transient preservation
- stereo stability
- ducking effectiveness

### Saturation Metrics

- harmonic distribution
- odd/even balance proxy
- alias-risk proxy
- crest-factor change
- low-end retention
- harshness proxy

### Parametric EQ Metrics

- target response error
- band coupling smoothness
- resonance excess
- tonal neutrality at safe settings
- broad-vs-surgical controllability

### Filter Metrics

- cutoff behavior
- resonance sharpness
- sweep smoothness
- gain compensation behavior

### Modulation / Width Metrics

- width gain
- mono fold-down loss
- modulation smoothness
- pitch instability bounds

### Reverb Metrics

- EDT / RT60 behavior
- decay smoothness
- tail density growth
- spectral tilt over time
- transient smear
- pre-delay clarity
- stereo decorrelation
- metallic ringing proxy

### Dynamics Metrics

- gain-reduction smoothness
- release consistency
- transient retention
- pumping proxy

## 9. Listening and Taste Layer

Objective scoring is necessary but insufficient.

The platform needs a listening rubric that can be applied during ranking:

- expensive tail
- not metallic
- lush but not seasick
- broad but not hollow
- clean transient front
- dark without muffled loss
- aggressive without brittle harshness

Initially this should be encoded as weighted heuristic composites and human review.

Later it can become a learned ranking model.

## 10. Elements UI Scheming

UI planning is now an explicit generation stage.

The optimizer and category engine must not output arbitrary UI. They must output a control semantic map that is transformed into the existing `UiSpec`.

### Stable UI Contract

UI scheming must stay inside the existing fields:

- `uiFamily`
- `uiStyle`
- `heroControls`
- `sections`
- `visualizers`
- `meters`
- `layoutHints`
- `themeTokens`

Reference types:

- [apps/server/src/ui/types.ts](/Users/jdbohrman/hayashi/apps/server/src/ui/types.ts:1)
- [apps/client/src/types/uiSpec.ts](/Users/jdbohrman/hayashi/apps/client/src/types/uiSpec.ts:1)

### UI Planning Stage

Add:

`optimized DSP candidate -> semantic control map -> deterministic UiSpec scheme`

The result remains consumable by the existing Elements generator.

### Control Semantic Groups

Controls should be classified before UI emission:

- `space`
- `time`
- `tone`
- `drive`
- `width`
- `motion`
- `mix`
- `output`
- `utility`

For EQ:

- `low`
- `mid`
- `high`
- `presence`
- `air`
- `trim`

### Family Mapping

Use existing UI families more intentionally:

- `space_fx` for `reverb_space` and some `delay_echo`
- `color_fx` for `saturation_color` and `parametric_eq`
- `motion_filter` for `filter_tone` and `modulation_width`
- `instrument_modern` for `synth_instrument` and `percussion_generator`

### Category UI Schemes

#### `parametric_eq`

- `uiFamily=color_fx`
- `uiStyle=minimal_precision` or `boutique_hardware`
- hero controls biased toward `low`, `mid`, `high`, `presence`, `air`
- sections:
  - `tone`
  - `surgical`
  - `output`
- visualizers:
  - `filter_curve`
- meters:
  - `input`
  - `output`

#### `delay_echo`

- hero controls:
  - `time`
  - `feedback`
  - `mix`
- visualizers:
  - `stereo_field`
  - `macro_orb`

#### `reverb_space`

- hero controls:
  - `size`
  - `bloom`
  - `damping`
  - `preDelay`
- visualizers:
  - `decay_meter`
  - `stereo_field`
  - `macro_orb`

#### `saturation_color`

- hero controls:
  - `drive`
  - `tone`
  - `mix`
- visualizers:
  - `drive_meter`

#### `filter_tone`

- hero controls:
  - `cutoff`
  - `resonance`
  - `movement`
- visualizers:
  - `filter_curve`
  - `macro_orb`

### UI Safety Rules

- keep hero controls to 3-4
- prefer continuous controls compatible with current Elements widgets
- do not widen the `UiSpec` schema until the current contract is exhausted
- do not expose raw engineering internals if macro-layer controls are sufficient

## 11. Benchmarks

Each category needs a benchmark pack.

### Example Inputs

- impulse
- sine sweep
- pink noise
- drums
- bass
- vocals
- synth pad
- guitar
- mix bus material

### Quality Scorecard

The 75%-of-Valhalla target must be made operational with a repeatable rubric:

- tone
- depth
- movement
- forgiveness
- parameter usefulness
- mix-readiness
- distinctiveness

## 12. Compute Strategy

GPUs are not required for phase 1.

Phase 1 should be CPU-first:

- offline renders
- metric calculation
- CMA-ES optimization
- experiment logging

GPUs become relevant later for:

- learned ranking
- surrogate models
- neural perceptual scoring

## 13. Implementation Phases

### Phase 1

- category registry
- metric engine
- render runner
- optimizer orchestration
- native `libcmaes` worker
- stable artifact emitter
- UI scheming layer

### Phase 2

- `delay_echo`
- benchmark suite
- first end-to-end optimization loop

### Phase 3

- `parametric_eq`
- `filter_curve` UI scheme
- benchmark and listening workflow

### Phase 4

- `saturation_color`
- `filter_tone`

### Phase 5

- `modulation_width`

### Phase 6

- `reverb_space`

### Phase 7

- `dynamics_ducking`

### Phase 8

- instruments and percussion

## 14. Immediate Repo Follow-Ups

1. Add a category-registry module for architecture families.
2. Define a stable optimizer-worker JSON contract.
3. Add an optimization subtree for `libcmaes`.
4. Add semantic control grouping before `buildUiSpecFromTemplate`.
5. Add `parametric_eq` planning hooks into template and category registries.
6. Keep all downstream export code consuming the same normalized outputs.
