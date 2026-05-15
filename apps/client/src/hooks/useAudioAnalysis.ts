import { useEffect, useRef, useState, useCallback } from 'react';
import { audioEngine } from '@/audio/engine';
import type { AnalysisResult } from '@/audio/analysisWorker';

export interface AudioAnalysisState {
  spectrum: number[];
  centroid: number;
  rms: number;
  zcr: number;
  peakDb: number;
  isActive: boolean;
}

const DEFAULT_STATE: AudioAnalysisState = {
  spectrum: new Array(64).fill(0),
  centroid: 0,
  rms: 0,
  zcr: 0,
  peakDb: -Infinity,
  isActive: false,
};

export function useAudioAnalysis(enabled: boolean): AudioAnalysisState {
  const [state, setState] = useState<AudioAnalysisState>(DEFAULT_STATE);
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number>(0);
  const freqBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timeBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const analyze = useCallback(() => {
    const analyser = audioEngine.analyserNode;
    if (!analyser || !enabled) return;

    const fftSize = analyser.frequencyBinCount;
    if (!freqBufferRef.current || freqBufferRef.current.length !== fftSize) {
      freqBufferRef.current = new Float32Array(fftSize) as unknown as Float32Array<ArrayBuffer>;
      timeBufferRef.current = new Float32Array(fftSize) as unknown as Float32Array<ArrayBuffer>;
    }

    const freqBuf = freqBufferRef.current as unknown as Float32Array<ArrayBuffer>;
    const timeBuf = timeBufferRef.current as unknown as Float32Array<ArrayBuffer>;

    analyser.getFloatFrequencyData(freqBuf);
    analyser.getFloatTimeDomainData(timeBuf);

    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({
        frequencyData: freqBuf.buffer,
        timeDomainData: timeBuf.buffer,
        sampleRate: audioEngine.sampleRate,
      }, [freqBuf.buffer, timeBuf.buffer] as Transferable[]);
    }

    rafRef.current = requestAnimationFrame(analyze);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState(DEFAULT_STATE);
      return;
    }

    const worker = new Worker(new URL('@/audio/analysisWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<AnalysisResult>) => {
      setState({ ...e.data, isActive: true });
      freqBufferRef.current = null;
      timeBufferRef.current = null;
    };

    rafRef.current = requestAnimationFrame(analyze);

    return () => {
      cancelAnimationFrame(rafRef.current);
      worker.terminate();
      workerRef.current = null;
      freqBufferRef.current = null;
      timeBufferRef.current = null;
    };
  }, [enabled, analyze]);

  return state;
}
