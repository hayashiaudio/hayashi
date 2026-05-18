import type { ResolvedTheme } from './theme';
import type { UiMeter } from '@/types/uiSpec';

export interface MeterBarProps {
  meters: UiMeter[];
  theme: ResolvedTheme;
}

const METER_LABELS: Record<UiMeter, string> = {
  input: 'IN',
  output: 'OUT',
  gain_reduction: 'GR',
  width: 'WIDTH',
};

export function MeterBar({ meters, theme }: MeterBarProps) {
  if (meters.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {meters.map((meter) => (
        <div
          key={meter}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md border"
          style={{ borderColor: theme.border, background: theme.surface }}
        >
          <span className="text-[9px] font-bold tracking-wider" style={{ color: theme.textDim }}>
            {METER_LABELS[meter]}
          </span>
          <div className="w-8 h-1 rounded-full overflow-hidden" style={{ background: `${theme.surface}80` }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.random() * 60 + 20}%`,
                background: theme.accent,
                opacity: 0.5,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
