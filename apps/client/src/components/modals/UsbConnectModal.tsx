import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Usb } from 'lucide-react';

interface UsbConnectModalProps {
  open: boolean;
  onClose: () => void;
}

export function UsbConnectModal({ open, onClose }: UsbConnectModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#111111] border-[rgba(255,255,255,0.08)] text-[#e5e5e5] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Usb className="h-4 w-4 text-[#f5a623]" />
            USB Audio / MIDI
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[#737373] mt-2">
          USB audio interfaces and MIDI controllers should appear automatically in the MIDI device list. Use <code className="text-[#ff8c61]">/connect midi</code> to select inputs.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-[#737373]">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
