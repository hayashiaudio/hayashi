#!/usr/bin/env python3
"""
Minimal hayashi-essentia-analyze: reads a WAV file and outputs basic audio metrics.
Uses only Python stdlib + numpy (no heavy Essentia dependency).
"""
import argparse
import json
import struct
import sys

import numpy as np


def read_wav(path):
    with open(path, "rb") as f:
        data = f.read()

    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("Not a valid WAV file")

    # Parse fmt chunk (starts at offset 12)
    idx = 12
    while idx < len(data):
        chunk_id = data[idx : idx + 4]
        chunk_size = struct.unpack("<I", data[idx + 4 : idx + 8])[0]
        chunk_data = data[idx + 8 : idx + 8 + chunk_size]
        idx += 8 + chunk_size
        if chunk_id == b"fmt ":
            audio_format = struct.unpack("<H", chunk_data[0:2])[0]
            num_channels = struct.unpack("<H", chunk_data[2:4])[0]
            sample_rate = struct.unpack("<I", chunk_data[4:8])[0]
            bits_per_sample = struct.unpack("<H", chunk_data[14:16])[0]
        elif chunk_id == b"data":
            raw = chunk_data
            break
    else:
        raise ValueError("No data chunk found")

    if audio_format == 3 and bits_per_sample == 32:
        samples = np.frombuffer(raw, dtype=np.float32)
    elif audio_format == 1 and bits_per_sample == 16:
        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif audio_format == 1 and bits_per_sample == 24:
        arr = np.frombuffer(raw, dtype=np.uint8)
        n = len(arr) // 3
        samples = np.zeros(n, dtype=np.float32)
        for i in range(n):
            b0, b1, b2 = arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]
            val = b0 | (b1 << 8) | (b2 << 16)
            if val & 0x800000:
                val -= 0x1000000
            samples[i] = val / 8388608.0
    else:
        raise ValueError(f"Unsupported WAV format: audio_format={audio_format}, bits={bits_per_sample}")

    frames = len(samples) // num_channels
    channels = [samples[c::num_channels][:frames] for c in range(num_channels)]
    return sample_rate, channels


def analyze(sample_rate, channels):
    mono = np.mean(channels, axis=0) if len(channels) > 1 else channels[0]

    peak = float(np.max(np.abs(mono)))
    peak_db = 20.0 * np.log10(peak + 1e-10)

    rms_val = float(np.sqrt(np.mean(mono**2)))
    rms_db = 20.0 * np.log10(rms_val + 1e-10)

    dc_offset = float(np.mean(mono))

    if len(channels) >= 2:
        corr = float(np.corrcoef(channels[0], channels[1])[0, 1])
        if not np.isfinite(corr):
            corr = 0.0
    else:
        corr = 1.0

    # Spectral centroid
    n = len(mono)
    if n > 0:
        fft = np.fft.rfft(mono)
        magnitudes = np.abs(fft)
        freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
        total_mag = np.sum(magnitudes)
        if total_mag > 0:
            centroid = float(np.sum(freqs * magnitudes) / total_mag)
        else:
            centroid = 0.0
    else:
        centroid = 0.0

    # Decay estimate (time to drop 20 dB = factor of 10)
    window_size = max(1, int(sample_rate * 0.01))
    if window_size > 0 and len(mono) > window_size:
        env = np.array([np.max(mono[i : i + window_size]) for i in range(0, len(mono) - window_size, window_size)])
        peak_idx = int(np.argmax(env))
        threshold = env[peak_idx] * 0.1
        tail = env[peak_idx:]
        decay_samples = np.where(tail < threshold)[0]
        if len(decay_samples) > 0:
            decay_ms = float((decay_samples[0] * window_size / sample_rate) * 1000.0)
        else:
            decay_ms = float(len(mono) / sample_rate * 1000.0)
    else:
        decay_ms = 0.0

    silence_threshold = 0.001
    silence_ratio = float(np.mean(np.abs(mono) < silence_threshold))

    clipping_ratio = float(np.mean(np.abs(mono) > 0.99))

    return {
        "peakDb": round(peak_db, 3),
        "rms": round(rms_db, 3),
        "dcOffset": round(dc_offset, 6),
        "stereoCorrelation": round(corr, 6),
        "spectralCentroidHz": round(centroid, 3),
        "decayMs": round(decay_ms, 3),
        "silenceRatio": round(silence_ratio, 6),
        "clippingRatio": round(clipping_ratio, 6),
    }


def main():
    parser = argparse.ArgumentParser(description="Analyze a WAV file and output metrics")
    parser.add_argument("--input", required=True, help="Input WAV path")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args()

    sample_rate, channels = read_wav(args.input)
    result = analyze(sample_rate, channels)

    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Analysis written to {args.output}")


if __name__ == "__main__":
    main()
