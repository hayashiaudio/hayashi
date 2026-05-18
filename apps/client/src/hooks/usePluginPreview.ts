import { useCallback, useState, useEffect, useRef } from 'react';
import { usePluginStore } from '@/stores/pluginStore';
import { applyPreviewParams, startPreview, stopPreview, updatePreviewStyle } from '@/audio/previewEngine';
import { compileFaustPlugin } from '@/audio/faustCompiler';
import { audioEngine } from '@/audio/engine';

export function usePluginPreview() {
  const { selectedStyle, previewPlaying, setPreviewPlaying, activePluginId, plugins } = usePluginStore();
  const [compiling, setCompiling] = useState(false);

  const prevIdRef = useRef(activePluginId);
  useEffect(() => {
    if (prevIdRef.current !== activePluginId && previewPlaying) {
      stopPreview();
      setPreviewPlaying(false);
    }
    prevIdRef.current = activePluginId;
  }, [activePluginId, previewPlaying, setPreviewPlaying]);

  useEffect(() => {
    const plugin = plugins.find((p) => p.id === activePluginId);
    const isTesterMode = plugin?.previewMode === 'mic' || plugin?.previewMode === 'midi' || plugin?.previewMode === 'sample';
    if (!previewPlaying || isTesterMode) return;
    updatePreviewStyle(selectedStyle);
  }, [selectedStyle, previewPlaying, activePluginId, plugins]);

  useEffect(() => {
    const plugin = plugins.find((p) => p.id === activePluginId);
    if (!plugin || !previewPlaying) return;
    applyPreviewParams(plugin.params);
  }, [activePluginId, plugins, previewPlaying]);

  const toggle = useCallback(async () => {
    if (previewPlaying) {
      stopPreview();
      setPreviewPlaying(false);
      return;
    }

    const plugin = plugins.find((p) => p.id === activePluginId);
    if (plugin?.previewMode === 'sample' && !plugin.previewSampleBuffer) {
      console.warn('[Hayashi] Sample preview requested without a loaded sample.');
      return;
    }
    let node = null;
    if (plugin?.faustCode) {
      setCompiling(true);
      try {
        await audioEngine.init();
        await audioEngine.resume();
        node = await compileFaustPlugin(audioEngine.ctx!, plugin.name, plugin.faustCode);
        applyPreviewParams(plugin.params, node);
      } catch (err) {
        console.error('[Hayashi] Faust compile failed:', err);
        setCompiling(false);
        return;
      } finally {
        setCompiling(false);
      }
    }

    const isMicMode = plugin?.previewMode === 'mic';
    const isMidiMode = plugin?.previewMode === 'midi';
    const isSampleMode = plugin?.previewMode === 'sample';
    const isEffectLoopMode = plugin?.type === 'effect' && (plugin?.previewMode ?? 'loop') === 'loop';
    const isTesterMode = isMicMode || isMidiMode || isSampleMode;
    startPreview({
      style: selectedStyle,
      pluginNode: node,
      noSequencer: isTesterMode,
      connectPluginToOutput: !isMicMode,
      inputMode: isSampleMode ? 'sample' : isEffectLoopMode ? 'effect-loop' : 'instrument',
      sampleBuffer: isSampleMode ? plugin.previewSampleBuffer ?? null : null,
    });
    setPreviewPlaying(true);
  }, [previewPlaying, selectedStyle, activePluginId, plugins, setPreviewPlaying]);

  return { previewPlaying, compiling, toggle };
}
