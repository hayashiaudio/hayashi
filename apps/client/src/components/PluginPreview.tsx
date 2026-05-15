import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Play, Download, Code2, Copy, Check, Square, Loader2 } from 'lucide-react';
import { usePluginStore } from '@/stores/pluginStore';
import { usePluginPreview } from '@/hooks/usePluginPreview';
import { PreviewPlayer } from './PreviewPlayer';
import { exportPluginBinary } from '@/lib/api';
import { useDiscordSdk } from '@/hooks/useDiscordSdk';

const C = {
  border: 'rgba(255,255,255,0.06)',
  accent: '#ff8c61',
  text: '#e5e5e5',
  textMuted: '#737373',
  textDim: '#525252',
  void: '#0a0a0a',
} as const;

function formatParamValue(v: number, min: number, max: number) {
  if (max <= 1 && min >= 0) return `${Math.round(v * 100)}%`;
  if (max > 1000) return `${Math.round(v)}Hz`;
  return v.toFixed(2);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i, '_$1')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .replace(/\s+/g, '_') || 'plugin';
}

export function PluginPreview() {
  const { plugins, activePluginId } = usePluginStore();
  const { previewPlaying, compiling, toggle } = usePluginPreview();
  const [copied, setCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [exportFormat, setExportFormat] = useState<'vst3' | 'clap'>('vst3');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const discord = useDiscordSdk();

  const plugin = plugins.find((p) => p.id === activePluginId);
  if (!plugin) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(plugin.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleExport = async () => {
    if (!plugin.faustCode || exporting) return;
    const accessToken = discord.accessToken;
    if (!accessToken) {
      setExportError('Please sign in to export plugins');
      return;
    }
    setExporting(true);
    try {
      const result = await exportPluginBinary({
        accessToken,
        pluginName: plugin.name,
        pluginId: plugin.id,
        version: 'v1',
        faustCode: plugin.faustCode,
        format: exportFormat,
        guildId: discord.guildId,
        channelId: discord.channelId,
      });
      const blobRes = await fetch(result.downloadUrl);
      if (!blobRes.ok) throw new Error('Download failed');
      const blob = await blobRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(plugin.name)}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportError(null);
    } catch (err) {
      console.error('[Hayashi] Export failed:', err);
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-8 pb-12 max-w-4xl mx-auto">
      <div className="rounded-2xl border p-6 animate-slide-up" style={{ borderColor: C.border, background: '#111111' }}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-bold">{plugin.name}</h2>
              <Badge variant="outline" className="h-5 text-[10px] border-[#525252] text-[#737373] rounded-full capitalize">{plugin.type}</Badge>
            </div>
            <p className="text-xs text-[#525252] font-mono">{plugin.prompt}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-[11px] border-[#525252] text-[#737373] hover:text-[#e5e5e5] rounded-md gap-1.5" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[11px] border-[#ff8c61]/30 text-[#ff8c61] hover:bg-[#ff8c61]/10 rounded-md gap-1.5" onClick={() => setShowSource((s) => !s)}>
                  <Code2 className="h-3.5 w-3.5" /> FAUST
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{showSource ? 'Hide Source' : 'View Source'}</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                aria-label="Export format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'vst3' | 'clap')}
                className="h-8 text-[11px] bg-transparent border border-[#525252] text-[#737373] rounded-md px-2 outline-none"
              >
                <option value="vst3">VST3</option>
                <option value="clap">CLAP</option>
              </select>
              <Button
                size="sm"
                className="h-8 text-[11px] font-bold rounded-md gap-1.5"
                style={{ background: C.accent, color: C.void }}
                onClick={handleExport}
                disabled={exporting || !plugin.faustCode}
                aria-label={exporting ? 'Exporting plugin' : 'Export plugin'}
                aria-busy={exporting}
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exporting ? 'BUILDING...' : 'EXPORT'}
              </Button>
              {exportError && (
                <span className="text-[10px] text-[#ff3b30] ml-2">{exportError}</span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl p-6 mb-6 flex items-center justify-between" style={{ background: C.void, border: `1px solid ${C.border}` }}>
          <div className="flex items-end gap-[3px] h-20">
            {plugin.waveform.map((h, i) => (
              <div
                key={i}
                className="w-[4px] rounded-full"
                style={{
                  height: `${h}%`,
                  background: C.accent,
                  opacity: 0.3 + (i % 3) * 0.15,
                  animation: plugin.status === 'generating' ? `waveform-bounce ${0.8 + (i % 4) * 0.2}s ease-in-out infinite` : 'none',
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
          </div>
          <PreviewPlayer />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {plugin.params.map((param) => {
            const pct = ((param.value - param.min) / (param.max - param.min)) * 100;
            return (
              <div key={param.name} className="rounded-xl p-4 border" style={{ borderColor: C.border, background: C.void }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold tracking-wider text-[#737373]">{param.name}</span>
                  <span className="text-[10px] font-mono text-[#e5e5e5]">{formatParamValue(param.value, param.min, param.max)}</span>
                </div>
                <div className="relative h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                  <div className="absolute top-0 left-0 bottom-0 rounded-full" style={{ width: `${pct}%`, background: C.accent, opacity: 0.6 }} />
                </div>
                <div className="flex justify-center mt-3">
                  <div className="relative rounded-full" style={{ width: 36, height: 36, border: `2px solid rgba(255,140,97,0.25)` }}>
                    <div className="absolute top-1/2 left-1/2 w-0.5 h-3" style={{ background: C.accent, transform: `translate(-50%, -100%) rotate(${pct * 2.7 - 135}deg)`, transformOrigin: 'bottom center' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
            <pre className="p-4 text-[11px] font-mono leading-relaxed overflow-auto max-h-[400px] hayashi-scroll" style={{ color: '#e5e5e5' }}>
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
            disabled={compiling}
          >
            {compiling ? <Loader2 className="h-5 w-5 animate-spin" /> : previewPlaying ? <Square className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
            {compiling ? 'COMPILING...' : previewPlaying ? 'STOP' : 'PREVIEW'}
          </Button>
        </div>
      </div>
    </div>
  );
}
