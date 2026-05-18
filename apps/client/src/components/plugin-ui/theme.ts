import type { UiAccent, UiSurface, UiThemeTokens } from '@/types/uiSpec';

export const ACCENT_COLORS: Record<UiAccent, string> = {
  ice: '#5ac8fa',
  ember: '#ff8c61',
  violet: '#af52de',
  lime: '#cdff00',
  sunset: '#ff9500',
  steel: '#8e8e93',
};

export const SURFACE_COLORS: Record<UiSurface, string> = {
  smoke: '#1a1a1a',
  graphite: '#111111',
  mist: '#1c2520',
  obsidian: '#0a0a0a',
};

export const BORDER_COLOR = 'rgba(255,255,255,0.06)';
export const TEXT_COLOR = '#e5e5e5';
export const TEXT_MUTED_COLOR = '#737373';
export const TEXT_DIM_COLOR = '#525252';

export interface ResolvedTheme {
  accent: string;
  surface: string;
  glow: number;
  border: string;
  text: string;
  textMuted: string;
  textDim: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveTheme(tokens: UiThemeTokens): ResolvedTheme {
  return {
    accent: ACCENT_COLORS[tokens.accent] ?? ACCENT_COLORS.ember,
    surface: SURFACE_COLORS[tokens.surface] ?? SURFACE_COLORS.graphite,
    glow: tokens.glow ?? 0.3,
    border: BORDER_COLOR,
    text: TEXT_COLOR,
    textMuted: TEXT_MUTED_COLOR,
    textDim: TEXT_DIM_COLOR,
  };
}

export function cssVariables(theme: ResolvedTheme): Record<string, string> {
  return {
    '--hayashi-accent': theme.accent,
    '--hayashi-surface': theme.surface,
    '--hayashi-glow': String(theme.glow),
    '--hayashi-border': theme.border,
    '--hayashi-text': theme.text,
    '--hayashi-text-muted': theme.textMuted,
    '--hayashi-text-dim': theme.textDim,
  };
}

export function glowShadow(theme: ResolvedTheme, size: 'sm' | 'md' | 'lg' = 'md'): string {
  const opacity = Math.max(0.08, theme.glow * (size === 'sm' ? 0.3 : size === 'lg' ? 1 : 0.6));
  const spread = size === 'sm' ? 4 : size === 'lg' ? 24 : 12;
  return `0 0 ${spread}px ${hexToRgba(theme.accent, opacity)}`;
}
