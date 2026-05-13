import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PatchNode as PatchNodeType } from '@/types/project';
import { Mic, Radio, CircleStop, Circle } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { audioEngine } from '@/audio/engine';
import { encodeWav } from '@/audio/drumEngine';
import { storeSample } from '@/samples/indexedDb';
import { uploadAsset } from '@/lib/api';

export const MicInputNode = memo(function MicInputNodeComponent(props: NodeProps) {
  const { data } = props as unknown as { data: PatchNodeType };
  const [armed, setArmed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const [waveform, setWaveform] = useState<number[]>(Array(16).fill(0));
  const rafRef = useRef<number>(0);
  const edges = useProjectStore((s) => s.edges);
  const nodes = useProjectStore((s) => s.nodes);
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);
  const addAsset = useProjectStore((s) => s.addAsset);
  const addClip = useProjectStore((s) => s.addClip);
  const addTrack = useProjectStore((s) => s.addTrack);

  const showStatus = useCallback((text: string, kind: 'success' | 'error' | 'info' = 'info', durationMs = 3000) => {
    setStatus({ text, kind });
    if (durationMs > 0) {
      setTimeout(() => setStatus(null), durationMs);
    }
  }, []);

  const handleArmToggle = useCallback(async () => {
    if (armed) {
      if (recording) {
        audioEngine.stopRecording();
        setRecording(false);
      }
      audioEngine.stopMic();
      setArmed(false);
      setWaveform(Array(16).fill(0));
      showStatus('Mic disarmed', 'info', 2000);
    } else {
      try {
        await audioEngine.resume();
        await audioEngine.startMic();
        setArmed(true);
        showStatus('Mic armed', 'info', 2000);
      } catch {
        showStatus('Mic permission denied', 'error', 4000);
      }
    }
  }, [armed, recording, showStatus]);

  const handleRecordToggle = useCallback(async () => {
    if (recording) {
      audioEngine.stopRecording();
      setRecording(false);
      showStatus('Recording stopped', 'info', 2000);
    } else {
      try {
        await audioEngine.startRecording(async (buffer) => {
          const blob = encodeWav(buffer);
          const id = `asset-${crypto.randomUUID().slice(0, 8)}`;
          const arrayBuffer = await blob.arrayBuffer();
          await storeSample(id, `Mic Take ${new Date().toLocaleTimeString()}`, arrayBuffer, 'audio/wav', {});
          let storageUrl: string | undefined;
          try {
            const res = await uploadAsset(arrayBuffer.slice(0));
            storageUrl = res.url;
          } catch {
            // Offline — stay local-only
          }
          addAsset({
            id,
            kind: 'sample',
            name: `Mic Take ${new Date().toLocaleTimeString()}`,
            mimeType: 'audio/wav',
            durationSeconds: buffer.duration,
            sampleRate: buffer.sampleRate,
            channels: buffer.numberOfChannels,
            localBlobRef: id,
            storageUrl,
          });
          // Try to create a clip on a connected workstation
          const workstationEdge = Object.values(edges).find(
            (e) => e.sourceNodeId === data.id && nodes[e.targetNodeId]?.kind === 'workstation'
          );
          if (workstationEdge) {
            const wsId = workstationEdge.targetNodeId;
            let track = Object.values(tracks).find((t) => t.workstationNodeId === wsId);
            if (!track) {
              track = {
                id: `track-${crypto.randomUUID().slice(0, 8)}`,
                name: 'Mic Track',
                workstationNodeId: wsId,
                sourceNodeId: data.id,
              };
              addTrack(track);
            }
            const existingClips = Object.values(clips).filter((c) => c.trackId === track.id);
            const lastEnd = existingClips.length
              ? Math.max(...existingClips.map((c) => c.startBeat + c.lengthBeats))
              : 0;
            addClip({
              id: `clip-${crypto.randomUUID().slice(0, 8)}`,
              trackId: track.id,
              type: 'audio',
              startBeat: lastEnd,
              lengthBeats: Math.max(1, (buffer.duration * (useProjectStore.getState().localTransport.bpm ?? 128)) / 60),
              loop: false,
              assetId: id,
            });
            showStatus('Clip saved to arrangement', 'success', 3000);
          } else {
            showStatus('Sample saved to library', 'success', 3000);
          }
        });
        setRecording(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to start recording';
        showStatus(msg, 'error', 4000);
        setRecording(false);
      }
    }
  }, [recording, data.id, edges, nodes, tracks, clips, addAsset, addClip, addTrack, showStatus]);

  useEffect(() => {
    if (!armed) return;
    const analyser = audioEngine.micAnalyser;
    if (!analyser) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteTimeDomainData(dataArray);
      const bars = 16;
      const step = Math.floor(dataArray.length / bars);
      const values = Array.from({ length: bars }, (_, i) => {
        const start = i * step;
        let sum = 0;
        for (let j = 0; j < step; j++) sum += Math.abs(dataArray[start + j] - 128);
        return sum / step / 128;
      });
      setWaveform(values);
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [armed]);

  return (
    <div className={`hayashi-patch-node hayashi-patch-node-micInput ${armed ? 'is-armed' : ''} ${recording ? 'is-recording' : ''}`}>
      <Handle type="target" position={Position.Left} className="hayashi-node-handle hayashi-node-handle-left" />
      <Handle type="source" position={Position.Right} className="hayashi-node-handle hayashi-node-handle-right" />

      <div className="hayashi-patch-node-head">
        <div className="hayashi-node-badge">
          <Mic size={14} />
          Mic
        </div>
        <div className={`hayashi-node-dot ${data.muted ? 'hayashi-node-dot-muted' : ''}`} />
      </div>

      {/* Waveform */}
      <div className="hayashi-mic-wave">
        {waveform.map((v, i) => (
          <span
            key={i}
            className="hayashi-mic-bar"
            style={{ height: `${Math.max(2, v * 20)}px` }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="hayashi-mic-controls">
        <button
          className={`hayashi-daw-tbtn ${armed ? 'is-armed' : ''}`}
          onClick={handleArmToggle}
          title={armed ? 'Disarm mic' : 'Arm mic'}
          type="button"
        >
          <Radio size={12} />
        </button>
        <button
          className={`hayashi-daw-tbtn hayashi-daw-tbtn-rec ${recording ? 'is-recording' : ''}`}
          onClick={handleRecordToggle}
          disabled={!armed}
          title={recording ? 'Stop recording' : 'Record'}
          type="button"
        >
          {recording ? <CircleStop size={12} /> : <Circle size={12} />}
        </button>
      </div>

      {status && (
        <div className={`hayashi-mic-status ${status.kind === 'error' ? 'is-error' : status.kind === 'info' ? 'is-info' : ''}`}>
          {status.text}
        </div>
      )}
    </div>
  );
});
