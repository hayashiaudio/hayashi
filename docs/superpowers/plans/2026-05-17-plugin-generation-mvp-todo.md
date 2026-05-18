# Plugin Generation MVP TODO

> Date: 2026-05-17
> Status: Execution checklist
> Scope: Build one first end-to-end MVP of the optimization-driven plugin generation platform, keep the downstream artifact contract stable, and fix issues after the first full pass works.

## MVP Rule

The first MVP must keep emitting the same downstream artifact types:

- Faust DSP source
- normalized parameter schema
- macro control list
- current `UiSpec` JSON shape
- plugin metadata

Do not let the MVP change the contracts consumed by:

- [apps/server/src/ui/runtime.ts](/Users/jdbohrman/hayashi/apps/server/src/ui/runtime.ts:1)
- [apps/server/src/export/ui-codegen.ts](/Users/jdbohrman/hayashi/apps/server/src/export/ui-codegen.ts:1)
- [apps/server/src/export/dpf-codegen.ts](/Users/jdbohrman/hayashi/apps/server/src/export/dpf-codegen.ts:1)
- native export / compilation orchestration

## MVP Slice

First category:

- `parametric_eq`

Reason:

- easiest category to score objectively
- easiest category to benchmark against prompt targets
- strong candidate for early “professional-feeling” results
- good stress test for UI scheming because of `filter_curve`

## Phase 0: Freeze Boundaries

- [x] Write down the normalized upstream-to-downstream contract in code comments or a shared type module.
- [x] Identify the exact spec fields that the optimizer is allowed to influence.
- [ ] Confirm that optimization output cannot write directly into wrapper/export codegen.
- [ ] Confirm that all existing downstream consumers can stay unchanged for the first MVP.

Repo touchpoints:

- [x] [apps/server/src/faust/spec-runtime.ts](/Users/jdbohrman/hayashi/apps/server/src/faust/spec-runtime.ts:1)
- [ ] [apps/server/src/ui/runtime.ts](/Users/jdbohrman/hayashi/apps/server/src/ui/runtime.ts:1)
- [ ] [apps/server/src/export/ui-codegen.ts](/Users/jdbohrman/hayashi/apps/server/src/export/ui-codegen.ts:1)

## Phase 1: Category and Target Plumbing

- [x] Add an internal category registry concept.
- [x] Define a category enum or registry entry for `parametric_eq`.
- [x] Define target-vector shape for optimizer-bound generation.
- [x] Define prompt-to-target mapping for `parametric_eq`.
- [x] Keep target vectors internal; do not expose them to existing export paths.

Suggested new modules:

- [x] `apps/server/src/optimization/category-registry.ts`
- [x] `apps/server/src/optimization/targets.ts`
- [x] `apps/server/src/optimization/prompt-targets.ts`

## Phase 2: Parametric EQ Architecture Set

- [x] Add a dedicated architecture family definition for `parametric_eq`.
- [ ] Decide whether to implement this inside the current template registry or alongside it with a separate optimization registry.
- [x] Define at least 3 initial architecture families:
- [x] `eq_3band_musical`
- [x] `eq_5band_parametric`
- [x] `eq_tilt_presence`
- [x] Optional fourth family: `eq_resonant_creative`
- [x] Define parameter bounds for each architecture.
- [x] Define macro derivation rules for each architecture.
- [x] Define the prompt-facing macro surface for each family.

Repo touchpoints:

- [x] [apps/server/src/faust/template-registry.ts](/Users/jdbohrman/hayashi/apps/server/src/faust/template-registry.ts:1)
- [x] [apps/server/src/faust/spec-runtime.ts](/Users/jdbohrman/hayashi/apps/server/src/faust/spec-runtime.ts:1)

Decision to make during implementation:

- [x] Reuse `VoiceArchitecture` with new EQ entries
- [ ] Or introduce an internal architecture layer that still compiles down to the current spec

## Phase 3: Native Optimizer Worker Scaffolding

- [x] Create a dedicated native optimizer subtree.
- [x] Add `libcmaes` integration plan and build notes.
- [x] Start with `libcmaes + eigen` only.
- [x] Do not add optional deps (`glog`, `gflags`, Python bindings) for MVP.
- [x] Define worker input JSON schema.
- [x] Define worker output JSON schema.
- [x] Implement a no-op or mocked optimization loop first to validate orchestration.
- [x] Add deterministic seed handling.
- [x] Persist optimization trace to disk for debugging.

