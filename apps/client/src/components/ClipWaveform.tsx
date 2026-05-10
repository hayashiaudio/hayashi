import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { getSample } from '@/samples/indexedDb';
import { useProjectStore } from '@/stores/projectStore';

interface ClipWaveformProps {
  assetId: string;
  width: number;
  height: number;
}

export function ClipWaveform({ assetId, width, height }: ClipWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [wsReady, setWsReady] = useState(false);

  const asset = useProjectStore((s) => s.assets[assetId]);
  const storePeaks = asset?.waveformPeaks as number[] | undefined;

  const safeW = Number.isFinite(width) && width > 0 ? width : 20;
  const safeH = Number.isFinite(height) && height > 0 ? height : 10;

  // Load peaks once per assetId
  useEffect(() => {
    let cancelled = false;
    setWsReady(false);

    async function load() {
      try {
        const record = await getSample(assetId);
        if (cancelled) return;
        const metaPeaks = record?.meta?.waveformPeaks as number[] | undefined;
        if (metaPeaks && metaPeaks.length > 0) {
          setPeaks(metaPeaks);
        } else if (storePeaks && storePeaks.length > 0) {
          setPeaks(storePeaks);
        } else {
          setPeaks(null);
        }
      } catch {
        if (!cancelled) {
          if (storePeaks && storePeaks.length > 0) {
            setPeaks(storePeaks);
          } else {
            setPeaks(null);
          }
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [assetId, storePeaks]);

  // Debounced WaveSurfer creation
  useEffect(() => {
    if (!containerRef.current || safeW < 20 || safeH < 10) return;

    let cancelled = false;
    let ws: WaveSurfer | null = null;
    let objectUrl: string | null = null;

    const timer = setTimeout(async () => {
      try {
        const record = await getSample(assetId);
        if (!record || cancelled) return;

        const blob = new Blob([record.buffer], { type: record.mimeType ?? 'audio/wav' });
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        ws = WaveSurfer.create({
          container: containerRef.current!,
          waveColor: 'rgba(245, 230, 200, 0.55)',
          progressColor: 'rgba(237, 146, 47, 0.9)',
          cursorColor: 'transparent',
          height: safeH,
          width: safeW,
          interact: false,
          normalize: true,
          barWidth: 1.5,
          barGap: 0.5,
          barRadius: 1,
          barHeight: 1,
        });

        ws.load(objectUrl);

        ws.on('ready', () => {
          if (!cancelled) setWsReady(true);
        });

        ws.on('error', () => {
          if (!cancelled) setWsReady(false);
        });
      } catch {
        if (!cancelled) setWsReady(false);
      }
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      ws?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setWsReady(false);
    };
  }, [assetId, safeW, safeH]);

  // Generate fallback bars
  const barCount = Math.max(4, Math.floor(safeW / 3));
  const fallbackBars =
    peaks && peaks.length > 0
      ? peaks
      : Array.from({ length: barCount }, (_, i) => 0.3 + 0.4 * Math.sin(i * 0.7));

  const barsToRender =
    fallbackBars.length >= barCount
      ? fallbackBars
      : Array.from({ length: barCount }, (_, i) => {
          const idx = Math.floor((i / barCount) * fallbackBars.length);
          return fallbackBars[Math.min(idx, fallbackBars.length - 1)] ?? 0.5;
        });

  return (
    <div
      style={{
        width: `${safeW}px`,
        height: `${safeH}px`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Fallback waveform bars */}
      <svg
        width={safeW}
        height={safeH}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: wsReady ? 0.3 : 0.85,
          transition: 'opacity 0.3s ease',
        }}
      >
        {barsToRender.map((h, i) => {
          const barW = Math.max(1, safeW / barCount - 1);
          const x = i * (barW + 1);
          const barH = Math.max(2, h * safeH);
          const y = (safeH - barH) / 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={Math.max(1, barW)}
              height={barH}
              rx={1}
              fill="rgba(245,230,200,0.45)"
            />
          );
        })}
      </svg>

      {/* WaveSurfer overlay */}
      <div
        ref={containerRef}
        className="clip-waveform"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: wsReady ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
