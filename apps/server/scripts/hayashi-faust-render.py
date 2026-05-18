#!/usr/bin/env python3
"""
Minimal hayashi-faust-render: compiles a Faust DSP and renders a WAV file.
Uses the default faust C++ architecture (no UI, no audio driver).
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile


CPP_WRAPPER = '''
#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>

#include "{dsp_class}.h"

int main(int argc, char** argv) {{
    int sampleRate = {sample_rate};
    int durationSeconds = {duration};
    int channels = {channels};
    int frames = sampleRate * durationSeconds;

    {dsp_class} dsp;
    dsp.init(sampleRate);

    int numInputs = dsp.getNumInputs();
    int numOutputs = dsp.getNumOutputs();

    std::vector<float> input(frames * numInputs, 0.0f);
    std::vector<float> output(frames * numOutputs, 0.0f);
    std::vector<float*> inputs(numInputs);
    std::vector<float*> outputs(numOutputs);

    for (int c = 0; c < numInputs; c++) {{
        inputs[c] = &input[c * frames];
    }}
    for (int c = 0; c < numOutputs; c++) {{
        outputs[c] = &output[c * numOutputs];
    }}

    dsp.compute(frames, inputs.data(), outputs.data());

    // Write IEEE float WAV (mono or stereo interleaved)
    int outChannels = std::max(channels, numOutputs);
    int byteRate = sampleRate * outChannels * 4;
    int dataSize = frames * outChannels * 4;

    std::ofstream wav("{output_path}", std::ios::binary);
    wav.write("RIFF", 4);
    int chunkSize = 36 + dataSize;
    wav.write((char*)&chunkSize, 4);
    wav.write("WAVE", 4);
    wav.write("fmt ", 4);
    int subchunk1Size = 16;
    wav.write((char*)&subchunk1Size, 4);
    short audioFormat = 3; // IEEE float
    short numChans = (short)outChannels;
    wav.write((char*)&audioFormat, 2);
    wav.write((char*)&numChans, 2);
    wav.write((char*)&sampleRate, 4);
    wav.write((char*)&byteRate, 4);
    short blockAlign = numChans * 4;
    wav.write((char*)&blockAlign, 2);
    short bitsPerSample = 32;
    wav.write((char*)&bitsPerSample, 2);
    wav.write("data", 4);
    wav.write((char*)&dataSize, 4);

    for (int i = 0; i < frames; i++) {{
        for (int c = 0; c < outChannels; c++) {{
            float sample = (c < numOutputs) ? outputs[c][i] : 0.0f;
            wav.write((char*)&sample, 4);
        }}
    }}

    return 0;
}}
'''


def main():
    parser = argparse.ArgumentParser(description="Render Faust DSP to WAV")
    parser.add_argument("--dsp", required=True, help="Path to .dsp file")
    parser.add_argument("--fixture", required=True, help="Path to fixture JSON")
    parser.add_argument("--output", required=True, help="Output WAV path")
    args = parser.parse_args()

    with open(args.fixture) as f:
        fixture = json.load(f)

    sample_rate = fixture.get("sampleRate", 48000)
    duration = fixture.get("durationSeconds", 4)
    channels = fixture.get("channels", 2)

    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. Compile Faust DSP to C++ header
        cpp_path = os.path.join(tmpdir, "HayashiDSP.h")
        result = subprocess.run(
            ["faust", "-cn", "HayashiDSP", "-o", cpp_path, args.dsp],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"Faust compilation failed: {result.stderr}", file=sys.stderr)
            sys.exit(1)

        # 2. Write C++ wrapper
        wrapper_path = os.path.join(tmpdir, "main.cpp")
        with open(wrapper_path, "w") as f:
            f.write(
                CPP_WRAPPER.format(
                    dsp_class="HayashiDSP",
                    sample_rate=sample_rate,
                    duration=duration,
                    channels=channels,
                    output_path=args.output,
                )
            )

        # 3. Compile wrapper
        exe_path = os.path.join(tmpdir, "render")
        compile_result = subprocess.run(
            ["g++", "-O2", "-std=c++17", "-o", exe_path, wrapper_path, "-I", tmpdir],
            capture_output=True, text=True,
        )
        if compile_result.returncode != 0:
            print(f"C++ compilation failed: {compile_result.stderr}", file=sys.stderr)
            sys.exit(1)

        # 4. Run renderer
        run_result = subprocess.run([exe_path], capture_output=True, text=True)
        if run_result.returncode != 0:
            print(f"Render failed: {run_result.stderr}", file=sys.stderr)
            sys.exit(1)

    print(f"Rendered {args.output}")


if __name__ == "__main__":
    main()
