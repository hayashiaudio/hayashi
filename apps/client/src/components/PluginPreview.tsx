import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Play, Download, Code2, Copy, Check, Square, Loader2, Sparkles, Mic, Speaker, Music, AudioWaveform, Upload, Share2 } from 'lucide-react';
import { usePluginStore } from '@/stores/pluginStore';
import { usePluginPreview } from '@/hooks/usePluginPreview';
import { useAudioAnalysis } from '@/hooks/useAudioAnalysis';
import { PreviewPlayer } from './PreviewPlayer';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import { FeatureReadouts } from './FeatureReadouts';
import { BUILD_TARGET_OPTIONS, labelForBuildTarget, startExportBuild, type BuildTarget } from '@/lib/api';
import { useClerkToken } from '@/hooks/useClerkToken';
import { MidiDeviceSelector } from './MidiDeviceSelector';
import { applyPreviewParam, getCurrentFaustNode } from '@/audio/previewEngine';
import { audioEngine } from '@/audio/engine';
import { addMidiHandler, parseMidiMessage, removeMidiHandler, requestMidiAccess } from '@/audio/midiController';
import { isPolyNode } from '@/audio/faustCompiler';
import { useBuildStore } from '@/stores/buildStore';
import { useSessionStore } from '@/stores/sessionStore';
import { PluginUiRenderer } from './plugin-ui/PluginUiRenderer';

const C = {
  border: 'rgba(255,255,255,0.06)',
  accent: '#ff8c61',
  text: '#e5e5e5',
  textMuted: '#737373',
  textDim: '#525252',
  void: '#0a0a0a',
} as const;

interface PluginPreviewProps {
  onRefine: (instruction: string) => void;
  refining: boolean;
  publicMode?: boolean;
}

