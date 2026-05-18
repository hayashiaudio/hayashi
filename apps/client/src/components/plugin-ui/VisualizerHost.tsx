import type { ResolvedTheme } from './theme';
import type { UiVisualizerSpec, UiVisualizerType } from '@/types/uiSpec';

export interface VisualizerHostProps {
  visualizers: UiVisualizerSpec[];
  placement: UiVisualizerSpec['placement'];
  theme: ResolvedTheme;
}

const VISUALIZER_LABELS: Record<UiVisualizerType, string> = {
  filter_curve: 'Filter Curve',
  stereo_field: 'Stereo Field',
  envelope: 'Envelope',
  decay_meter: 'Decay Meter',
  drive_meter: 'Drive Meter',
  macro_orb: 'Macro Orb',
};

export function VisualizerHost({ visualizers, placement, theme }: VisualizerHostProps) {
  const placed = visualizers.filter((v) => v.placement === placement);
  if (placed.length === 0) return null;

  return (
    <div className="flex gap-3">
      {placed.map((v, i) => (
        <div
          key={`${v.type}-${i}`}
          className="flex-1 rounded-xl border flex items-center justify-center"
          style={{
            borderColor: theme.border,
            background: theme.surface,
            minHeight: placement === 'header' || placement === 'footer' ? 48 : 120,
          }}
        >
          <div className="text-center">
            <div
              className="text-[10px] font-bold tracking-wider mb-1"
              style={{ color: theme.textDim }}
            >
              {VISUALIZER_LABELS[v.type]}
            </div>
            <div
              className="text-[9px] font-mono"
              style={{ color: theme.textMuted }}
            >
              {v.type}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
