import { useEffect, useState, useCallback, useRef } from 'react';
import { requestMidiAccess, getMidiInputs, addMidiHandler, removeMidiHandler, parseMidiMessage } from '@/audio/midiController';

export interface MidiState {
  supported: boolean;
  available: boolean;
  inputs: MIDIInput[];
  activeInputId: string | null;
  lastCC: { cc: number; value: number } | null;
  error: string | null;
}

export function useMidiController(
  enabled: boolean,
  onParamChange: (paramName: string, value: number) => void,
  paramMap: Record<number, string>
) {
  const [state, setState] = useState<MidiState>({
    supported: typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess,
    available: false,
    inputs: [],
    activeInputId: null,
    lastCC: null,
    error: null,
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
      setState((current) => ({
        ...current,
        available: false,
        inputs: [],
        activeInputId: null,
        lastCC: null,
        error: null,
      }));
      return;
    }
    let cancelled = false;
    requestMidiAccess()
      .then(() => {
        if (cancelled) return;
        const inputs = getMidiInputs();
        setState((s) => ({
          ...s,
          supported: true,
          available: true,
          inputs,
          activeInputId: inputs[0]?.id ?? null,
          error: null,
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          supported: typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess,
          available: false,
          error: error instanceof Error ? error.message : 'Failed to access MIDI devices',
        }));
      });

    // Poll for device changes every 2s
    const interval = setInterval(() => {
      setState((s) => ({ ...s, inputs: getMidiInputs() }));
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      setState((current) => ({
        ...current,
        available: false,
        inputs: [],
        activeInputId: null,
        lastCC: null,
        error: null,
      }));
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    addMidiHandler(handler);
    return () => removeMidiHandler(handler);
  }, [enabled]);

  return state;
}
