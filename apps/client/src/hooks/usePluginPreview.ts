import { useCallback, useState } from 'react';
import { usePluginStore } from '@/stores/pluginStore';
import { startPreview, stopPreview } from '@/audio/previewEngine';
import { compileFaustPlugin } from '@/audio/faustCompiler';
import { audioEngine } from '@/audio/engine';

export function usePluginPreview() {
  const { selectedStyle, previewPlaying, setPreviewPlaying, activePluginId, plugins } = usePluginStore();
  const [compiling, setCompiling] = useState(false);

  const toggle = useCallback(async () => {
    if (previewPlaying) {
      stopPreview();
      setPreviewPlaying(false);
      return;
    }

    const plugin = plugins.find((p) => p.id === activePluginId);
    let node = null;
    if (plugin?.faustCode) {
      setCompiling(true);
      try {
        await audioEngine.init();
        await audioEngine.resume();
        node = await compileFaustPlugin(audioEngine.ctx!, plugin.name, plugin.faustCode);
      } catch (err) {
        console.error('[Hayashi] Faust compile failed:', err);
        setCompiling(false);
        return;
      } finally {
        setCompiling(false);
      }
    }

    startPreview({ style: selectedStyle, pluginNode: node });
    setPreviewPlaying(true);
  }, [previewPlaying, selectedStyle, activePluginId, plugins, setPreviewPlaying]);

  return { previewPlaying, compiling, toggle };
}
