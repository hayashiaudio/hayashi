import { HeroControls } from '../HeroControls';
import { SectionRenderer } from '../SectionRenderer';
import { VisualizerHost } from '../VisualizerHost';
import { MeterBar } from '../MeterBar';
import type { ResolvedTheme } from '../theme';
import type { UiSpec } from '@/types/uiSpec';
import type { PluginParam } from '@/stores/pluginStore';

export interface LayoutProps {
  uiSpec: UiSpec;
  params: PluginParam[];
  theme: ResolvedTheme;
  onParamChange?: (name: string, value: number) => void;
  children?: React.ReactNode;
}

export function ColorFxLayout({ uiSpec, params, theme, onParamChange, children }: LayoutProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold" style={{ color: theme.text }}>{uiSpec.title}</h3>
          <p className="text-[11px]" style={{ color: theme.textMuted }}>{uiSpec.subtitle}</p>
        </div>
        <MeterBar meters={uiSpec.meters} theme={theme} />
      </div>

      <VisualizerHost visualizers={uiSpec.visualizers} placement="header" theme={theme} />

      {uiSpec.layoutHints.heroSize === 'large' ? (
        <HeroControls
          controls={uiSpec.heroControls}
          params={params}
          theme={theme}
          onParamChange={onParamChange}
        />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {uiSpec.heroControls.slice(0, 3).map((id) => {
            const param = params.find((p) => p.name === id);
            if (!param) return null;
            return (
              <div
                key={param.name}
                className="rounded-lg border p-3 flex items-center justify-between"
                style={{ borderColor: theme.border, background: theme.surface }}
              >
                <span className="text-[10px] font-bold tracking-wider" style={{ color: theme.textMuted }}>
                  {param.name}
                </span>
                <span className="text-[10px] font-mono" style={{ color: theme.text }}>
                  {param.value.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {uiSpec.sections.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            params={params}
            theme={theme}
            density={uiSpec.layoutHints.density}
            onParamChange={onParamChange}
          />
        ))}
      </div>

      <VisualizerHost visualizers={uiSpec.visualizers} placement="center" theme={theme} />
      <VisualizerHost visualizers={uiSpec.visualizers} placement="footer" theme={theme} />

      {children}
    </div>
  );
}
