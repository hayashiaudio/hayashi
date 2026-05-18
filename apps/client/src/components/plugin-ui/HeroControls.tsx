import { ControlCard } from './ControlCard';
import type { ResolvedTheme } from './theme';
import type { PluginParam } from '@/stores/pluginStore';

export interface HeroControlsProps {
  controls: string[];
  params: PluginParam[];
  theme: ResolvedTheme;
  onParamChange?: (name: string, value: number) => void;
}

export function HeroControls({ controls, params, theme, onParamChange }: HeroControlsProps) {
  const heroParams = controls
    .map((id) => params.find((p) => p.name === id))
    .filter((p): p is PluginParam => !!p);

  if (heroParams.length === 0) return null;

  return (
    <div
      className="rounded-2xl border p-5 mb-4"
      style={{ borderColor: theme.border, background: theme.surface }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] font-bold tracking-wider" style={{ color: theme.textDim }}>
          HERO
        </span>
        <div className="flex-1 h-px" style={{ background: theme.border }} />
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(heroParams.length, 4)}, minmax(0, 1fr))` }}>
        {heroParams.map((param) => (
          <ControlCard
            key={param.name}
            name={param.name}
            value={param.value}
            min={param.min}
            max={param.max}
            theme={theme}
            size="lg"
            onChange={onParamChange}
          />
        ))}
      </div>
    </div>
  );
}
