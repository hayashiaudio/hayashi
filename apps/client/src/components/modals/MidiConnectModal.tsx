import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AudioLines, Check } from 'lucide-react';

interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  connected: boolean;
}

interface MidiConnectModalProps {
  open: boolean;
  onClose: () => void;
}

export function MidiConnectModal({ open, onClose }: MidiConnectModalProps) {
  const [devices, setDevices] = useState<MidiDevice[]>([]);

  useEffect(() => {
    if (!open) return;
    if (typeof navigator.requestMIDIAccess !== 'function') {
      setDevices([{ id: 'none', name: 'Web MIDI not supported in this browser', manufacturer: '', connected: false }]);
      return;
    }
    navigator.requestMIDIAccess({ sysex: false }).then((midi) => {
      const inputs = Array.from(midi.inputs.values());
      setDevices(
        inputs.map((input) => ({
          id: input.id,
          name: input.name ?? 'Unknown',
          manufacturer: input.manufacturer ?? '',
          connected: true,
        }))
      );
    }).catch(() => {
      setDevices([]);
    });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#111111] border-[rgba(255,255,255,0.08)] text-[#e5e5e5] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AudioLines className="h-4 w-4 text-[#ff8c61]" />
            Connect MIDI Device
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {devices.length === 0 && (
            <p className="text-sm text-[#737373]">No MIDI devices found. Plug in a controller and refresh.</p>
          )}
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg border"
              style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0a0a' }}
            >
              <div>
                <div className="text-sm font-medium">{d.name}</div>
                <div className="text-xs text-[#737373]">{d.manufacturer}</div>
              </div>
              {d.connected && <Check className="h-4 w-4 text-[#34c759]" />}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-[#737373]">Close</Button>
          <Button size="sm" className="bg-[#ff8c61] text-[#0a0a0a] hover:bg-[#ff8c61]/90">Connect</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
