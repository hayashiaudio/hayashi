import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Square, Loader2 } from 'lucide-react';
import { usePluginStore } from '@/stores/pluginStore';
import { initPreview } from '@/audio/previewEngine';
import { usePluginPreview } from '@/hooks/usePluginPreview';

export function PreviewPlayer() {
  const { selectedStyle } = usePluginStore();
  const { previewPlaying, compiling, toggle } = usePluginPreview();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initPreview().then(() => setReady(true));
  }, []);

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl border" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0a0a' }}>
      <Button
        size="sm"
        onClick={toggle}
        disabled={!ready || compiling}
        className="h-8 w-8 rounded-full p-0"
        style={{ background: previewPlaying ? '#ff3b30' : '#ff8c61', color: '#0a0a0a' }}
      >
        {compiling ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : previewPlaying ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current" />
        )}
      </Button>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold tracking-wider text-[#737373]">PREVIEW</span>
        <span className="text-[11px] font-mono text-[#e5e5e5]">{selectedStyle.toUpperCase()} · {ready ? (compiling ? 'Compiling...' : 'Ready') : 'Init...'}</span>
      </div>
    </div>
  );
}
