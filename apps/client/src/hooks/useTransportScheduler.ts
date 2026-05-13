import { useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { transportScheduler } from '@/audio/transportScheduler';
import { audioEngine } from '@/audio/engine';
import { stopRawSource } from '@/audio/graphCompiler';

export function useTransportScheduler() {
  const transport = useProjectStore((s) => s.localTransport);
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const workstationEditorNodeId = useProjectStore((s) => s.workstationEditorNodeId);

  useEffect(() => {
    const all = Object.values(clips).filter((c) => c.type === 'audio' && c.assetId);
    const scheduled = workstationEditorNodeId
      ? all.filter((c) => {
          const track = tracks[c.trackId];
          return track?.workstationNodeId === workstationEditorNodeId;
        })
      : all;
    transportScheduler.setClips(
      scheduled.map((c) => ({
        id: c.id,
        assetId: c.assetId!,
        trackId: c.trackId,
        startBeat: c.startBeat,
        lengthBeats: c.lengthBeats,
        loop: c.loop,
      }))
    );
  }, [clips, tracks, workstationEditorNodeId]);

  useEffect(() => {
    let cancelled = false;
    if (transport.playing) {
      audioEngine.resume().then(() => {
        if (cancelled) return;

        /* Stop raw graph sources for any track that has arrangement clips,
           so the scheduler is the sole playback path. */
        const state = useProjectStore.getState();
        const activeWorkstation = state.workstationEditorNodeId;
        const tracksWithClips = new Set(
          Object.values(state.clips)
            .filter((c) => {
              if (!activeWorkstation) return true;
              const t = state.tracks[c.trackId];
              return t?.workstationNodeId === activeWorkstation;
            })
            .map((c) => c.trackId)
        );
        for (const track of Object.values(state.tracks)) {
          if (tracksWithClips.has(track.id) && track.sourceNodeId) {
            stopRawSource(track.sourceNodeId);
          }
        }

        audioEngine.setTransportActive(true);
        transportScheduler.stop();
        transportScheduler.start(transport.bpm, transport.beatOffset);
      });
    } else {
      transportScheduler.stop();
      audioEngine.setTransportActive(false);
    }
    return () => {
      cancelled = true;
      transportScheduler.stop();
      audioEngine.setTransportActive(false);
    };
  }, [transport.playing, transport.beatOffset, transport.bpm]);

  useEffect(() => {
    if (transport.playing) {
      transportScheduler.updateBpm(transport.bpm);
    }
  }, [transport.bpm, transport.playing]);
}
