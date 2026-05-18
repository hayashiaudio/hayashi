import type { ResolvedTheme } from './theme';

export interface ControlCardProps {
  name: string;
  value: number;
  min: number;
  max: number;
  theme: ResolvedTheme;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (name: string, value: number) => void;
}

function formatParamValue(v: number, min: number, max: number) {
  if (max <= 1 && min >= 0) return `${Math.round(v * 100)}%`;
  if (max > 1000) return `${Math.round(v)}Hz`;
  return v.toFixed(2);
}

export function ControlCard({ name, value, min, max, theme, size = 'md', onChange }: ControlCardProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const isHero = size === 'lg';
  const knobSize = isHero ? 56 : 36;
  const barHeight = isHero ? 2.5 : 1.5;

  return (
    <div
      className="rounded-xl border p-4 transition-colors relative"
      style={{
        borderColor: theme.border,
        background: theme.surface,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold tracking-wider" style={{ fontSize: isHero ? 11 : 10, color: theme.textMuted }}>
          {name}
        </span>
        <span className="font-mono" style={{ fontSize: isHero ? 12 : 10, color: theme.text }}>
          {formatParamValue(value, min, max)}
        </span>
      </div>
      <div className="relative rounded-full overflow-hidden" style={{ height: barHeight, background: `${theme.surface}80` }}>
        <div
          className="absolute top-0 left-0 bottom-0 rounded-full"
          style={{ width: `${pct}%`, background: theme.accent, opacity: 0.6 }}
        />
      </div>
      <div className="flex justify-center mt-3">
        <div
          className="relative rounded-full"
          style={{
            width: knobSize,
            height: knobSize,
            border: `2px solid ${theme.accent}40`,
          }}
        >
          <div
            className="absolute top-1/2 left-1/2 w-0.5"
            style={{
              height: isHero ? 5 : 3,
              background: theme.accent,
              transform: `translate(-50%, -100%) rotate(${pct * 2.7 - 135}deg)`,
              transformOrigin: 'bottom center',
            }}
          />
        </div>
      </div>
      {onChange && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={(value - min) / (max - min)}
          onChange={(e) => onChange(name, parseFloat(e.target.value))}
          className="absolute inset-0 opacity-0 cursor-pointer"
          style={{ width: '100%', height: '100%' }}
          aria-label={`Adjust ${name}`}
        />
      )}
    </div>
  );
}
