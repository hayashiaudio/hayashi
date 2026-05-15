import { Badge } from '@/components/ui/badge';
import { Activity, Zap, Waves, Volume2 } from 'lucide-react';

interface FeatureReadoutsProps {
  centroid: number;
  rms: number;
  zcr: number;
  peakDb: number;
  comparison?: {
    centroid?: number;
    rms?: number;
    zcr?: number;
    peakDb?: number;
  } | null;
}

function diffBadge(current: number, previous: number | undefined, unit: string) {
  if (previous === undefined) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.01) return null;
  const isUp = delta > 0;
  return (
    <Badge variant="outline" className={`h-3 text-[8px] rounded-sm ml-1 ${isUp ? 'border-[#34c759]/30 text-[#34c759]' : 'border-[#ff3b30]/30 text-[#ff3b30]'}`}>
      {isUp ? '↑' : '↓'} {Math.abs(delta).toFixed(2)}{unit}
    </Badge>
  );
}

export function FeatureReadouts({ centroid, rms, zcr, peakDb, comparison }: FeatureReadoutsProps) {
  const items = [
    { icon: Activity, label: 'CENTROID', value: `${centroid.toFixed(0)}Hz`, raw: centroid, prev: comparison?.centroid, unit: 'Hz' },
    { icon: Volume2, label: 'RMS', value: `${(rms * 100).toFixed(1)}%`, raw: rms, prev: comparison?.rms, unit: '' },
    { icon: Zap, label: 'ZCR', value: `${(zcr * 100).toFixed(1)}%`, raw: zcr, prev: comparison?.zcr, unit: '' },
    { icon: Waves, label: 'PEAK', value: `${peakDb.toFixed(1)}dB`, raw: peakDb, prev: comparison?.peakDb, unit: 'dB' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border p-2 flex flex-col items-center" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0a0a' }}>
          <div className="flex items-center gap-1 mb-1">
            <item.icon className="h-3 w-3 text-[#525252]" />
            <span className="text-[9px] font-bold tracking-wider text-[#525252]">{item.label}</span>
          </div>
          <div className="flex items-center">
            <span className="text-[11px] font-mono text-[#e5e5e5]">{item.value}</span>
            {diffBadge(item.raw, item.prev, item.unit)}
          </div>
        </div>
      ))}
    </div>
  );
}
