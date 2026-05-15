import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bluetooth } from 'lucide-react';

interface BtConnectModalProps {
  open: boolean;
  onClose: () => void;
}

export function BtConnectModal({ open, onClose }: BtConnectModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#111111] border-[rgba(255,255,255,0.08)] text-[#e5e5e5] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bluetooth className="h-4 w-4 text-[#5ac8fa]" />
            Bluetooth Audio / MIDI
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[#737373] mt-2">
          Bluetooth Web API support is limited. For now, pair your device in OS settings, then select it as the system audio output.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-[#737373]">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