export function PluginPreview({ onRefine, refining, publicMode = false }: PluginPreviewProps) {
  const { plugins, activePluginId, setPreviewMode, setPreviewSample, updatePluginParams, updatePluginFromVersion } = usePluginStore();
  const { previewPlaying, compiling, toggle } = usePluginPreview();
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [exportTarget, setExportTarget] = useState<BuildTarget>('vst3-windows-x64');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const sampleInputRef = useRef<HTMLInputElement | null>(null);
  const { getToken } = useClerkToken();
  const builds = useBuildStore((s) => s.builds);
  const upsertBuild = useBuildStore((s) => s.upsertBuild);
  const analysis = useAudioAnalysis(previewPlaying);
  const sessionLocked = useSessionStore((s) => s.locked);

  const plugin = plugins.find((p) => p.id === activePluginId);

  // MIDI param mapping: CC 20+ maps to plugin params
  const paramMap = useMemo(() => {
    const map: Record<number, string> = {};
    plugin?.params?.forEach((p, i) => {
      map[20 + i] = p.name;
    });
    return map;
  }, [plugin?.params]);

  const handleParamChange = useCallback((name: string, value: number) => {
    if (!plugin) return;
    const param = plugin.params.find((p) => p.name === name);
    if (param) {
      const newValue = param.min + value * (param.max - param.min);
      if (previewPlaying) {
        applyPreviewParam(name, newValue, getCurrentFaustNode());
      }
      const newParams = plugin.params.map((p) =>
        p.name === name ? { ...p, value: newValue } : p
      );
      updatePluginParams(plugin.id, newParams);
    }
  }, [plugin?.id, plugin?.params, previewPlaying, updatePluginParams]);

  // Mic preview lifecycle
  useEffect(() => {
    if (plugin?.type === 'effect' && plugin.previewMode === 'midi') {
      setPreviewMode(plugin.id, 'loop');
    }
  }, [plugin?.id, plugin?.type, plugin?.previewMode, setPreviewMode]);

  useEffect(() => {
    if (plugin?.previewMode === 'mic' && previewPlaying) {
      const node = getCurrentFaustNode();
      if (node) {
        audioEngine.startMicPreview(node).catch((err) => {
          console.warn('[Hayashi] Mic preview failed:', err);
          setMicError(err instanceof Error ? err.message : 'Mic preview failed');
        });
      }
    } else {
      audioEngine.stopMicPreview();
      setMicError(null);
    }
    return () => {
      audioEngine.stopMicPreview();
    };
  }, [plugin?.previewMode, previewPlaying, plugin?.id]);

  useEffect(() => {
    if (plugin?.previewMode !== 'midi' || !previewPlaying) {
      setMidiError(null);
      return;
    }

    const node = getCurrentFaustNode();
    if (!node) return;

    const handleMidi = (data: Uint8Array) => {
      const msg = parseMidiMessage(data);
      if (!msg) return;

      if (msg.type === 'noteOn') {
        if (isPolyNode(node)) {
          node.keyOn(msg.channel, msg.note, Math.round(msg.velocity * 127));
        } else {
          const freq = 440 * Math.pow(2, (msg.note - 69) / 12);
          const monoNode = node as any;
          monoNode.setParamValue?.('/freq', freq);
          monoNode.setParamValue?.('freq', freq);
          monoNode.setParamValue?.('/gate', 1);
          monoNode.setParamValue?.('gate', 1);
          monoNode.setParamValue?.('/gain', msg.velocity);
          monoNode.setParamValue?.('gain', msg.velocity);
        }
        return;
      }

      if (msg.type === 'noteOff') {
        if (isPolyNode(node)) {
          node.keyOff(msg.channel, msg.note, 0);
        } else {
          const monoNode = node as any;
          monoNode.setParamValue?.('/gate', 0);
          monoNode.setParamValue?.('gate', 0);
        }
      }
    };

    addMidiHandler(handleMidi);
    return () => removeMidiHandler(handleMidi);
  }, [plugin?.previewMode, previewPlaying, plugin?.id]);

  if (!plugin || plugin.status !== 'ready') return null;
  const activePreviewMode = plugin.type === 'effect' && plugin.previewMode === 'midi'
    ? 'loop'
    : (plugin.previewMode ?? 'loop');
  const previewModes = plugin.type === 'effect'
    ? (['loop', 'sample', 'mic'] as const)
    : (['loop', 'midi', 'mic'] as const);

  const currentVersion = plugin.currentVersionId
    ? plugin.versions.find((version) => version.id === plugin.currentVersionId) ?? plugin.versions[0]
    : plugin.versions[0];
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/share?plugin=${encodeURIComponent(plugin.id)}`
    : `/share?plugin=${encodeURIComponent(plugin.id)}`;
  const currentBuild = builds.find((build) =>
    build.pluginId === plugin.id &&
    build.versionId === (currentVersion?.id ?? '') &&
    build.target === exportTarget &&
    (build.status === 'queued' || build.status === 'running')
  ) ?? null;
  const snapshotFeatures = currentVersion?.features ?? null;
  const displayFeatures = previewPlaying
    ? {
        centroid: analysis.centroid,
        rms: analysis.rms,
        zcr: analysis.zcr,
        peakDb: analysis.peakDb,
      }
    : snapshotFeatures
      ? {
          centroid: snapshotFeatures.centroid,
          rms: snapshotFeatures.rms,
          zcr: snapshotFeatures.zcr,
          peakDb: snapshotFeatures.peakDb,
        }
      : {
          centroid: 0,
          rms: 0,
          zcr: 0,
          peakDb: -Infinity,
        };

  const handleCopy = () => {
    navigator.clipboard.writeText(plugin.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const handleSelectPreviewMode = async (mode: 'loop' | 'midi' | 'mic') => {
    if (!plugin) return;

    if (previewPlaying) {
      toggle();
    }

    if (mode === 'midi') {
      try {
        await requestMidiAccess();
        setMidiError(null);
      } catch (error) {
        setMidiError(error instanceof Error ? error.message : 'Failed to access MIDI devices');
      }
    }

    if (mode === 'mic') {
      try {
        await audioEngine.startMic();
        audioEngine.stopMic();
        setMicError(null);
      } catch (error) {
        setMicError(error instanceof Error ? error.message : 'Microphone not available');
      }
    }

    setPreviewMode(plugin.id, mode);
  };

  const handleSelectEnhancedPreviewMode = async (mode: 'loop' | 'midi' | 'mic' | 'sample') => {
    if (mode === 'sample') {
      setSampleError(null);
      if (previewPlaying) {
        toggle();
      }
      setPreviewMode(plugin.id, mode);
      return;
    }
    return handleSelectPreviewMode(mode);
  };

  const handleSampleFile = async (file: File | null) => {
    if (!plugin || !file) return;
    const isSupportedType = file.type === 'audio/wav' || file.type === 'audio/x-wav' || file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name) || /\.wav$/i.test(file.name);
    if (!isSupportedType) {
      setSampleError('Upload a WAV or MP3 file for sample preview.');
      return;
    }

    if (previewPlaying) {
      toggle();
    }

    try {
      await audioEngine.init();
      await audioEngine.resume();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await audioEngine.ctx!.decodeAudioData(arrayBuffer.slice(0));
      setPreviewSample(plugin.id, file.name, decoded);
      setPreviewMode(plugin.id, 'sample');
      setSampleError(null);
    } catch (error) {
      console.error('[Hayashi] Sample preview load failed:', error);
      setSampleError(error instanceof Error ? error.message : 'Failed to decode sample file');
    }
  };

  const handleExport = async () => {
    if (!plugin.faustCode || exporting) return;
    const token = await getToken();
    if (!token) {
      setExportError('Please sign in to export plugins');
      return;
    }
    setExporting(true);
    try {
      const result = await startExportBuild({
        token,
        pluginName: plugin.name,
        pluginId: plugin.id,
        version: `v${currentVersion?.versionNumber ?? 1}`,
        versionId: currentVersion?.id,
        faustCode: plugin.faustCode,
        format: exportTarget.startsWith('vst3-') ? 'vst3' : 'clap',
        target: exportTarget,
      });
      upsertBuild(result);
      setExportError(null);
    } catch (err) {
      console.error('[Hayashi] Export failed:', err);
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-12 max-w-6xl mx-auto">
      <div className="rounded-[28px] border p-4 sm:p-6 lg:p-8 animate-slide-up" style={{ borderColor: C.border, background: '#111111' }}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between mb-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h2 className="text-2xl sm:text-3xl font-bold leading-[0.95] text-[#f2eeea] break-words" style={{ overflowWrap: 'anywhere' }}>
                {plugin.name}
              </h2>
              <Badge variant="outline" className="h-6 px-3 text-[10px] border-[#525252] text-[#8e8e8e] rounded-full capitalize">{plugin.type}</Badge>
            </div>
            <p className="text-xs sm:text-sm text-[#646464] font-mono leading-relaxed break-words max-w-3xl" style={{ overflowWrap: 'anywhere' }}>
              {plugin.prompt}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:max-w-[32rem]">
            <Button variant="outline" size="sm" className="h-10 px-4 text-[11px] border-[#525252] text-[#737373] hover:text-[#e5e5e5] rounded-xl gap-1.5" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            {!publicMode && (
              <Button variant="outline" size="sm" className="h-10 px-4 text-[11px] border-[#525252] text-[#737373] hover:text-[#e5e5e5] rounded-xl gap-1.5" onClick={handleShare}>
                {shareCopied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                {shareCopied ? 'Link Copied' : 'Share'}
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 px-4 text-[11px] border-[#ff8c61]/30 text-[#ff8c61] hover:bg-[#ff8c61]/10 rounded-xl gap-1.5" onClick={() => setShowSource((s) => !s)}>
                  <Code2 className="h-3.5 w-3.5" /> FAUST
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{showSource ? 'Hide Source' : 'View Source'}</TooltipContent>
            </Tooltip>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {plugin.versions.length > 1 && (
                <select
                  aria-label="Plugin version"
                  value={currentVersion?.id ?? ''}
                  onChange={(e) => updatePluginFromVersion(plugin.id, e.target.value)}
                  className="h-10 min-w-[8.5rem] text-[11px] bg-transparent border border-[#525252] text-[#a1a1a1] rounded-xl px-3 outline-none"
                >
                  {plugin.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {`Version ${version.versionNumber}`}
                    </option>
                  ))}
                </select>
              )}
              {!publicMode && (
                <select
                  aria-label="Export format"
                  value={exportTarget}
                  onChange={(e) => setExportTarget(e.target.value as BuildTarget)}
                  className="h-10 min-w-[12rem] text-[11px] bg-transparent border border-[#525252] text-[#a1a1a1] rounded-xl px-3 outline-none"
                >
                  {BUILD_TARGET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {!publicMode && (
                <Button
                  size="sm"
                  className="h-10 px-5 text-[11px] font-bold rounded-xl gap-1.5"
                  style={{ background: C.accent, color: C.void }}
                  onClick={handleExport}
                  disabled={exporting || !plugin.faustCode || !!currentBuild}
                  aria-label={exporting || currentBuild ? 'Export build in progress' : 'Export plugin'}
                  aria-busy={exporting || !!currentBuild}
                  title={labelForBuildTarget(exportTarget)}
                >
                  {exporting || currentBuild ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {exporting ? 'QUEUING...' : currentBuild ? `${currentBuild.stage.replace(/_/g, ' ').toUpperCase()}...` : 'EXPORT'}
                </Button>
              )}
            </div>
            {!publicMode && exportError && (
              <div className="w-full text-[11px] text-[#ff6a55] lg:text-right">{exportError}</div>
            )}
          </div>
        </div>

        <div className="rounded-xl p-4 mb-6 space-y-3" style={{ background: C.void, border: `1px solid ${C.border}` }}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {previewModes.map((mode) => (
              <button
                key={mode}
                onClick={() => { void handleSelectEnhancedPreviewMode(mode); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all"
                style={{
                  background: activePreviewMode === mode ? 'rgba(255,140,97,0.12)' : 'transparent',
                  color: activePreviewMode === mode ? '#ff8c61' : '#737373',
                  border: `1px solid ${activePreviewMode === mode ? 'rgba(255,140,97,0.30)' : 'rgba(255,255,255,0.06)'}`
                }}
              >
                {mode === 'loop' && <Music size={12} />}
                {mode === 'midi' && <Speaker size={12} />}
                {mode === 'mic' && <Mic size={12} />}
                {mode === 'sample' && <AudioWaveform size={12} />}
                {mode.toUpperCase()}
              </button>
            ))}
          </div>

          {plugin.type === 'effect' && activePreviewMode === 'sample' && (
            <div className="rounded-xl border px-3 py-3" style={{ borderColor: C.border, background: 'rgba(255,255,255,0.02)' }}>
              <input
                ref={sampleInputRef}
                type="file"
                accept=".wav,.mp3,audio/wav,audio/mpeg"
                className="hidden"
                onChange={(e) => { void handleSampleFile(e.target.files?.[0] ?? null); }}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-wider text-[#737373]">UPLOAD SAMPLE</div>
                  <div className="mt-1 text-[11px] font-mono text-[#e5e5e5] break-words" style={{ overflowWrap: 'anywhere' }}>
                    {plugin.previewSampleName ?? 'No sample loaded. Use WAV or MP3.'}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-[11px] border-[#525252] text-[#d4d4d4] rounded-xl gap-1.5"
                  onClick={() => sampleInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {plugin.previewSampleName ? 'Replace Sample' : 'Choose Sample'}
                </Button>
              </div>
            </div>
          )}

          {micError && (
            <div className="text-[10px] text-[#ff3b30] mt-1">{micError}</div>
          )}

          {midiError && (
            <div className="text-[10px] text-[#ff6a55] mt-1">{midiError}</div>
          )}

          {sampleError && (
            <div className="text-[10px] text-[#ff6a55] mt-1">{sampleError}</div>
          )}

          {activePreviewMode === 'midi' && plugin.type !== 'effect' && (
            <MidiDeviceSelector
              enabled={true}
              onParamChange={handleParamChange}
              paramMap={paramMap}
            />
          )}

          {plugin.params.length > 0 && (
            <div
              className="rounded-[24px] border p-4 sm:p-5"
              style={{
                borderColor: 'rgba(255,255,255,0.08)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.018) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#6f6a64]">Live Controls</div>
                  <div className="mt-1 text-sm text-[#d7d0ca]">
                    Browser knobs drive the current `faustwasm` preview in real time.
                  </div>
                </div>
                <Badge variant="outline" className="border-[#ff8c61]/25 bg-[#ff8c61]/8 text-[#ffb08a] rounded-full">
                  {plugin.params.length} params
                </Badge>
              </div>

              {plugin.uiSpec ? (
                <PluginUiRenderer
                  uiSpec={plugin.uiSpec}
                  params={plugin.params}
                  onParamChange={handleParamChange}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {plugin.params.slice(0, 8).map((param) => {
                    const normalized = param.max === param.min ? 0 : (param.value - param.min) / (param.max - param.min);
                    const angle = normalized * 270 - 135;
                    return (
                      <label
                        key={param.name}
                        className="group relative overflow-hidden rounded-[20px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),rgba(255,255,255,0.015))] p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8f8881]">{param.name}</span>
                          <span className="font-mono text-[11px] text-[#f0e8df]">{param.value.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-center">
                          <div className="relative h-20 w-20 rounded-full border border-white/10 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.14),rgba(255,255,255,0.04)_38%,rgba(0,0,0,0.34)_100%)] shadow-[inset_0_10px_24px_rgba(255,255,255,0.03),0_18px_30px_rgba(0,0,0,0.22)]">
                            <div className="absolute inset-[10px] rounded-full border border-white/6" />
                            <div
                              className="absolute left-1/2 top-1/2 h-6 w-[2px] -translate-x-1/2 rounded-full bg-[#ff8c61] shadow-[0_0_14px_rgba(255,140,97,0.45)]"
                              style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)`, transformOrigin: 'bottom center' }}
                            />
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/6">
                          <div className="h-full rounded-full bg-[#ff8c61]/70" style={{ width: `${Math.max(0, Math.min(100, normalized * 100))}%` }} />
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.001}
                          value={normalized}
                          onChange={(e) => handleParamChange(param.name, Number(e.target.value))}
                          className="absolute inset-0 cursor-pointer opacity-0"
                          aria-label={`Adjust ${param.name}`}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <SpectrumAnalyzer spectrum={analysis.spectrum} height={80} />
          <FeatureReadouts
            centroid={displayFeatures.centroid}
            rms={displayFeatures.rms}
            zcr={displayFeatures.zcr}
            peakDb={displayFeatures.peakDb}
            isLive={previewPlaying && analysis.isActive}
            comparison={snapshotFeatures}
          />
          <div className="flex justify-end">
            <PreviewPlayer />
          </div>
        </div>

        {/* Refine input */}
        {!publicMode && (
          <div className="mt-6 rounded-xl border p-4" style={{ borderColor: C.border, background: C.void }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold tracking-wider text-[#525252]">REFINE</span>
              <span className="text-[10px] text-[#737373]">Describe a change to apply</span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="text"
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onRefine(refinePrompt); setRefinePrompt(''); } }}
                placeholder={sessionLocked ? 'Session expired. Signing out...' : 'e.g. make the decay longer'}
                disabled={sessionLocked}
                className="flex-1 bg-transparent text-sm font-mono outline-none placeholder:text-[#525252] min-w-0"
                style={{ color: C.text, caretColor: C.accent }}
              />
              <Button
                size="sm"
                className="h-10 px-4 text-[11px] font-bold rounded-xl gap-1.5 sm:self-auto"
                style={{ background: C.accent, color: C.void }}
                onClick={() => { onRefine(refinePrompt); setRefinePrompt(''); }}
                disabled={sessionLocked || !refinePrompt.trim() || refining}
              >
                {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {refining ? 'Applying...' : 'Apply'}
              </Button>
            </div>
          </div>
        )}

        {showSource && plugin.faustCode && (
          <div className="mt-6 rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.void }}>
            <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: C.border }}>
              <span className="text-[10px] font-bold tracking-wider text-[#525252]">FAUST SOURCE</span>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#737373] hover:text-[#e5e5e5]" onClick={() => {
                navigator.clipboard.writeText(plugin.faustCode).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? ' Copied' : ' Copy'}
              </Button>
            </div>
            <pre className="p-4 text-[11px] font-mono leading-relaxed overflow-auto max-h-[400px] hayashi-scroll whitespace-pre-wrap break-words" style={{ color: '#e5e5e5', overflowWrap: 'anywhere' }}>
              {plugin.faustCode || '// No Faust code generated yet'}
            </pre>
          </div>
        )}

        <div className="flex justify-center mt-6">
          <Button
            size="lg"
            className="rounded-full h-12 px-8 gap-2 text-sm font-bold"
            style={{ background: C.accent, color: C.void }}
            onClick={toggle}
            disabled={compiling || (activePreviewMode === 'sample' && !plugin.previewSampleBuffer)}
          >
            {compiling ? <Loader2 className="h-5 w-5 animate-spin" /> : previewPlaying ? <Square className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
            {compiling ? 'COMPILING...' : previewPlaying ? 'STOP' : 'PREVIEW'}
          </Button>
        </div>
      </div>
    </div>
  );
}