Suggested native layout:

- [x] `native/optimizer/README.md`
- [x] `native/optimizer/CMakeLists.txt`
- [x] `native/optimizer/src/main.cpp`
- [ ] `native/optimizer/src/objective.cpp`
- [ ] `native/optimizer/include/`

Suggested server-side layout:

- [x] `apps/server/src/optimization/worker.ts`
- [x] `apps/server/src/optimization/contracts.ts`
- [ ] `apps/server/src/optimization/jobs.ts`

## Phase 4: Evaluation and Metric Runner

- [ ] Build a metric runner that can score rendered candidates offline.
- [x] Define the MVP metric set for `parametric_eq`.
- [x] Start with objective CPU-friendly metrics only.
- [x] Add a weighted score breakdown structure.
- [x] Save per-candidate metrics for later analysis.

Minimum MVP metrics for `parametric_eq`:

- [x] target curve fit
- [x] band interaction smoothness
- [x] resonance harshness proxy
- [x] low-end preservation
- [x] high-end brittleness proxy
- [x] mono compatibility
- [x] output stability across parameter sweeps
- [x] gain compensation sanity

Suggested modules:

- [x] `apps/server/src/optimization/metrics/base.ts`
- [x] `apps/server/src/optimization/metrics/parametric-eq.ts`
- [x] `apps/server/src/optimization/scoring.ts`

## Phase 5: Render Corpus and Benchmark Harness

- [x] Define a fixed MVP input corpus for EQ evaluation.
- [x] Store or reference canonical audio fixtures.
- [x] Build a repeatable benchmark harness around that corpus.
- [x] Ensure evaluations are deterministic and rerunnable.

MVP corpus:

- [x] vocal
- [x] drum loop
- [x] bass
- [x] synth pad
- [x] guitar
- [x] mix bus snippet
- [x] impulse / sweep for analysis

Suggested modules:

- [x] `apps/server/src/optimization/corpus.ts`
- [x] `apps/server/src/optimization/benchmarks/parametric-eq.ts`

## Phase 6: Optimizer Orchestration

- [x] Build orchestration from prompt target -> architecture candidates -> worker invocation -> scoring -> winner.
- [ ] Add candidate rejection for obviously bad regions before deep search.
- [ ] Start with a narrow CMA-ES configuration; no fancy restart logic for the first pass unless needed.
- [x] Keep all optimization outside the native export codepath.
- [ ] Add structured logging for candidate generation, score breakdowns, and failures.

Suggested modules:

- [x] `apps/server/src/optimization/orchestrator.ts`
- [ ] `apps/server/src/optimization/rejection.ts`
- [x] `apps/server/src/optimization/history.ts`

## Phase 7: Stable Artifact Emission

- [x] Convert the winning optimized candidate back into the existing plugin spec / macro / UI shape.
- [x] Keep emission deterministic.
- [x] Ensure the resulting object still passes existing validation.
- [ ] Ensure the output still feeds the existing Faust/UI/export pipeline without schema changes.

Suggested modules:

- [x] `apps/server/src/optimization/emit.ts`
- [x] `apps/server/src/optimization/normalize.ts`

Validation checks:

- [x] plugin spec validation still passes
- [x] `UiSpec` validation still passes
- [ ] existing code generators accept the outputs unchanged

## Phase 8: Elements UI Scheming

- [x] Add a semantic control grouping layer before UI spec generation.
- [x] Add deterministic `parametric_eq` UI planning inside the existing `UiSpec` shape.
- [x] Keep `parametric_eq` mapped to `color_fx` for MVP.
- [x] Use `filter_curve` as the primary visualizer.
- [ ] Keep visualizer and meter selection inside the current schema.

Semantic groups for MVP EQ:

- [x] `low`
- [x] `mid`
- [x] `high`
- [x] `presence`
- [x] `air`
- [x] `trim`

UI defaults for MVP EQ:

