export const BUILD_TARGETS = [
  'vst3-linux-x64',
  'vst3-windows-x64',
  'vst3-macos-x64',
  'vst3-macos-arm64',
  'clap-linux-x64',
  'clap-windows-x64',
  'clap-macos-x64',
  'clap-macos-arm64',
] as const;

export type BuildTarget = (typeof BUILD_TARGETS)[number];

export type BuildPlatform = 'linux' | 'windows' | 'macos';
export type BuildArch = 'x64' | 'arm64';
export type BuildFormat = 'vst3' | 'clap';

export function isBuildTarget(value: string): value is BuildTarget {
  return (BUILD_TARGETS as readonly string[]).includes(value);
}

export function formatForTarget(target: BuildTarget): BuildFormat {
  return target.startsWith('vst3-') ? 'vst3' : 'clap';
}

export function platformForTarget(target: BuildTarget): BuildPlatform {
  if (target.includes('-windows-')) return 'windows';
  if (target.includes('-macos-')) return 'macos';
  return 'linux';
}

export function archForTarget(target: BuildTarget): BuildArch {
  return target.endsWith('-arm64') ? 'arm64' : 'x64';
}

export function defaultTargetForFormat(format: BuildFormat): BuildTarget {
  return format === 'vst3' ? 'vst3-linux-x64' : 'clap-linux-x64';
}

export function labelForTarget(target: BuildTarget): string {
  const format = formatForTarget(target).toUpperCase();
  const platform = platformForTarget(target);
  const arch = archForTarget(target);
  return `${format} ${platform} ${arch}`;
}
