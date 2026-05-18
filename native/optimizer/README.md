# Hayashi Optimizer Worker

This subtree is reserved for the native CMA-ES worker used by the optimization-driven plugin generation pipeline.

## Current Status

The native worker is implemented and buildable locally:

- vendored `libcmaes`
- vendored `Eigen`
- vendored `nlohmann/json`
- `hayashi_optimizer` executable built through CMake

The current objective function is intentionally narrow:

- real bounded CMA-ES over `parametric_eq` parameter ranges
- JSON in / JSON out contract used by `apps/server/src/optimization/worker.ts`
- heuristic EQ score optimized against the same metric shape used by the TypeScript layer

Still pending:

- trace persistence
- corpus-aware offline render scoring
- export/compiler smoke integration for optimized candidates

The intended low-level optimizer is:

- `libcmaes`
- `eigen`

Initial non-goals:

- Python bindings
- browser/WASM execution
- coupling optimizer logic into the export/compiler codepath

## Intended Binary Contract

Input:

- JSON over stdin or file path

Output:

- JSON result containing winner params, score breakdown, trace metadata, and rejected regions

## Planned Files

- `CMakeLists.txt`
- `src/main.cpp`
- `src/objective.cpp`
- `include/`

## Build

```bash
cmake -S native/optimizer -B native/optimizer/build
cmake --build native/optimizer/build -j 4
```

## Run

The worker accepts JSON on stdin and writes a single JSON result to stdout.
