import { useRef, useEffect } from 'react';

const ACCENT_DARK = '#ff8c61';
const BG_DARK = '#0a0a0a';
const ACCENT_LIGHT = '#d48c2e';
const BG_LIGHT = 'rgba(255,252,245,0.72)';

interface SpectrumAnalyzerProps {
  spectrum: number[];
  height?: number;
  publicMode?: boolean;
}

export function SpectrumAnalyzer({ spectrum, height = 80, publicMode = false }: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peakHoldRef = useRef<number[]>(new Array(64).fill(0));
  const accent = publicMode ? ACCENT_LIGHT : ACCENT_DARK;
  const bg = publicMode ? BG_LIGHT : BG_DARK;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const barWidth = (width - (spectrum.length - 1) * 2) / spectrum.length;
    const gap = 2;

    for (let i = 0; i < spectrum.length; i++) {
      const value = Math.max(0, Math.min(1, spectrum[i]));
      const peak = peakHoldRef.current[i];

      peakHoldRef.current[i] = Math.max(value, peak * 0.97);

      const barHeight = value * height;
      const peakY = (1 - peakHoldRef.current[i]) * height;
      const x = i * (barWidth + gap);

      const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
      gradient.addColorStop(0, `${accent}cc`);
      gradient.addColorStop(1, `${accent}44`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);

      ctx.fillStyle = `${accent}88`;
      ctx.fillRect(x, peakY, barWidth, 2);
    }
  }, [spectrum, height, accent]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg"
      style={{ height, background: bg }}
    />
  );
}
