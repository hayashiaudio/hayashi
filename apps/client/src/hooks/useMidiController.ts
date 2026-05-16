import { useEffect, useState, useCallback, useRef } from 'react';
import { requestMidiAccess, getMidiInputs, addMidiHandler, removeMidiHandler, parseMidiMessage } from '@/audio/midiController';

export interface MidiState {
  available: boolean;
  inputs: MIDIInput[];
  activeInputId: string | null;
  lastCC: { cc: number; value: number } | null;
}

export function useMidiController(
  enabled: boolean,
  onParamChange: (paramName: string, value: number) => void,
  paramMap: Record<number, string>
) {
  const [state, setState] = useState<MidiState>({
    available: false,
    inputs: [],
    activeInputId: null,
    lastCC: null,
  });

  const onParamChangeRef = useRef(onParamChange);
  const paramMapRef = useRef(paramMap);
  useEffect(() => {
    onParamChangeRef.current = onParamChange;
  }, [onParamChange]);
  useEffect(() => {
    paramMapRef.current = paramMap;
  }, [paramMap]);

  const handler = useCallback((data: Uint8Array) => {
    const msg = parseMidiMessage(data);
    if (!msg) return;
    if (msg.type === 'cc') {
      setState((s) => ({ ...s, lastCC: { cc: msg.cc, value: msg.value } }));
      const paramName = paramMapRef.current[msg.cc];
      if (paramName) {
        onParamChangeRef.current(paramName, msg.value);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ available: false, inputs: [], activeInputId: null, lastCC: null });
      return;
    }
    let cancelled = false;
    requestMidiAccess()
      .then(() => {
        if (cancelled) return;
        const inputs = getMidiInputs();
        setState((s) => ({ ...s, available: true, inputs, activeInputId: inputs[0]?.id ?? null }));
      })
      .catch(() => {
        if (cancelled) return;
        setState((s) => ({ ...s, available: false }));
      });

    // Poll for device changes every 2s
    const interval = setInterval(() => {
      setState((s) => ({ ...s, inputs: getMidiInputs() }));
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      setState({ available: false, inputs: [], activeInputId: null, lastCC: null });
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    addMidiHandler(handler);
    return () => removeMidiHandler(handler);
  }, [enabled]);

  return state;
}
