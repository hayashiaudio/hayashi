import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PatchNode as PatchNodeType } from '@/types/project';
import { AudioLines, Copy, CheckCircle2 } from 'lucide-react';
import { midiEngine } from '@/audio/midiEngine';
// import { pairSession, unpairSession, subscribeMidiBridgeStatus, type ConnectionStatus } from '@/audio/midiBridgeClient';
import { useProjectStore } from '@/stores/projectStore';
import { generatePairingCode } from '@/lib/pairingCode';

export const MidiBridgeNode = memo(function MidiBridgeNodeComponent(props: NodeProps) {
  const { data } = props as unknown as { data: PatchNodeType };
  const updateNodeParams = useProjectStore((s) => s.updateNodeParams);

  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [lastNote, setLastNote] = useState<number | null>(null);
  const [connStatus] = useState<string>('disconnected');
  const [copied, setCopied] = useState(false);
  const rafRef = useRef<number>(0);
  const activeRef = useRef<Set<number>>(new Set());
  const pairingIdRef = useRef<string>((data.params.pairingId as string) ?? '');

  // Generate pairing code on mount if empty
  useEffect(() => {
    const currentId = (data.params.pairingId as string) ?? '';
    if (!currentId) {
      const code = generatePairingCode();
      pairingIdRef.current = code;
      updateNodeParams(data.id, { pairingId: code });
    }
  }, [data.id, data.params.pairingId, updateNodeParams]);

  // Subscribe to WebSocket connection status
  // useEffect(() => {
  //   const unsubscribe = subscribeMidiBridgeStatus((status) => {
  //     setConnStatus(status);
  //   });
  //   return unsubscribe;
  // }, []);

  // Arm/disarm midiEngine based on pairing status
  useEffect(() => {
    midiEngine.updateNodeParams(data.id, { armed: connStatus === 'connected' });
  }, [connStatus, data.id]);

  // Pair / unpair on mount/unmount and pairingId changes
  // useEffect(() => {
  //   const code = (data.params.pairingId as string) ?? '';
  //   if (code) {
  //     pairSession(code);
  //   }
  //   return () => {
  //     unpairSession(code);
  //   };
  // }, [data.id, data.params.pairingId]);

  // Listen for MIDI packets via BroadcastChannel (fallback + local events)
  useEffect(() => {
    const handlePacket = (event: MessageEvent) => {
      const pkt = event.data;
      if (!pkt || typeof pkt !== 'object') return;
      if (pkt.targetNodeId && pkt.targetNodeId !== data.id) return;

      if (pkt.type === 'noteOn' && typeof pkt.note === 'number') {
        activeRef.current.add(pkt.note);
        setLastNote(pkt.note);
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          setActiveNotes(new Set(activeRef.current));
        });
      } else if (pkt.type === 'noteOff' && typeof pkt.note === 'number') {
        activeRef.current.delete(pkt.note);
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          setActiveNotes(new Set(activeRef.current));
        });
      }
    };

    const channel = new BroadcastChannel('hayashi-midi');
    channel.addEventListener('message', handlePacket);
    return () => {
      channel.removeEventListener('message', handlePacket);
      channel.close();
      cancelAnimationFrame(rafRef.current);
    };
  }, [data.id]);

  const handleCopy = useCallback(() => {
    const code = (data.params.pairingId as string) ?? '';
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [data.params.pairingId]);

  const noteLabels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = lastNote !== null
    ? `${noteLabels[lastNote % 12]}${Math.floor(lastNote / 12) - 1}`
    : '--';

  const statusDot = connStatus === 'connected'
    ? 'hayashi-node-dot-active'
    : connStatus === 'connecting'
      ? 'hayashi-node-dot-pending'
      : '';

  const statusLabel = connStatus === 'connected'
    ? 'Connected'
    : connStatus === 'connecting'
      ? 'Pairing…'
      : 'Disconnected';

  const pairingCode = (data.params.pairingId as string) ?? '';

  return (
    <div className={`hayashi-patch-node hayashi-patch-node-midiBridge`}>
      <Handle type="target" position={Position.Left} className="hayashi-node-handle hayashi-node-handle-left" />
      <Handle type="source" position={Position.Right} className="hayashi-node-handle hayashi-node-handle-right" />

      <div className="hayashi-patch-node-head">
        <div className="hayashi-node-badge">
          <AudioLines size={14} />
          MIDI
        </div>
        <div className={`hayashi-node-dot ${statusDot} ${activeNotes.size > 0 ? 'hayashi-node-dot-active' : ''}`} />
      </div>

      <div className="hayashi-source-node-card">
        <div className="hayashi-source-node-icon" aria-hidden="true">
          <AudioLines size={18} />
        </div>
        <div className="hayashi-source-node-meta">
          <h3>MIDI Bridge</h3>
          <span>{statusLabel} · {noteName}</span>
        </div>
      </div>

      <div className="hayashi-midi-keyboard">
        {Array.from({ length: 12 }, (_, i) => {
          const noteBase = lastNote !== null ? Math.floor(lastNote / 12) * 12 : 60;
          const note = noteBase + i;
          const isActive = activeNotes.has(note);
          const isBlack = [1, 3, 6, 8, 10].includes(i);
          return (
            <div
              key={i}
              className={`hayashi-midi-key ${isBlack ? 'hayashi-midi-key-black' : 'hayashi-midi-key-white'} ${isActive ? 'hayashi-midi-key-active' : ''}`}
            />
          );
        })}
      </div>

      <div className="hayashi-pairing-section">
        <div className="hayashi-pairing-code-row">
          <input
            className="hayashi-pairing-code-input"
            readOnly
            value={pairingCode}
            title="Pairing code — enter this in the Hayashi MIDI Bridge companion app"
          />
          <button
            className="hayashi-pairing-copy-btn"
            type="button"
            onClick={handleCopy}
            title="Copy pairing code"
          >
            {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
});
