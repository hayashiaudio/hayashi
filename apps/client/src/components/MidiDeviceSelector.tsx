import { useMidiController } from '@/hooks/useMidiController';
import { Headphones } from 'lucide-react';

interface MidiDeviceSelectorProps {
  enabled: boolean;
  onParamChange: (name: string, value: number) => void;
  paramMap: Record<number, string>;
}

export function MidiDeviceSelector({ enabled, onParamChange, paramMap }: MidiDeviceSelectorProps) {
  const midi = useMidiController(enabled, onParamChange, paramMap);

  if (!midi.available) {
    return (
      <div className="text-[11px] text-[#525252]">
        Web MIDI not available. Connect a controller and use Chrome/Edge.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Headphones size={14} className="text-[#ff8c61]" />
      <span className="text-[10px] font-bold tracking-wider text-[#525252] uppercase">
        MIDI
      </span>
      {midi.inputs.length === 0 ? (
        <span className="text-[11px] text-[#525252]">No MIDI devices detected</span>
      ) : (
        <select
          aria-label="MIDI input device"
          className="bg-transparent text-[11px] text-[#e5e5e5] border rounded px-2 py-1"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          value={midi.activeInputId ?? ''}
          onChange={(e) => {
            void e.target.value;
            // All MIDI inputs are listened to simultaneously; this selector shows the active device
          }}
        >
          {midi.inputs.map((input) => (
            <option key={input.id} value={input.id}>
              {input.name}
            </option>
          ))}
        </select>
      )}
      {midi.lastCC && (
        <span className="text-[10px] font-mono text-[#737373]">
          CC{midi.lastCC.cc}: {Math.round(midi.lastCC.value * 127)}
        </span>
      )}
    </div>
  );
}
