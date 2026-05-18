import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Square, Loader2, Mic, Speaker, Music, AudioWaveform } from 'lucide-react';
import { usePluginStore } from '@/stores/pluginStore';
import { initPreview } from '@/audio/previewEngine';
import { usePluginPreview } from '@/hooks/usePluginPreview';

export function PreviewPlayer() {
  const { selectedStyle, activePluginId, plugins } = usePluginStore();
  const { previewPlaying, compiling, toggle } = usePluginPreview();
  const [ready, setReady] = useState(false);
  const plugin = plugins.find((item) => item.id === activePluginId);
  const mode = plugin?.previewMode ?? 'loop';
  const missingSample = mode === 'sample' && !plugin?.previewSampleBuffer;

  const idleIcon = mode === 'mic'
    ? <Mic className="h-4 w-4" />
    : mode === 'sample'
      ? <AudioWaveform className="h-4 w-4" />
    : mode === 'midi'
      ? <Speaker className="h-4 w-4" />
      : <Music className="h-4 w-4" />;
  const label = mode === 'mic' ? 'MIC TEST' : mode === 'midi' ? 'MIDI TEST' : mode === 'sample' ? 'SAMPLE TEST' : 'PREVIEW';
  const status = mode === 'mic'
    ? (ready ? (compiling ? 'Compiling...' : 'Mic armed') : 'Init...')
    : mode === 'sample'
      ? (ready ? (compiling ? 'Compiling...' : plugin?.previewSampleName ? plugin.previewSampleName : 'Load a sample') : 'Init...')
    : mode === 'midi'
      ? (ready ? (compiling ? 'Compiling...' : 'Controller ready') : 'Init...')
      : `${selectedStyle.toUpperCase()} · ${ready ? (compiling ? 'Compiling...' : 'Ready') : 'Init...'}`;

  const handleToggle = useCallback(async () => {
    if (!ready) {
      await initPreview();
      setReady(true);
    }
    await toggle();
  }, [ready, toggle]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl border" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0a0a' }}>
      <Button
        size="sm"
        onClick={() => { void handleToggle(); }}
        disabled={compiling || missingSample}
        className="h-8 w-8 rounded-full p-0"
        style={{ background: previewPlaying ? '#ff3b30' : '#ff8c61', color: '#0a0a0a' }}
      >
        {compiling ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : previewPlaying ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          idleIcon
        )}
      </Button>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold tracking-wider text-[#737373]">{label}</span>
        <span className="text-[11px] font-mono text-[#e5e5e5]">{status}</span>
      </div>
    </div>
  );
}
