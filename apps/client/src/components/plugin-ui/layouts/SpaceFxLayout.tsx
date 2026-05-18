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

export function SpaceFxLayout({ uiSpec, params, theme, onParamChange, children }: LayoutProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold" style={{ color: theme.text }}>{uiSpec.title}</h3>
          <p className="text-[11px]" style={{ color: theme.textMuted }}>{uiSpec.subtitle}</p>
        </div>
        <MeterBar meters={uiSpec.meters} theme={theme} />
      </div>

      <VisualizerHost visualizers={uiSpec.visualizers} placement="header" theme={theme} />

      <div className="flex gap-4">
        <div className="flex-1 space-y-4">
          <HeroControls
            controls={uiSpec.heroControls}
            params={params}
            theme={theme}
            onParamChange={onParamChange}
          />
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
        {uiSpec.layoutHints.sidebar && (
          <div className="w-56 space-y-3 flex-shrink-0">
            <VisualizerHost visualizers={uiSpec.visualizers} placement="sidebar" theme={theme} />
            <VisualizerHost visualizers={uiSpec.visualizers} placement="center" theme={theme} />
          </div>
        )}
      </div>

      {!uiSpec.layoutHints.sidebar && (
        <VisualizerHost visualizers={uiSpec.visualizers} placement="center" theme={theme} />
      )}
      <VisualizerHost visualizers={uiSpec.visualizers} placement="footer" theme={theme} />

      {children}
    </div>
  );
}
