import { useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useAudioEngine } from './useAudioEngine';

export function useTransport() {
  const { startTransport, stopTransport, updateTransport } = useAudioEngine();
  const localTransport = useProjectStore((s) => s.localTransport);
  const updateLocalTransport = useProjectStore((s) => s.updateLocalTransport);

  const togglePlay = useCallback(() => {
    const next = !localTransport.playing;
    updateLocalTransport({ playing: next });
    if (next) {
      startTransport(localTransport.bpm, localTransport.beatOffset);
    } else {
      stopTransport();
    }
  }, [localTransport.playing, localTransport.bpm, localTransport.beatOffset, startTransport, stopTransport, updateLocalTransport]);

  const setBpm = useCallback((bpm: number) => {
    updateLocalTransport({ bpm });
    if (localTransport.playing) {
      updateTransport(bpm);
    }
  }, [localTransport.playing, updateLocalTransport, updateTransport]);

  return {
    playing: localTransport.playing,
    bpm: localTransport.bpm,
    beatOffset: localTransport.beatOffset,
    timeSignature: localTransport.timeSignature,
    key: localTransport.key,
    scene: localTransport.scene,
    togglePlay,
    setBpm,
  };
}
