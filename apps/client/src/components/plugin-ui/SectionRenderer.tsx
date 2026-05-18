import { ControlCard } from './ControlCard';
import type { ResolvedTheme } from './theme';
import type { UiSectionSpec } from '@/types/uiSpec';
import type { PluginParam } from '@/stores/pluginStore';

export interface SectionRendererProps {
  section: UiSectionSpec;
  params: PluginParam[];
  theme: ResolvedTheme;
  density?: 'compact' | 'comfortable' | 'spacious';
  onParamChange?: (name: string, value: number) => void;
}

export function SectionRenderer({ section, params, theme, density = 'comfortable', onParamChange }: SectionRendererProps) {
  const sectionParams = section.controls
    .map((id) => params.find((p) => p.name === id))
    .filter((p): p is PluginParam => !!p);

  if (sectionParams.length === 0) return null;

  const gap = density === 'compact' ? 8 : density === 'spacious' ? 20 : 12;
  const layoutClass =
    section.layout === 'column'
      ? 'flex flex-col'
      : section.layout === 'grid'
      ? 'grid grid-cols-3'
      : 'flex flex-row';

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: theme.border, background: theme.surface }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold tracking-wider" style={{ color: theme.textDim }}>
          {section.label.toUpperCase()}
        </span>
        <div className="flex-1 h-px" style={{ background: theme.border }} />
      </div>
      <div className={layoutClass} style={{ gap }}>
        {sectionParams.map((param) => (
          <ControlCard
            key={param.name}
            name={param.name}
            value={param.value}
            min={param.min}
            max={param.max}
            theme={theme}
            size="md"
            onChange={onParamChange}
          />
        ))}
      </div>
    </div>
  );
}
