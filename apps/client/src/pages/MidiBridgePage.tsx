import { useEffect, useState, useRef, useCallback } from 'react';
import { bootstrapBilling } from '@/lib/api';
import { sendMidiPacket } from '@/audio/midiEngine';
import type { BillingSnapshot } from '@/types/billing';
import { Crown, Usb, Bluetooth, Music, Radio } from 'lucide-react';

interface AuthMessage {
  type: 'HAYASHI_AUTH';
  accessToken: string;
  channelId: string;
  projectId: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Navigator {
    usb?: {
      requestDevice: (opts: { filters: unknown[] }) => Promise<any>;
    };
    bluetooth?: {
      requestDevice: (opts: { acceptAllDevices?: boolean; optionalServices?: string[] }) => Promise<any>;
    };
  }
}

export default function MidiBridgePage() {
  const params = new URLSearchParams(window.location.search);
  const channelId = params.get('channelId') ?? '';

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [targetNodeId, setTargetNodeId] = useState('');
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const deviceRef = useRef<any | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => {
      const next = [`${new Date().toLocaleTimeString()}  ${msg}`, ...prev];
      return next.slice(0, 50);
    });
  }, []);

  // Listen for auth from parent iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as AuthMessage;
      if (data?.type === 'HAYASHI_AUTH' && data.accessToken) {
        setAccessToken(data.accessToken);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Billing check
  useEffect(() => {
    if (!accessToken || !channelId) return;
    let cancelled = false;
    bootstrapBilling({ accessToken, channelId })
      .then((snapshot) => {
        if (cancelled) return;
        setBilling(snapshot);
        if (snapshot.plan !== 'unlimited') {
          setBillingError('MIDI Bridge requires the Unlimited Plan.');
        } else {
          addLog('Billing verified — Unlimited Plan active.');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setBillingError(err instanceof Error ? err.message : 'Billing check failed');
      });
    return () => { cancelled = true; };
  }, [accessToken, channelId, addLog]);

  // Web MIDI API (class-compliant devices)
  const connectWebMidi = useCallback(async () => {
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      setConnected(true);
      addLog('Web MIDI connected.');

      for (const input of access.inputs.values()) {
        input.onmidimessage = (msg) => {
          const data = msg.data;
          if (!data || data.length < 1) return;
          const status = data[0];
          const data1 = data[1] ?? 0;
          const data2 = data[2] ?? 0;
          const channel = (status & 0x0f) + 1;
          const command = status & 0xf0;

          if (command === 0x90 && data2 > 0) {
            sendMidiPacket({ targetNodeId, type: 'noteOn', note: data1, velocity: data2, channel });
            addLog(`Note On  ${data1} vel=${data2} ch=${channel}`);
          } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
            sendMidiPacket({ targetNodeId, type: 'noteOff', note: data1, channel });
            addLog(`Note Off ${data1} ch=${channel}`);
          } else if (command === 0xb0) {
            sendMidiPacket({ targetNodeId, type: 'cc', value: data2, channel });
          }
        };
        addLog(`Input ready: ${input.name ?? 'Unknown'}`);
      }

      access.onstatechange = () => {
        addLog('MIDI device state changed.');
      };
    } catch (e) {
      addLog(`Web MIDI failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [targetNodeId, addLog]);

  // WebUSB (proprietary USB MIDI devices)
  const connectWebUsb = useCallback(async () => {
    try {
      if (!('usb' in navigator)) {
        addLog('WebUSB not supported in this browser.');
        return;
      }
      const device = await (navigator as unknown as { usb: { requestDevice: (opts: unknown) => Promise<any> } }).usb.requestDevice({
        filters: [],
      });
      deviceRef.current = device;
      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);
      setConnected(true);
      addLog(`WebUSB connected: ${device.productName ?? 'Unknown'}`);

      // Poll endpoint for MIDI data (simplified — real devices need proper endpoint discovery)
      const poll = async () => {
        try {
          const result = await device.transferIn(1, 64);
          if (result.data && result.data.byteLength > 0) {
            const bytes = new Uint8Array(result.data.buffer);
            // Parse raw bytes as MIDI (device-specific mapping needed here)
            if (bytes.length >= 3 && (bytes[0] & 0xf0) === 0x90) {
              sendMidiPacket({
                targetNodeId,
                type: 'noteOn',
                note: bytes[1],
                velocity: bytes[2],
                channel: (bytes[0] & 0x0f) + 1,
              });
              addLog(`USB Note On ${bytes[1]} vel=${bytes[2]}`);
            }
          }
        } catch {
          // ignore transient errors
        }
        if (device.opened) {
          requestAnimationFrame(poll);
        }
      };
      poll();
    } catch (e) {
      addLog(`WebUSB failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [targetNodeId, addLog]);

  // WebBluetooth (BLE MIDI devices)
  const connectWebBluetooth = useCallback(async () => {
    try {
      if (!('bluetooth' in navigator)) {
        addLog('WebBluetooth not supported in this browser.');
        return;
      }
      const device = await (navigator as unknown as { bluetooth: { requestDevice: (opts: unknown) => Promise<any> } }).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['03b80e5a-ede8-4b33-a751-6ce34ec4c700'], // MIDI Service UUID
      });
      deviceRef.current = device;
      addLog(`WebBluetooth paired: ${device.name ?? 'Unknown'}`);

      const server = await device.gatt?.connect();
      if (!server) {
        addLog('GATT server unavailable.');
        return;
      }
      setConnected(true);

      const service = await server.getPrimaryService('03b80e5a-ede8-4b33-a751-6ce34ec4c700');
      const characteristic = await service.getCharacteristic('7772e5db-3868-4112-a1a9-f2669d106bf3');

      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
        const value = (event.target as any).value;
        if (!value) return;
        const bytes = new Uint8Array(value.buffer);
        // BLE MIDI parsing (simplified)
        for (let i = 0; i < bytes.length - 2; i++) {
          if ((bytes[i] & 0xf0) === 0x80 || (bytes[i] & 0xf0) === 0x90) {
            sendMidiPacket({
              targetNodeId,
              type: (bytes[i] & 0xf0) === 0x90 && bytes[i + 2] > 0 ? 'noteOn' : 'noteOff',
              note: bytes[i + 1],
              velocity: bytes[i + 2],
              channel: (bytes[i] & 0x0f) + 1,
            });
            addLog(`BLE Note ${bytes[i + 1]} vel=${bytes[i + 2]}`);
            i += 2;
          }
        }
      });

      addLog('BLE MIDI notifications started.');
    } catch (e) {
      addLog(`WebBluetooth failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [targetNodeId, addLog]);

  const disconnect = useCallback(() => {
    if (midiAccessRef.current) {
      for (const input of midiAccessRef.current.inputs.values()) {
        input.onmidimessage = null;
      }
      midiAccessRef.current = null;
    }
    const usb = deviceRef.current;
    if (usb && 'close' in usb && typeof usb.close === 'function') {
      try { usb.close(); } catch { /* ignore */ }
    }
    const bt = deviceRef.current;
    if (bt && 'gatt' in bt && bt.gatt?.connected) {
      try { bt.gatt.disconnect(); } catch { /* ignore */ }
    }
    deviceRef.current = null;
    setConnected(false);
    addLog('Disconnected.');
  }, [addLog]);

  // Paywall screen
  if (billingError) {
    return (
      <div className="hayashi-app-bg hayashi-app-grain relative flex h-screen w-screen items-center justify-center p-6">
        <div className="hayashi-surface max-w-md w-full p-8 text-center space-y-5">
          <Crown size={36} className="mx-auto text-amber-600" />
          <h1 className="hayashi-title-display text-xl">MIDI Bridge Locked</h1>
          <p className="hayashi-body text-sm">{billingError}</p>
          <p className="hayashi-body text-sm opacity-70">Upgrade to Unlimited to connect hardware MIDI controllers, guitars, and wind instruments.</p>
        </div>
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="hayashi-app-bg hayashi-app-grain relative flex h-screen w-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="hayashi-loader-ring" />
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: 'var(--hayashi-text-dim)' }}>
            Checking plan…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="hayashi-app-bg hayashi-app-grain relative flex h-screen w-screen flex-col">
      <header className="hayashi-canvas-topbar">
        <div className="hayashi-canvas-brand">
          <div className="hayashi-canvas-mark">
            <img src="/hayashi-logo.png" alt="Hayashi" />
          </div>
          <div>
            <p className="hayashi-canvas-label">MIDI Bridge</p>
            <h1 className="text-sm">{connected ? 'Connected' : 'Idle'}</h1>
          </div>
        </div>
        <div className="hayashi-canvas-actions">
          {connected && (
            <button className="hayashi-canvas-btn" type="button" onClick={disconnect}>
              <Radio size={13} />
              Disconnect
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4 overflow-y-auto">
        <div className="hayashi-surface p-4 space-y-3">
          <p className="hayashi-mini-label">Target Node</p>
          <input
            className="hayashi-input w-full"
            placeholder="Paste midiBridge node ID (or leave empty for all)"
            value={targetNodeId}
            onChange={(e) => setTargetNodeId(e.target.value)}
          />
        </div>

        <div className="hayashi-surface p-4 space-y-3">
          <p className="hayashi-mini-label">Connect Device</p>
          <div className="grid grid-cols-3 gap-2">
            <button className="hayashi-canvas-btn justify-center" type="button" onClick={connectWebMidi}>
              <Music size={14} />
              Web MIDI
            </button>
            <button className="hayashi-canvas-btn justify-center" type="button" onClick={connectWebUsb}>
              <Usb size={14} />
              WebUSB
            </button>
            <button className="hayashi-canvas-btn justify-center" type="button" onClick={connectWebBluetooth}>
              <Bluetooth size={14} />
              Bluetooth
            </button>
          </div>
        </div>

        <div className="hayashi-surface p-4 flex-1">
          <p className="hayashi-mini-label mb-2">Activity Log</p>
          <div className="font-mono text-xs space-y-1 max-h-48 overflow-y-auto"
            style={{ color: 'var(--hayashi-text-dim)' }}
          >
            {logs.length === 0 && <span className="opacity-50">No events yet…</span>}
            {logs.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
