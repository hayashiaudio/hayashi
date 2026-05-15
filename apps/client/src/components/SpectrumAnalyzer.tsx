import { useRef, useEffect } from 'react';

const ACCENT = '#ff8c61';
const BG = '#0a0a0a';

interface SpectrumAnalyzerProps {
  spectrum: number[];
  height?: number;
}

export function SpectrumAnalyzer({ spectrum, height = 80 }: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peakHoldRef = useRef<number[]>(new Array(64).fill(0));

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
      gradient.addColorStop(0, `${ACCENT}cc`);
      gradient.addColorStop(1, `${ACCENT}44`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);

      ctx.fillStyle = `${ACCENT}88`;
      ctx.fillRect(x, peakY, barWidth, 2);
    }
  }, [spectrum, height]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg"
      style={{ height, background: BG }}
    />
  );
}
