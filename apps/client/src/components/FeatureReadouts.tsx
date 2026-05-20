import { Badge } from '@/components/ui/badge';
import { Activity, Zap, Waves, Volume2 } from 'lucide-react';

interface FeatureReadoutsProps {
  centroid: number;
  rms: number;
  zcr: number;
  peakDb: number;
  isLive?: boolean;
  comparison?: {
    centroid?: number;
    rms?: number;
    zcr?: number;
    peakDb?: number;
  } | null;
  publicMode?: boolean;
}

function diffBadge(current: number, previous: number | undefined, unit: string, publicMode?: boolean) {
  if (previous === undefined) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.01) return null;
  const isUp = delta > 0;
  const upColor = publicMode ? 'border-[#6b9e42]/35 text-[#56763c]' : 'border-[#34c759]/30 text-[#34c759]';
  const downColor = publicMode ? 'border-[#b84d3e]/30 text-[#9a3d2e]' : 'border-[#ff3b30]/30 text-[#ff3b30]';
  return (
    <Badge variant="outline" className={`h-3 text-[8px] rounded-sm ml-1 ${isUp ? upColor : downColor}`}>
      {isUp ? '↑' : '↓'} {Math.abs(delta).toFixed(2)}{unit}
    </Badge>
  );
}

function formatMetricValue(label: string, value: number, isLive: boolean) {
  if (!isLive) {
    if (label === 'CENTROID') return `${value.toFixed(0)}Hz`;
    if (label === 'RMS') return `${(value * 100).toFixed(1)}%`;
    if (label === 'ZCR') return `${(value * 100).toFixed(1)}%`;
    return `${value.toFixed(1)}dB`;
  }

  if (label === 'CENTROID') return `${value.toFixed(0)}Hz`;
  if (label === 'RMS') return `${(value * 100).toFixed(1)}%`;
  if (label === 'ZCR') return `${(value * 100).toFixed(1)}%`;
  return Number.isFinite(value) ? `${value.toFixed(1)}dB` : 'Silence';
}

export function FeatureReadouts({ centroid, rms, zcr, peakDb, isLive = false, comparison, publicMode = false }: FeatureReadoutsProps) {
  const items = [
    { icon: Activity, label: 'CENTROID', value: formatMetricValue('CENTROID', centroid, isLive), raw: centroid, prev: comparison?.centroid, unit: 'Hz' },
    { icon: Volume2, label: 'RMS', value: formatMetricValue('RMS', rms, isLive), raw: rms, prev: comparison?.rms, unit: '' },
    { icon: Zap, label: 'ZCR', value: formatMetricValue('ZCR', zcr, isLive), raw: zcr, prev: comparison?.zcr, unit: '' },
    { icon: Waves, label: 'PEAK', value: formatMetricValue('PEAK', peakDb, isLive), raw: peakDb, prev: comparison?.peakDb, unit: 'dB' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border p-2 flex flex-col items-center" style={{ borderColor: publicMode ? 'rgba(24,51,36,0.08)' : 'rgba(255,255,255,0.06)', background: publicMode ? 'rgba(255,252,245,0.72)' : '#0a0a0a' }}>
          <div className="flex items-center gap-1 mb-1">
            <item.icon className={`h-3 w-3 ${publicMode ? 'text-[#7d876d]' : 'text-[#525252]'}`} />
            <span className={`text-[9px] font-bold tracking-wider ${publicMode ? 'text-[#7d876d]' : 'text-[#525252]'}`}>{item.label}</span>
          </div>
          <div className="flex items-center">
            <span className={`text-[11px] font-mono ${publicMode ? 'text-[#10261d]' : 'text-[#e5e5e5]'}`}>{item.value}</span>
            {diffBadge(item.raw, item.prev, item.unit, publicMode)}
          </div>
        </div>
      ))}
    </div>
  );
}
