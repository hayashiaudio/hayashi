import { useState, useEffect, useRef } from 'react';
import { parseCommand } from '@/lib/commandParser';
import { Command, AudioLines, Bluetooth, Usb } from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (command: string, target?: string) => void;
}

const SUGGESTIONS = [
  { command: '/connect midi', icon: AudioLines, desc: 'Connect a MIDI keyboard or controller' },
  { command: '/connect bluetooth', icon: Bluetooth, desc: 'Pair Bluetooth audio or MIDI' },
  { command: '/connect usb', icon: Usb, desc: 'Use USB audio or MIDI interface' },
];

export function CommandPalette({ open, onClose, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const filtered = SUGGESTIONS.filter((s) =>
    s.command.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: '#111111', borderColor: 'rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <Command className="h-4 w-4 text-[#737373]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-[#e5e5e5] outline-none placeholder:text-[#525252]"
          />
        </div>
        <div className="py-2">
          {filtered.map((s) => (
            <button
              key={s.command}
              onClick={() => {
                const parsed = parseCommand(s.command);
                onSelect(parsed.command!, parsed.target ?? undefined);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
            >
              <s.icon className="h-4 w-4 text-[#525252]" />
              <div>
                <div className="text-sm text-[#e5e5e5]">{s.command}</div>
                <div className="text-xs text-[#737373]">{s.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
