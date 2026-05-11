import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { ArrangementGrid } from './ArrangementGrid';
import { audioEngine } from '@/audio/engine';
import { transportScheduler } from '@/audio/transportScheduler';
import type { PatchNode, Track, NodeKind } from '@/types/project';
import { Play, Square, Plus, CircleDot, Volume2, VolumeX, Disc3, Mic, Trash2 } from 'lucide-react';
import { updateTrackBus } from '@/audio/graphCompiler';
import { encodeWav } from '@/audio/drumEngine';
import { storeSample } from '@/samples/indexedDb';

const SKIP_AUTO_TRACK_KINDS: Set<NodeKind> = new Set(['oscillator', 'noise']);

function getNodeColor(kind: NodeKind): string {
  switch (kind) {
    case 'sampler':
    case 'drumPad':
    case 'micInput':
      return '#8fb13a';
    case 'oscillator':
    case 'noise':
      return '#6f7b5d';
    default:
      return '#ed922f';
  }
}

export function WorkstationEditor({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const edges = useProjectStore((s) => s.edges);
  const nodes = useProjectStore((s) => s.nodes);
  const transport = useProjectStore((s) => s.localTransport);
  const updateTransport = useProjectStore((s) => s.updateLocalTransport);
  const moveClip = useProjectStore((s) => s.moveClip);
  const updateClipTiming = useProjectStore((s) => s.updateClipTiming);
  const splitClip = useProjectStore((s) => s.splitClip);
  const addClip = useProjectStore((s) => s.addClip);
  const addTrack = useProjectStore((s) => s.addTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeClip = useProjectStore((s) => s.removeClip);
  const addAsset = useProjectStore((s) => s.addAsset);
  const assets = useProjectStore((s) => s.assets);

  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [recording, setRecording] = useState(false);
  const manuallyRemovedSources = useRef<Set<string>>(new Set());

  const nodeTracks = Object.values(tracks).filter((t) => t.workstationNodeId === nodeId);
  const nodeClips = Object.values(clips).filter((c) =>
    nodeTracks.some((t) => t.id === c.trackId)
  );

  /* Auto-populate source-backed tracks from incoming connections.
     Skip pure synthesis sources (oscillator, noise) to avoid
     duplicating oscillation lanes. Only sample-based / event sources
     get their own track automatically.
     We read tracks from getState() to avoid depending on nodeTracks
     in the effect deps, which would re-fire every time addTrack runs. */
  useEffect(() => {
    const incomingEdges = Object.values(edges).filter((e) => e.targetNodeId === nodeId);
    const incomingSources = incomingEdges
      .map((e) => nodes[e.sourceNodeId])
      .filter(Boolean);

    const existingTracks = Object.values(useProjectStore.getState().tracks).filter(
      (t) => t.workstationNodeId === nodeId
    );

    let created = false;
    for (const source of incomingSources) {
      if (SKIP_AUTO_TRACK_KINDS.has(source.kind)) continue;
      if (manuallyRemovedSources.current.has(source.id)) continue;
      const track = existingTracks.find((t) => t.sourceNodeId === source.id);
      if (!track) {
        addTrack({
          id: `track-${crypto.randomUUID().slice(0, 8)}`,
          name: source.id,
          workstationNodeId: nodeId,
          sourceNodeId: source.id,
          armed: false,
        });
        created = true;
      }
    }

    if (!created && existingTracks.length === 0) {
      addTrack({
        id: `track-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Arrangement 1',
        workstationNodeId: nodeId,
        armed: false,
      });
    }
  }, [nodeId, edges, nodes, addTrack]);

  /* Remove auto-created tracks when their source node is deleted or
     disconnected from this workstation. Also remove orphaned clips. */
  useEffect(() => {
    const state = useProjectStore.getState();
    const tracksForNode = Object.values(state.tracks).filter(
      (t) => t.workstationNodeId === nodeId && t.sourceNodeId
    );

    const currentIncomingEdgeSourceIds = new Set(
      Object.values(state.edges)
        .filter((e) => e.targetNodeId === nodeId)
        .map((e) => e.sourceNodeId)
    );

    for (const track of tracksForNode) {
      const sourceStillExists = track.sourceNodeId && state.nodes[track.sourceNodeId];
      const sourceStillConnected = track.sourceNodeId && currentIncomingEdgeSourceIds.has(track.sourceNodeId);
      if (!sourceStillExists || !sourceStillConnected) {
        // Remove clips on this track first
        Object.values(state.clips)
          .filter((c) => c.trackId === track.id)
          .forEach((c) => removeClip(c.id));
        removeTrack(track.id);
      }
    }
  }, [nodeId, edges, nodes, removeTrack, removeClip]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const state = useProjectStore.getState().localTransport;
      if (state.playing) {
        setPlayheadBeat(transportScheduler.currentBeat);
      } else {
        setPlayheadBeat(state.beatOffset);
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, []);

  const togglePlay = useCallback(async () => {
    await audioEngine.resume().catch(() => {});
    updateTransport({ playing: !transport.playing });
  }, [transport.playing, updateTransport]);

  /* ── Recording ── */
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingClipIdsRef = useRef<string[]>([]);
  const recordStartBeatRef = useRef(0);
  const recordRafRef = useRef(0);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    recorder.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    cancelAnimationFrame(recordRafRef.current);

    const chunks = recordingChunksRef.current;
    if (chunks.length === 0) {
      recordingClipIdsRef.current.forEach((id) => removeClip(id));
      recordingClipIdsRef.current = [];
      return;
    }

    const blob = new Blob(chunks, { type: recorder.mimeType });
    const ctx = audioEngine.ctx;
    if (!ctx) return;

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const wavBlob = encodeWav(audioBuffer);

    const assetId = `asset-${crypto.randomUUID().slice(0, 8)}`;
    const wavArrayBuffer = await wavBlob.arrayBuffer();
    await storeSample(
      assetId,
      'Recording',
      wavArrayBuffer,
      'audio/wav',
      {
        durationSeconds: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
      }
    );

    addAsset({
      id: assetId,
      kind: 'sample',
      name: 'Recording',
      mimeType: 'audio/wav',
      durationSeconds: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    });

    for (const clipId of recordingClipIdsRef.current) {
      const clip = useProjectStore.getState().clips[clipId];
      if (clip) {
        updateClipTiming(clipId, clip.startBeat, Math.max(1, Math.round((audioBuffer.duration * transport.bpm) / 60)));
      }
    }

    recordingChunksRef.current = [];
    recordingClipIdsRef.current = [];
  }, [removeClip, addAsset, updateClipTiming, transport.bpm]);

  const startRecording = useCallback(async () => {
    await audioEngine.resume().catch(() => {});
    if (!transport.playing) {
      updateTransport({ playing: true });
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorderRef.current = recorder;
    recordingChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordingChunksRef.current.push(e.data);
    };

    const armedTracks = nodeTracks.filter((t) => t.armed);
    if (armedTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const startBeat = Math.max(0, Math.round(playheadBeat));
    recordStartBeatRef.current = startBeat;
    const clipIds: string[] = [];

    for (const track of armedTracks) {
      const clipId = `clip-${crypto.randomUUID().slice(0, 8)}`;
      clipIds.push(clipId);
      addClip({
        id: clipId,
        trackId: track.id,
        type: 'audio',
        startBeat,
        lengthBeats: 1,
        loop: false,
      });
    }
    recordingClipIdsRef.current = clipIds;

    recorder.start(100);
    setRecording(true);

    const tick = () => {
      const state = useProjectStore.getState().localTransport;
      const elapsedBeats = Math.max(1, Math.round(transportScheduler.currentBeat - recordStartBeatRef.current));
      for (const clipId of recordingClipIdsRef.current) {
        const clip = useProjectStore.getState().clips[clipId];
        if (clip) {
          useProjectStore.getState().updateClipTiming(clipId, clip.startBeat, elapsedBeats);
        }
      }
      if (state.playing && recording) {
        recordRafRef.current = requestAnimationFrame(tick);
      }
    };
    recordRafRef.current = requestAnimationFrame(tick);
  }, [nodeTracks, playheadBeat, transport.playing, updateTransport, addClip, recording]);

  const toggleRecord = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecording]);

  const handleAssetDrop = useCallback(
    (assetId: string, trackId: string, startBeat: number) => {
      const asset = assets[assetId];
      const durationSeconds = asset?.durationSeconds ?? 4;
      const lengthBeats = Math.max(1, Math.round((durationSeconds * transport.bpm) / 60));

      addClip({
        id: `clip-${crypto.randomUUID().slice(0, 8)}`,
        trackId,
        type: 'audio',
        startBeat,
        lengthBeats,
        loop: false,
        assetId,
      });
    },
    [addClip, assets, transport.bpm]
  );

  const handleAddTrack = useCallback(() => {
    const count = nodeTracks.length;
    addTrack({
      id: `track-${crypto.randomUUID().slice(0, 8)}`,
      name: `Arrangement ${count + 1}`,
      workstationNodeId: nodeId,
      armed: false,
    });
  }, [addTrack, nodeTracks.length, nodeId]);

  const handleRemoveTrack = useCallback(
    (track: Track) => {
      if (track.sourceNodeId) {
        manuallyRemovedSources.current.add(track.sourceNodeId);
      }
      const clipsToRemove = nodeClips.filter((c) => c.trackId === track.id);
      clipsToRemove.forEach((c) => removeClip(c.id));
      removeTrack(track.id);
    },
    [nodeClips, removeClip, removeTrack]
  );

  const handleSeekToBeat = useCallback((beat: number) => {
    setPlayheadBeat(beat);
    updateTransport({ beatOffset: beat });
  }, [updateTransport]);

  const getSourceNode = useCallback(
    (track: Track): PatchNode | null => (track.sourceNodeId ? nodes[track.sourceNodeId] ?? null : null),
    [nodes]
  );

  const getSourceAssetId = useCallback((source: PatchNode | null) => {
    if (!source) return undefined;
    if (typeof source.params.assetId === 'string') return source.params.assetId;
    if (typeof source.params.sample === 'string') return source.params.sample;
    return undefined;
  }, []);

  const handleToggleArm = useCallback(
    (track: Track) => {
      updateTrack(track.id, { armed: !track.armed });
    },
    [updateTrack]
  );

  const handlePrintClip = useCallback(
    (track: Track) => {
      const source = getSourceNode(track);
      const assetId = getSourceAssetId(source);
      const asset = assetId ? assets[assetId] : undefined;

      const startBeat = Math.max(0, Math.round(playheadBeat));
      const lengthBeats = asset
        ? Math.max(1, Math.round((asset.durationSeconds * transport.bpm) / 60))
        : 4;

      addClip({
        id: `clip-${crypto.randomUUID().slice(0, 8)}`,
        trackId: track.id,
        type: 'audio',
        startBeat,
        lengthBeats,
        loop: Boolean(source?.params.loop),
        assetId,
      });
    },
    [addClip, assets, getSourceAssetId, getSourceNode, playheadBeat, transport.bpm]
  );

  const handleTrackGainChange = useCallback(
    (trackId: string, value: number) => {
      updateTrack(trackId, { gain: value });
      updateTrackBus(trackId, value, undefined, undefined);
    },
    [updateTrack]
  );

  const handleTrackPanChange = useCallback(
    (trackId: string, value: number) => {
      updateTrack(trackId, { pan: value });
      updateTrackBus(trackId, undefined, value, undefined);
    },
    [updateTrack]
  );

  const handleTrackMuteToggle = useCallback(
    (track: Track) => {
      const next = !track.muted;
      updateTrack(track.id, { muted: next });
      updateTrackBus(track.id, undefined, undefined, next);
    },
    [updateTrack]
  );

  const handleBounceTrack = useCallback(
    async (track: Track) => {
      const source = getSourceNode(track);
      if (!source) return;
      if (!SKIP_AUTO_TRACK_KINDS.has(source.kind)) return;

      const ctx = audioEngine.ctx;
      if (!ctx) return;

      const durationBeats = 4;
      const durationSeconds = (durationBeats * 60) / transport.bpm;
      const sampleRate = ctx.sampleRate;
      const frames = Math.ceil(durationSeconds * sampleRate);

      const offline = new OfflineAudioContext(2, frames, sampleRate);

      if (source.kind === 'oscillator') {
        const osc = offline.createOscillator();
        osc.type = (source.params.type as OscillatorType) ?? 'sine';
        osc.frequency.value = (source.params.frequency as number) ?? 440;
        const gain = offline.createGain();
        gain.gain.value = (source.params.gain as number) ?? 0.5;
        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start();
      } else if (source.kind === 'noise') {
        const bufferSize = offline.sampleRate * 2;
        const buffer = offline.createBuffer(1, bufferSize, offline.sampleRate);
        const data = buffer.getChannelData(0);
        const type = (source.params.type as string) ?? 'white';
        for (let i = 0; i < bufferSize; i++) {
          let v = Math.random() * 2 - 1;
          if (type === 'pink') {
            v = (v + (i > 0 ? data[i - 1] : 0)) / 2;
          } else if (type === 'brown') {
            const last = i > 0 ? data[i - 1] : 0;
            v = (last + (v * 0.02)) / 1.02;
          }
          data[i] = v;
        }
        const src = offline.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const gain = offline.createGain();
        gain.gain.value = (source.params.gain as number) ?? 0.3;
        src.connect(gain);
        gain.connect(offline.destination);
        src.start();
      } else {
        return;
      }

      const rendered = await offline.startRendering();
      const blob = encodeWav(rendered);
      const assetId = `asset-${crypto.randomUUID().slice(0, 8)}`;
      const arrayBuffer = await blob.arrayBuffer();
      await storeSample(
        assetId,
        `${source.kind} bounce`,
        arrayBuffer,
        'audio/wav',
        {
          durationSeconds: rendered.duration,
          sampleRate: rendered.sampleRate,
          channels: rendered.numberOfChannels,
        }
      );

      addAsset({
        id: assetId,
        kind: 'sample',
        name: `${source.kind} bounce`,
        mimeType: 'audio/wav',
        durationSeconds: rendered.duration,
        sampleRate: rendered.sampleRate,
        channels: rendered.numberOfChannels,
      });

      addClip({
        id: `clip-${crypto.randomUUID().slice(0, 8)}`,
        trackId: track.id,
        type: 'audio',
        startBeat: Math.max(0, Math.round(playheadBeat)),
        lengthBeats: durationBeats,
        loop: false,
        assetId,
      });
    },
    [getSourceNode, transport.bpm, playheadBeat, addClip, addAsset]
  );

  const getTrackSourceKind = useCallback(
    (trackId: string): string | undefined => {
      const track = nodeTracks.find((t) => t.id === trackId);
      if (!track?.sourceNodeId) return undefined;
      return nodes[track.sourceNodeId]?.kind;
    },
    [nodeTracks, nodes]
  );

  const renderTrackHeader = useCallback(
    (track: Track) => {
      const source = getSourceNode(track);
      const assetId = getSourceAssetId(source);
      const asset = assetId ? assets[assetId] : undefined;
      const color = source ? getNodeColor(source.kind) : 'rgba(245,230,200,0.4)';
      const isContinuous = source ? SKIP_AUTO_TRACK_KINDS.has(source.kind) : false;

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '3px 8px',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          {/* Top row: dot + name + kind badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <div
              title={source?.kind ?? 'Clip lane'}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
                boxShadow: `0 0 6px ${color}`,
              }}
            />
            <span
              title={track.name}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: "'Poppins', Arial, sans-serif",
                fontSize: '0.72rem',
                letterSpacing: '0.02em',
                color: 'rgba(16, 38, 29, 0.9)',
              }}
            >
              {track.name}
            </span>
            {asset && (
              <span title={asset.name} style={{ flexShrink: 0, color: 'rgba(16, 38, 29, 0.42)' }}>
                <Disc3 size={10} />
              </span>
            )}
            {isContinuous && (
              <span
                style={{
                  flexShrink: 0,
                  fontSize: '0.58rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'rgba(16, 38, 29, 0.45)',
                }}
              >
                {source?.kind}
              </span>
            )}
          </div>

          {/* Bottom row: faders + buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
            }}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={track.gain ?? 1}
              onChange={(e) => handleTrackGainChange(track.id, parseFloat(e.target.value))}
              title={`Gain: ${Math.round((track.gain ?? 1) * 100)}%`}
              className="hayashi-track-fader"
              style={{ width: 60, flexShrink: 0 }}
            />
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={track.pan ?? 0}
              onChange={(e) => handleTrackPanChange(track.id, parseFloat(e.target.value))}
              title={`Pan: ${track.pan ?? 0}`}
              className="hayashi-track-fader"
              style={{ width: 48, flexShrink: 0 }}
            />

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <button
                className={`hayashi-workstation-toggle ${track.muted ? 'is-muted' : ''}`}
                onClick={() => handleTrackMuteToggle(track)}
                type="button"
                title={track.muted ? 'Unmute track' : 'Mute track'}
                style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}
              >
                {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
              </button>

              <button
                className={`hayashi-workstation-toggle ${track.armed ? 'is-armed' : ''}`}
                onClick={() => handleToggleArm(track)}
                type="button"
                title={track.armed ? 'Disarm recording lane' : 'Arm recording lane'}
                style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}
              >
                <CircleDot size={11} />
              </button>

              {isContinuous && (
                <button
                  className="hayashi-workstation-toggle is-print"
                  onClick={() => handleBounceTrack(track)}
                  type="button"
                  title="Bounce continuous source to clip"
                  style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}
                >
                  <Mic size={11} />
                </button>
              )}

              {source && (
                <button
                  className="hayashi-workstation-toggle is-print"
                  onClick={() => handlePrintClip(track)}
                  type="button"
                  title="Print a clip at the playhead"
                  style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}
                >
                  <Plus size={11} />
                </button>
              )}

              <button
                className="hayashi-workstation-toggle"
                onClick={() => handleRemoveTrack(track)}
                type="button"
                title="Remove track"
                style={{ width: 22, height: 22, padding: 0, justifyContent: 'center', color: 'rgba(165,67,67,0.75)' }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        </div>
      );
    },
    [
      assets,
      getSourceAssetId,
      getSourceNode,
      handlePrintClip,
      handleToggleArm,
      handleTrackGainChange,
      handleTrackPanChange,
      handleTrackMuteToggle,
      handleBounceTrack,
      handleRemoveTrack,
    ]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="hayashi-surface"
        style={{
          width: 'min(1100px, 94vw)',
          height: 'min(720px, 85vh)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="hayashi-panel-header" style={{ flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <span className="hayashi-kicker-app">Workstation</span>
            <strong className="hayashi-title-display" style={{ fontSize: '1rem' }}>
              {nodeId}
            </strong>
          </div>
          <div className="flex items-center gap-2">
            <button className="hayashi-daw-tbtn" onClick={togglePlay}>
              {transport.playing ? <Square size={14} /> : <Play size={14} />}
            </button>
            <button
              className={`hayashi-daw-tbtn hayashi-daw-tbtn-rec ${recording ? 'is-recording' : ''}`}
              onClick={toggleRecord}
              type="button"
              title={recording ? 'Stop recording' : 'Start recording'}
            >
              <CircleDot size={14} />
            </button>
            <button className="hayashi-btn-ghost hayashi-button-xs" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: '1px solid var(--hayashi-border)', flexShrink: 0 }}>
          <div className="flex items-center gap-2">
            <span className="hayashi-status-pill hayashi-status-pill-bpm">{transport.bpm} BPM</span>
            <span className="hayashi-status-pill">{nodeTracks.length} {nodeTracks.length === 1 ? 'track' : 'tracks'}</span>
            <span className="hayashi-status-pill">{nodeClips.length} {nodeClips.length === 1 ? 'clip' : 'clips'}</span>
          </div>
          <span
            style={{
              fontSize: '0.68rem',
              color: 'var(--hayashi-text-dim)',
              letterSpacing: '0.02em',
            }}
          >
            {nodeTracks.length > 0 ? 'Scroll or drag to navigate' : 'Add tracks to start'}
          </span>
          <button
            className="hayashi-btn-ghost hayashi-button-xs ml-auto"
            onClick={handleAddTrack}
          >
            <Plus size={12} /> Add Track
          </button>
        </div>

        {/* Arrangement */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {nodeTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 opacity-60">
              <p className="text-sm">No tracks yet.</p>
              <button className="hayashi-btn-ghost hayashi-button-xs" onClick={handleAddTrack}>
                <Plus size={12} /> Add Track
              </button>
            </div>
          ) : (
            <ArrangementGrid
              clips={nodeClips}
              tracks={nodeTracks}
              bpm={transport.bpm}
              playheadBeat={playheadBeat}
              onClipMove={moveClip}
              onClipResize={updateClipTiming}
              onClipSplit={splitClip}
              onClipDelete={removeClip}
              onAssetDrop={handleAssetDrop}
              onSeekToBeat={handleSeekToBeat}
              renderTrackHeader={renderTrackHeader}
              getTrackSourceKind={getTrackSourceKind}
            />
          )}
        </div>
      </div>
    </div>
  );
}
