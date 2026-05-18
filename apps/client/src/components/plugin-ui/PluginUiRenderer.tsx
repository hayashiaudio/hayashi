import { InstrumentModernLayout } from './layouts/InstrumentModernLayout';
import { SpaceFxLayout } from './layouts/SpaceFxLayout';
import { MotionFilterLayout } from './layouts/MotionFilterLayout';
import { ColorFxLayout } from './layouts/ColorFxLayout';
import { resolveTheme } from './theme';
import type { UiSpec } from '@/types/uiSpec';
import type { PluginParam } from '@/stores/pluginStore';

export interface PluginUiRendererProps {
  uiSpec: UiSpec;
  params: PluginParam[];
  onParamChange?: (name: string, value: number) => void;
  children?: React.ReactNode;
}

export function PluginUiRenderer({ uiSpec, params, onParamChange, children }: PluginUiRendererProps) {
  const theme = resolveTheme(uiSpec.themeTokens);

  const layoutProps = {
    uiSpec,
    params,
    theme,
    onParamChange,
    children,
  };

  switch (uiSpec.uiFamily) {
    case 'instrument_modern':
      return <InstrumentModernLayout {...layoutProps} />;
    case 'space_fx':
      return <SpaceFxLayout {...layoutProps} />;
    case 'motion_filter':
      return <MotionFilterLayout {...layoutProps} />;
    case 'color_fx':
      return <ColorFxLayout {...layoutProps} />;
    default:
      return <InstrumentModernLayout {...layoutProps} />;
  }
}
