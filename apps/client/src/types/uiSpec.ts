export type UiFamily = 'instrument_modern' | 'space_fx' | 'motion_filter' | 'color_fx';
export type UiStyle = 'minimal_precision' | 'boutique_hardware' | 'soft_ambient' | 'modern_bold';
export type UiSectionLayout = 'row' | 'column' | 'grid';
export type UiVisualizerType = 'filter_curve' | 'stereo_field' | 'envelope' | 'decay_meter' | 'drive_meter' | 'macro_orb';
export type UiVisualizerPlacement = 'header' | 'center' | 'sidebar' | 'footer';
export type UiMeter = 'input' | 'output' | 'gain_reduction' | 'width';
export type UiDensity = 'compact' | 'comfortable' | 'spacious';
export type UiHeroSize = 'medium' | 'large';
export type UiAccent = 'ice' | 'ember' | 'violet' | 'lime' | 'sunset' | 'steel';
export type UiSurface = 'smoke' | 'graphite' | 'mist' | 'obsidian';

export interface UiSectionSpec {
  id: string;
  label: string;
  layout: UiSectionLayout;
  controls: string[];
}

export interface UiVisualizerSpec {
  type: UiVisualizerType;
  placement: UiVisualizerPlacement;
}

export interface UiLayoutHints {
  density: UiDensity;
  heroSize: UiHeroSize;
  sidebar: boolean;
}

export interface UiThemeTokens {
  accent: UiAccent;
  surface: UiSurface;
  glow: number;
}

export interface UiSpec {
  schemaVersion: '1.0';
  uiFamily: UiFamily;
  uiStyle: UiStyle;
  title: string;
  subtitle: string;
  heroControls: string[];
  sections: UiSectionSpec[];
  visualizers: UiVisualizerSpec[];
  meters: UiMeter[];
  layoutHints: UiLayoutHints;
  themeTokens: UiThemeTokens;
}
