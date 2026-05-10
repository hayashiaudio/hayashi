import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface WaveformViewerProps {
  url?: string;
  blob?: Blob;
  peaks?: number[];
  duration?: number;
  color?: string;
  progressColor?: string;
  height?: number;
}

export function WaveformViewer({ url, blob, peaks, duration, color = '#8fb13a', progressColor = '#ed922f', height = 140 }: WaveformViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: color,
      progressColor,
      height,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
    });

    if (peaks && duration) {
      ws.load(url ?? '', [peaks], duration);
    } else if (blob) {
      ws.loadBlob(blob);
    } else if (url) {
      ws.load(url);
    }

    waveRef.current = ws;
    return () => ws.destroy();
  }, [url, blob, peaks, duration, color, progressColor, height]);

  return <div ref={containerRef} className="w-full rounded-xl overflow-hidden" />;
}
