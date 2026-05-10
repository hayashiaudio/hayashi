import { useEffect, useRef, useState, useCallback } from 'react';
import { audioEngine } from '@/audio/engine';

export function useAudioEngine() {
  const [ready, setReady] = useState(false);
  const [meters, setMeters] = useState({ peak: 0, rms: 0 });
  const transportNodeRef = useRef<AudioWorkletNode | null>(null);
  const meterNodeRef = useRef<AudioWorkletNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    audioEngine.init().then(() => {
      if (cancelled) return;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startTransport = useCallback(async (bpm: number, beatOffset = 0) => {
    if (!audioEngine.ctx) return;
    await audioEngine.resume();
    audioEngine.setTransportActive(true);

    if (!transportNodeRef.current) {
      const node = audioEngine.createWorklet('transport', 'transport-processor');
      transportNodeRef.current = node;
    }
    transportNodeRef.current.port.postMessage({ type: 'start', bpm, beatOffset });

    if (!meterNodeRef.current) {
      const meter = audioEngine.createWorklet('meter', 'meter-processor');
      if (audioEngine.destination) {
        meter.connect(audioEngine.destination);
      }
      meter.port.onmessage = (e) => {
        if (e.data.type === 'meter') {
          setMeters({ peak: e.data.peak, rms: e.data.rms });
        }
      };
      meterNodeRef.current = meter;
    }
  }, []);

  const stopTransport = useCallback(() => {
    transportNodeRef.current?.port.postMessage({ type: 'stop' });
    audioEngine.setTransportActive(false);
  }, []);

  const updateTransport = useCallback((bpm: number) => {
    transportNodeRef.current?.port.postMessage({ type: 'update', bpm });
  }, []);

  return {
    ready,
    meters,
    startTransport,
    stopTransport,
    updateTransport,
    ctx: audioEngine.ctx,
    destination: audioEngine.destination,
  };
}