- [x] `uiFamily=color_fx`
- [x] `uiStyle=minimal_precision`
- [x] hero controls biased to `low`, `mid`, `high`, `presence`
- [x] sections:
- [x] `tone`
- [x] `surgical`
- [x] `output`
- [x] visualizers:
- [x] `filter_curve`
- [x] meters:
- [x] `input`
- [x] `output`

Repo touchpoints:

- [ ] [apps/server/src/ui/runtime.ts](/Users/jdbohrman/hayashi/apps/server/src/ui/runtime.ts:1)
- [ ] [apps/server/src/ui/types.ts](/Users/jdbohrman/hayashi/apps/server/src/ui/types.ts:1)
- [ ] [apps/client/src/types/uiSpec.ts](/Users/jdbohrman/hayashi/apps/client/src/types/uiSpec.ts:1)

Suggested modules:

- [x] `apps/server/src/optimization/ui/semantic-controls.ts`
- [x] `apps/server/src/optimization/ui/schemes.ts`

## Phase 9: Compile / Export Smoke Path

- [ ] Run the optimized outputs through the normal plugin generation path.
- [ ] Generate UI spec and Elements UI code from the optimized candidate.
- [ ] Run VST3/CLAP export on at least one generated MVP candidate.
- [ ] Verify that problems are fixed after the first whole-pass MVP rather than trying to perfect architecture early.

Acceptance criteria:

- [ ] optimized candidate turns into valid Faust
- [ ] UI codegen accepts the output
- [ ] wrapper generation accepts the output
- [ ] native export path completes on at least one canonical example

## Phase 10: Testing

- [x] Add unit tests for target-vector mapping.
- [x] Add unit tests for category registry.
- [x] Add unit tests for UI scheming.
- [x] Add tests for candidate normalization and emission.
- [x] Add integration tests for orchestrator -> emitted artifact contract.
- [x] Add snapshot-like tests for `parametric_eq` `UiSpec` output.

Suggested test files:

- [x] `apps/server/src/optimization/targets.test.ts`
- [x] `apps/server/src/optimization/ui/schemes.test.ts`
- [x] `apps/server/src/optimization/emit.test.ts`
- [x] `apps/server/src/optimization/orchestrator.test.ts`

## Phase 11: MVP Review and Fix Pass

- [ ] Run one full MVP pass end-to-end before broadening scope.
- [ ] Collect all breakpoints and failures.
- [ ] Fix issues after the first full run instead of redesigning midstream.
- [ ] Only add a second category after the first category passes the whole loop.

Review checklist:

- [ ] Did the optimizer stay isolated from export code?
- [ ] Did the artifact contract remain stable?
- [ ] Did UI scheming remain inside `UiSpec`?
- [ ] Did the generated plugin feel directionally professional?
- [ ] Did the score breakdown explain wins and failures well enough?

## Stretch Tasks After MVP

- [x] Add `synth` as the second category.
- [ ] Add real synth smoke/export coverage in Fly.
- [ ] Add `delay_echo` as the third category.
- [ ] Add restart strategies and richer CMA-ES configs in `libcmaes`.
- [ ] Add listening-session logging for future learned ranking.
- [ ] Add more EQ architectures if the first 3 are too narrow.
- [ ] Add better filter-curve UI behavior if current Elements output is too weak.

## Category Roadmap

Execution order:

- [x] `parametric_eq`
- [x] `synth`
- [x] `reverb_space`
- [x] `delay_echo`
- [ ] `saturation_color`
- [ ] `filter_tone`
- [ ] `modulation_width`
- [ ] `dynamics_ducking`
- [ ] `percussion_generator`

Notes:

- `parametric_eq` proves objective scoring, UI scheming, and export stability.
- `synth` proves the widened Faust spec: modulation, performance, and portamento.
- `reverb_space` now proves template-steered spatial optimization without changing the downstream artifact contract.
- `delay_echo` now proves time-domain repeat shaping and template aliasing without changing the downstream artifact contract.
- `reverb_space` remains the hardest category to tune to a high standard, so build acceptance on Fly matters more here than for the earlier categories.

## Explicit Non-MVP Tasks

Do not do these before the first full MVP works:

- [ ] all-category rollout
- [ ] reverb optimization
- [ ] learned ranking
- [ ] GPU-backed scoring
- [ ] dynamic EQ
- [ ] freeform topology generation
- [ ] downstream schema changes unless forced by a hard blocker
